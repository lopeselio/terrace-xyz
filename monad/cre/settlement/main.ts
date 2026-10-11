/**
 * Terrace settlement workflow (Chainlink CRE)
 *
 * Two jobs, both writing to TerraceOracle on Monad:
 *
 *   Fixtures  Pull upcoming matches for the configured leagues and schedule them,
 *             including kickoff changes when a match is moved.
 *   Results   For every match that has kicked off without a result, fetch it. Finished
 *             matches get their final score; postponed or cancelled ones are voided, which
 *             refunds every stake on them. Every node fetches on its own and the DON must
 *             agree on an identical answer before anything is written.
 *
 * Simulate with real writes:
 *   cre workflow simulate settlement --target staging-settings --broadcast
 */
import { consensusIdenticalAggregation, cre, json, ok, Runner, type HTTPSendRequester, type Runtime } from "@chainlink/cre-sdk";
import { encodeAbiParameters, type Hex } from "viem";
import { z } from "zod";
import { FIXTURE, ORACLE_ABI, REPORT } from "../shared/abi";
import { evmClient, read, writeReport } from "../shared/chain";

const configSchema = z.object({
  resultsSchedule: z.string(), // e.g. "0 */5 * * * *"
  fixturesSchedule: z.string(), // e.g. "0 0 */6 * * *"
  resultsApiBaseUrl: z.string(), // API-Football v3, or the replay server for demos
  leagues: z.array(z.object({ id: z.number(), season: z.number() })), // e.g. [{ id: 39, season: 2026 }] = Premier League
  daysAhead: z.number(),
  maxFixturesPerRun: z.number(), // API-Football accepts up to 20 ids per request
  maxNewFixtures: z.number(), // new matches scheduled per fixtures run
  chainSelectorName: z.string(),
  chainId: z.number(),
  oracleAddress: z.string(),
  gasLimit: z.string(),
  simulation: z.boolean(),
});
type Config = z.infer<typeof configSchema>;

const authHeaders = (apiKey: string) => ({ "x-apisports-key": { values: [apiKey] } });

const attestorKey = (runtime: Runtime<Config>): Hex | undefined =>
  runtime.config.simulation
    ? (runtime.getSecret({ id: "CRE_SIM_ATTESTOR_PRIVATE_KEY" }).result().value as Hex)
    : undefined;

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  goals: { home: number | null; away: number | null };
};

const FINISHED = new Set(["FT", "AET", "PEN"]);
const CALLED_OFF = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

const getFixtures = (send: HTTPSendRequester, url: string, apiKey: string): ApiFixture[] => {
  const res = send.sendRequest({ url, method: "GET", multiHeaders: authHeaders(apiKey) }).result();
  if (!ok(res)) throw new Error(`football API returned ${res.statusCode}`);
  const body = json(res) as { errors?: unknown; response?: ApiFixture[] };
  const errors = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
  if (errors) throw new Error(`football API error: ${JSON.stringify(body.errors)}`);
  return body.response ?? [];
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Runs on each node. One request for the whole batch; returns a compact, sorted string so
 * identical consensus is trivial: "id:FINAL:h:a,id:VOID,id:PENDING,..."
 */
const fetchResults = (send: HTTPSendRequester, url: string, apiKey: string): string =>
  getFixtures(send, url, apiKey)
    .map((f) => {
      const status = f.fixture.status.short;
      if (FINISHED.has(status) && f.goals.home !== null && f.goals.away !== null) {
        return `${f.fixture.id}:FINAL:${f.goals.home}:${f.goals.away}`;
      }
      return `${f.fixture.id}:${CALLED_OFF.has(status) ? "VOID" : "PENDING"}`;
    })
    .sort()
    .join(",");

const onResults = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const evm = evmClient(cfg);
  const pending = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "pendingFixtures");
  if (pending.length === 0) return "no matches waiting for a result";

  const apiKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();
  // Rotate through everything waiting, so a postponed match can't hog the batch while live ones wait.
  const size = Math.min(cfg.maxFixturesPerRun, 20);
  const start = (Math.floor(runtime.now().getTime() / 300_000) % Math.ceil(pending.length / size)) * size;
  const batch = pending.slice(start, start + size);
  const agreed = http
    .sendRequest(runtime, fetchResults, consensusIdenticalAggregation<string>())(
      `${cfg.resultsApiBaseUrl}/fixtures?ids=${batch.join("-")}`,
      apiKey,
    )
    .result();

  const ids: bigint[] = [];
  const states: number[] = [];
  const home: number[] = [];
  const away: number[] = [];
  for (const entry of agreed ? agreed.split(",") : []) {
    const [id, state, h, a] = entry.split(":");
    runtime.log(`match ${id}: ${state}${state === "FINAL" ? ` ${h}-${a}` : ""}`);
    if (state === "PENDING") continue;
    ids.push(BigInt(id));
    states.push(state === "VOID" ? FIXTURE.VOID : FIXTURE.FINAL);
    home.push(state === "VOID" ? 0 : Number(h));
    away.push(state === "VOID" ? 0 : Number(a));
  }
  if (ids.length === 0) return "nothing finished yet";

  const payload = encodeAbiParameters(
    [{ type: "uint256[]" }, { type: "uint8[]" }, { type: "uint8[]" }, { type: "uint8[]" }],
    [ids, states, home, away],
  );
  const status = writeReport(runtime as Runtime<unknown>, cfg, REPORT.RESULTS, payload, attestorKey(runtime));
  runtime.log(`settled ${ids.length} match(es); tx ${status}`);
  return `settled ${ids.length}`;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Runs on each node. Returns "id@kickoff,..." for matches with a confirmed kickoff, sorted. */
const fetchSchedule = (send: HTTPSendRequester, url: string, apiKey: string): string =>
  getFixtures(send, url, apiKey)
    .filter((f) => f.fixture.status.short === "NS") // TBD = no confirmed kickoff yet
    .map((f) => `${f.fixture.id}@${Math.floor(Date.parse(f.fixture.date) / 1000)}`)
    .sort()
    .join(",");

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const onFixtures = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const apiKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();
  const known = new Set(read(runtime, evmClient(cfg), cfg.oracleAddress, ORACLE_ABI, "fixtureIds").map(String));

  const from = runtime.now();
  const to = new Date(from.getTime() + cfg.daysAhead * 86_400_000);
  const upcoming: { id: bigint; kickoff: bigint }[] = [];
  // CRE allows 15 HTTP calls per run: take the leagues in groups of 14, a different group every 10 minutes.
  const groups = Math.ceil(cfg.leagues.length / 14);
  const group = Math.floor(from.getTime() / 600_000) % groups;
  for (const league of cfg.leagues.slice(group * 14, group * 14 + 14)) {
    const url = `${cfg.resultsApiBaseUrl}/fixtures?league=${league.id}&season=${league.season}&from=${isoDate(from)}&to=${isoDate(to)}`;
    const agreed = http.sendRequest(runtime, fetchSchedule, consensusIdenticalAggregation<string>())(url, apiKey).result();
    for (const entry of agreed ? agreed.split(",") : []) {
      const [id, kickoff] = entry.split("@");
      if (!known.has(id)) upcoming.push({ id: BigInt(id), kickoff: BigInt(kickoff) });
    }
  }
  if (upcoming.length === 0) return "no new matches";

  // Soonest first, a bounded batch per run; Monad bills the gas limit, so size it to the batch.
  upcoming.sort((a, b) => Number(a.kickoff - b.kickoff));
  const batch = upcoming.slice(0, cfg.maxNewFixtures);
  const payload = encodeAbiParameters([{ type: "uint256[]" }, { type: "uint64[]" }], [batch.map((f) => f.id), batch.map((f) => f.kickoff)]);
  const gas = String(150_000 + 75_000 * batch.length);
  const status = writeReport(runtime as Runtime<unknown>, cfg, REPORT.FIXTURES, payload, attestorKey(runtime), gas);
  runtime.log(`scheduled ${batch.length} new match(es) of ${upcoming.length}; tx ${status}`);
  return `scheduled ${batch.length}`;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [
    cre.handler(cron.trigger({ schedule: config.resultsSchedule }), onResults),
    cre.handler(cron.trigger({ schedule: config.fixturesSchedule }), onFixtures),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

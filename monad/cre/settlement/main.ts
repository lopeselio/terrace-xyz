/**
 * Terrace settlement workflow (Chainlink CRE)
 *
 * Two jobs, both writing to TerraceOracle on Monad:
 *
 *   Fixtures  Pull upcoming matches for the configured competitions and schedule them,
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
  resultsApiBaseUrl: z.string(), // football-data.org v4, or the replay server for demos
  competitions: z.array(z.string()), // e.g. ["PL", "CL"]
  daysAhead: z.number(),
  maxFixturesPerRun: z.number(),
  chainSelectorName: z.string(),
  chainId: z.number(),
  oracleAddress: z.string(),
  gasLimit: z.string(),
  simulation: z.boolean(),
});
type Config = z.infer<typeof configSchema>;

const authHeaders = (apiKey: string) => ({ "X-Auth-Token": { values: [apiKey] } });

const attestorKey = (runtime: Runtime<Config>): Hex | undefined =>
  runtime.config.simulation
    ? (runtime.getSecret({ id: "CRE_SIM_ATTESTOR_PRIVATE_KEY" }).result().value as Hex)
    : undefined;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Runs on each node. Compact string so identical consensus is trivial:
 *   "FINAL:<home>:<away>" | "VOID" | "PENDING"
 * Expects the football-data.org v4 match shape; the replay server returns the same.
 */
const fetchResult = (send: HTTPSendRequester, url: string, apiKey: string): string => {
  const res = send.sendRequest({ url, method: "GET", multiHeaders: authHeaders(apiKey) }).result();
  if (!ok(res)) throw new Error(`results API returned ${res.statusCode}`);
  const body = json(res) as {
    status?: string;
    score?: { fullTime?: { home?: number | null; away?: number | null } };
  };
  const home = body.score?.fullTime?.home;
  const away = body.score?.fullTime?.away;
  if (body.status === "FINISHED" && typeof home === "number" && typeof away === "number") {
    return `FINAL:${home}:${away}`;
  }
  if (body.status === "POSTPONED" || body.status === "CANCELLED") return "VOID";
  return "PENDING";
};

const onResults = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const evm = evmClient(cfg);
  const pending = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "pendingFixtures");
  if (pending.length === 0) return "no matches waiting for a result";

  const apiKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();

  const ids: bigint[] = [];
  const states: number[] = [];
  const home: number[] = [];
  const away: number[] = [];
  for (const id of pending.slice(0, cfg.maxFixturesPerRun)) {
    const agreed = http
      .sendRequest(runtime, fetchResult, consensusIdenticalAggregation<string>())(`${cfg.resultsApiBaseUrl}/matches/${id}`, apiKey)
      .result();
    runtime.log(`match ${id}: ${agreed}`);
    if (agreed === "PENDING") continue;
    const [, h, a] = agreed.split(":");
    ids.push(id);
    states.push(agreed === "VOID" ? FIXTURE.VOID : FIXTURE.FINAL);
    home.push(agreed === "VOID" ? 0 : Number(h));
    away.push(agreed === "VOID" ? 0 : Number(a));
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

/** Runs on each node. Returns "id@kickoff,id@kickoff,..." sorted by id. */
const fetchFixtures = (send: HTTPSendRequester, url: string, apiKey: string): string => {
  const res = send.sendRequest({ url, method: "GET", multiHeaders: authHeaders(apiKey) }).result();
  if (!ok(res)) throw new Error(`fixtures API returned ${res.statusCode}`);
  const body = json(res) as { matches?: { id: number; utcDate: string; status: string }[] };
  return (body.matches ?? [])
    .filter((m) => m.status === "SCHEDULED" || m.status === "TIMED")
    .map((m) => `${m.id}@${Math.floor(Date.parse(m.utcDate) / 1000)}`)
    .sort()
    .join(",");
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const onFixtures = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const apiKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();

  const from = runtime.now();
  const to = new Date(from.getTime() + cfg.daysAhead * 86_400_000);
  const ids: bigint[] = [];
  const kickoffs: bigint[] = [];
  for (const code of cfg.competitions) {
    const url = `${cfg.resultsApiBaseUrl}/competitions/${code}/matches?dateFrom=${isoDate(from)}&dateTo=${isoDate(to)}`;
    const agreed = http.sendRequest(runtime, fetchFixtures, consensusIdenticalAggregation<string>())(url, apiKey).result();
    for (const entry of agreed ? agreed.split(",") : []) {
      const [id, kickoff] = entry.split("@");
      ids.push(BigInt(id));
      kickoffs.push(BigInt(kickoff));
    }
  }
  if (ids.length === 0) return "no upcoming matches";

  const payload = encodeAbiParameters([{ type: "uint256[]" }, { type: "uint64[]" }], [ids, kickoffs]);
  const status = writeReport(runtime as Runtime<unknown>, cfg, REPORT.FIXTURES, payload, attestorKey(runtime));
  runtime.log(`scheduled ${ids.length} match(es); tx ${status}`);
  return `scheduled ${ids.length}`;
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

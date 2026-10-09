/**
 * Terrace settlement workflow (Chainlink CRE, TypeScript SDK)
 *
 * Every few minutes:
 *   1. Read TerraceLeagues.pendingFixtures() on Monad testnet (kicked off, no result yet)
 *   2. For each fixture, fetch the match from the results API; every node fetches
 *      independently and the DON must agree on an identical answer
 *   3. ABI-encode the finished results and write ONE signed report to TerraceLeagues.onReport()
 *
 * Simulate with real onchain writes:
 *   cre workflow simulate settlement --target staging-settings --broadcast
 */
import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  prepareReportRequest,
  Runner,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, zeroAddress, type Address } from "viem";
import { z } from "zod";

const configSchema = z.object({
  schedule: z.string(),            // e.g. "0 */5 * * * *" (every 5 minutes)
  resultsApiBaseUrl: z.string(),   // e.g. "https://api.football-data.org/v4" or your replay server
  chainSelectorName: z.string(),   // "monad-testnet"
  leaguesAddress: z.string(),      // deployed TerraceLeagues
  gasLimit: z.string(),            // e.g. "500000"
  maxFixturesPerRun: z.number(),   // keep under the per-run HTTP budget, e.g. 8
});
type Config = z.infer<typeof configSchema>;

const LEAGUES_ABI = [
  {
    type: "function",
    name: "pendingFixtures",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "ids", type: "uint256[]" }],
  },
] as const;

/**
 * Runs on each node. Returns a compact string so identical-consensus is trivial:
 *   "FINISHED:<home>:<away>"  or  "PENDING"
 * Expects the football-data.org v4 match shape:
 *   { status: "FINISHED", score: { fullTime: { home: number, away: number } } }
 * A replay server only needs to return the same shape.
 */
const fetchMatch = (sendRequester: HTTPSendRequester, url: string, apiKey: string): string => {
  const response = sendRequester
    .sendRequest({
      url,
      method: "GET",
      multiHeaders: { "X-Auth-Token": { values: [apiKey] } },
    })
    .result();

  if (!ok(response)) {
    throw new Error(`results API returned ${response.statusCode}`);
  }

  const body = json(response) as {
    status?: string;
    score?: { fullTime?: { home?: number | null; away?: number | null } };
  };

  const home = body.score?.fullTime?.home;
  const away = body.score?.fullTime?.away;
  if (body.status === "FINISHED" && typeof home === "number" && typeof away === "number") {
    return `FINISHED:${home}:${away}`;
  }
  return "PENDING";
};

const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown network ${cfg.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // 1) Which fixtures need a result?
  const call = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: cfg.leaguesAddress as Address,
        data: encodeFunctionData({ abi: LEAGUES_ABI, functionName: "pendingFixtures" }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const pending = decodeFunctionResult({
    abi: LEAGUES_ABI,
    functionName: "pendingFixtures",
    data: bytesToHex(call.data),
  }) as readonly bigint[];

  if (pending.length === 0) {
    runtime.log("No fixtures awaiting results.");
    return "noop";
  }

  // 2) Fetch results. Secrets must be read in DON mode, then passed into the node function.
  const apiKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();

  const ids: bigint[] = [];
  const home: number[] = [];
  const away: number[] = [];

  for (const fixtureId of pending.slice(0, cfg.maxFixturesPerRun)) {
    const url = `${cfg.resultsApiBaseUrl}/matches/${fixtureId.toString()}`;
    const agreed = http
      .sendRequest(runtime, fetchMatch, consensusIdenticalAggregation<string>())(url, apiKey)
      .result();

    runtime.log(`fixture ${fixtureId.toString()}: ${agreed}`);
    if (!agreed.startsWith("FINISHED:")) continue;

    const [, h, a] = agreed.split(":");
    ids.push(fixtureId);
    home.push(Number(h));
    away.push(Number(a));
  }

  if (ids.length === 0) return "nothing finished yet";

  // 3) One signed report for the whole batch -> TerraceLeagues.onReport(metadata, report)
  const payload = encodeAbiParameters(
    [{ type: "uint256[]" }, { type: "uint8[]" }, { type: "uint8[]" }],
    [ids, home, away],
  );
  const report = runtime.report(prepareReportRequest(payload)).result();

  const tx = evm
    .writeReport(runtime, {
      receiver: cfg.leaguesAddress,
      report,
      gasConfig: { gasLimit: cfg.gasLimit },
    })
    .result();

  runtime.log(`settled ${ids.length} fixture(s); tx status ${tx.txStatus}`);
  return `settled ${ids.length}`;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

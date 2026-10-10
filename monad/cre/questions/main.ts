/**
 * Terrace questions workflow (Chainlink CRE)
 *
 * Answers custom yes/no questions ("Will Saka score?") once they close:
 *   1. Read TerraceOracle.pendingQuestions() on Monad.
 *   2. For questions about a match, wait for the final score and fetch the match details.
 *   3. Every node asks the AI model (Gemini or Claude, with live web search) on its own;
 *      the DON only accepts an answer all nodes agree on.
 *   4. Write the agreed answers in one report. VOID refunds everyone on that question.
 *
 *   cre workflow simulate questions --target staging-settings --broadcast
 */
import { consensusIdenticalAggregation, cre, json, ok, Runner, type HTTPSendRequester, type Runtime } from "@chainlink/cre-sdk";
import { encodeAbiParameters, type Hex } from "viem";
import { z } from "zod";
import { askVerdict, type AiProvider, type QuestionContext, type Verdict } from "../shared/ai";
import { ANSWER, FIXTURE, ORACLE_ABI, REPORT } from "../shared/abi";
import { evmClient, read, writeReport } from "../shared/chain";

const configSchema = z.object({
  schedule: z.string(),
  aiProvider: z.enum(["gemini", "anthropic"]),
  aiModel: z.string(), // e.g. "gemini-2.5-flash" or "claude-opus-5-5"
  resultsApiBaseUrl: z.string(),
  maxQuestionsPerRun: z.number(),
  chainSelectorName: z.string(),
  chainId: z.number(),
  oracleAddress: z.string(),
  gasLimit: z.string(),
  simulation: z.boolean(),
});
type Config = z.infer<typeof configSchema>;

const VERDICT_TO_ANSWER: Record<Exclude<Verdict, "PENDING">, number> = {
  YES: ANSWER.YES,
  NO: ANSWER.NO,
  VOID: ANSWER.VOID,
};

/** Runs on each node: "Arsenal 2-1 Chelsea (Premier League, 2026-10-11)". */
const fetchMatchLine = (send: HTTPSendRequester, url: string, apiKey: string): string => {
  const res = send.sendRequest({ url, method: "GET", multiHeaders: { "X-Auth-Token": { values: [apiKey] } } }).result();
  if (!ok(res)) throw new Error(`results API returned ${res.statusCode}`);
  const m = json(res) as {
    utcDate?: string;
    competition?: { name?: string };
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
    score?: { fullTime?: { home?: number | null; away?: number | null } };
  };
  const ft = m.score?.fullTime;
  return `${m.homeTeam?.name ?? "Home"} ${ft?.home ?? "?"}-${ft?.away ?? "?"} ${m.awayTeam?.name ?? "Away"} (${m.competition?.name ?? "football"}, ${(m.utcDate ?? "").slice(0, 10)})`;
};

const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const evm = evmClient(cfg);
  const pending = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "pendingQuestions");
  if (pending.length === 0) return "no questions waiting";

  const aiKey = runtime
    .getSecret({ id: cfg.aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY" })
    .result().value;
  const resultsKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  const http = new cre.capabilities.HTTPClient();

  const ids: bigint[] = [];
  const answers: number[] = [];
  for (const id of pending.slice(0, cfg.maxQuestionsPerRun)) {
    const q = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "getQuestion", [id]);
    const ctx: QuestionContext = { question: q.text, closedAt: new Date(Number(q.closeTime) * 1000).toISOString() };

    if (q.fixtureId !== 0n) {
      const [state] = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "fixtureResult", [q.fixtureId]);
      if (state === FIXTURE.PENDING) {
        runtime.log(`question ${id}: waiting for the match result`);
        continue;
      }
      ctx.match = http
        .sendRequest(runtime, fetchMatchLine, consensusIdenticalAggregation<string>())(
          `${cfg.resultsApiBaseUrl}/matches/${q.fixtureId}`,
          resultsKey,
        )
        .result();
    }

    const verdict = http
      .sendRequest(runtime, askVerdict, consensusIdenticalAggregation<Verdict>())(
        cfg.aiProvider as AiProvider,
        cfg.aiModel,
        aiKey,
        ctx,
      )
      .result();
    runtime.log(`question ${id} "${q.text}": ${verdict}`);
    if (verdict === "PENDING") continue;
    ids.push(id);
    answers.push(VERDICT_TO_ANSWER[verdict]);
  }
  if (ids.length === 0) return "no answers yet";

  const attestorKey = cfg.simulation
    ? (runtime.getSecret({ id: "CRE_SIM_ATTESTOR_PRIVATE_KEY" }).result().value as Hex)
    : undefined;
  const payload = encodeAbiParameters([{ type: "uint256[]" }, { type: "uint8[]" }], [ids, answers]);
  const status = writeReport(runtime as Runtime<unknown>, cfg, REPORT.ANSWERS, payload, attestorKey);
  runtime.log(`answered ${ids.length} question(s); tx ${status}`);
  return `answered ${ids.length}`;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

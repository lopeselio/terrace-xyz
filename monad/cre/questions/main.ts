/**
 * Terrace questions workflow (Chainlink CRE)
 *
 * Settles custom questions and chat takes once they close:
 *   1. Read TerraceOracle.pendingQuestions() on Monad.
 *   2. Take with a rule: fetch the match from API-Football and evaluate the rule (shared/rules.ts).
 *      Pure data, so every node agrees; "at least" takes settle the moment they happen.
 *   3. Take without a rule: once the match is over, the AI judge (Gemini or Claude, with web
 *      search) rules on it with the match's events as evidence. Nodes must agree or it retries.
 *   4. Write all agreed answers in one report. VOID refunds everyone on that question.
 *
 *   cre workflow simulate questions --target staging-settings --broadcast
 */
import { consensusIdenticalAggregation, cre, json, ok, Runner, type HTTPSendRequester, type Runtime } from "@chainlink/cre-sdk";
import { encodeAbiParameters, hexToString, type Hex } from "viem";
import { z } from "zod";
import { askVerdict, type AiProvider } from "../shared/ai";
import { ANSWER, ORACLE_ABI, REPORT } from "../shared/abi";
import { evmClient, nowSeconds, read, writeReport } from "../shared/chain";
import { evaluate, evidence, matchOver, parseRule, type FixtureDetail, type Verdict } from "../shared/rules";

const configSchema = z.object({
  schedule: z.string(), // every minute while matches are live: "0 * * * * *"
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

const VERDICT_TO_ANSWER: Record<Exclude<Verdict, "PENDING">, number> = { YES: ANSWER.YES, NO: ANSWER.NO, VOID: ANSWER.VOID };

const fetchFixture = (send: HTTPSendRequester, url: string, apiKey: string): FixtureDetail | null => {
  const res = send.sendRequest({ url, method: "GET", multiHeaders: { "x-apisports-key": { values: [apiKey] } } }).result();
  if (!ok(res)) throw new Error(`football API returned ${res.statusCode}`);
  const body = json(res) as { response?: FixtureDetail[] };
  return body.response?.[0] ?? null;
};

/** Node mode: settle a take that carries a rule. */
const settleByRule = (send: HTTPSendRequester, url: string, apiKey: string, ruleJson: string): Verdict => {
  const rule = parseRule(ruleJson);
  if (!rule) return "VOID"; // a broken rule can't be settled fairly: refund
  const fixture = fetchFixture(send, url, apiKey);
  return fixture ? evaluate(rule, fixture) : "PENDING";
};

/** Node mode: ask the AI judge, with the match's events as evidence when there is a match. */
const settleByJudge = (
  send: HTTPSendRequester,
  url: string,
  apiKey: string,
  provider: AiProvider,
  model: string,
  aiKey: string,
  question: string,
  closedAt: string,
): Verdict => {
  const fixture = url ? fetchFixture(send, url, apiKey) : null;
  // Judge from the match itself, not from the oracle's result: if posting results stalls, takes would
  // otherwise sit until RESOLVE_GRACE and void. One API call and no AI call while the match is on.
  if (url && (!fixture || !matchOver(fixture))) return "PENDING";
  return askVerdict(send, provider, model, aiKey, {
    question,
    closedAt,
    match: fixture ? evidence(fixture as never) : undefined,
  });
};

const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const evm = evmClient(cfg);
  const pending = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "pendingQuestions");
  if (pending.length === 0) return "no questions waiting";

  const resultsKey = runtime.getSecret({ id: "RESULTS_API_KEY" }).result().value;
  let aiKey: string | undefined;
  const http = new cre.capabilities.HTTPClient();
  const now = nowSeconds(runtime as Runtime<unknown>);

  const ids: bigint[] = [];
  const answers: number[] = [];
  for (const id of pending.slice(0, cfg.maxQuestionsPerRun)) {
    const q = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "getQuestion", [id]);
    const url = q.fixtureId !== 0n ? `${cfg.resultsApiBaseUrl}/fixtures?id=${q.fixtureId}` : "";
    let verdict: Verdict;

    if (q.spec !== "0x" && url) {
      verdict = http
        .sendRequest(runtime, settleByRule, consensusIdenticalAggregation<Verdict>())(url, resultsKey, hexToString(q.spec as Hex))
        .result();
    } else {
      // Rule-less takes wait for full time so the judge sees the whole match (checked in settleByJudge).
      aiKey ??= runtime.getSecret({ id: cfg.aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY" }).result().value;
      const closedAt = new Date(Number(read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "closeTimeOf", [id])) * 1000).toISOString();
      verdict = http
        .sendRequest(runtime, settleByJudge, consensusIdenticalAggregation<Verdict>())(
          url,
          resultsKey,
          cfg.aiProvider as AiProvider,
          cfg.aiModel,
          aiKey,
          q.text,
          closedAt,
        )
        .result();
    }

    runtime.log(`question ${id} "${q.text}": ${verdict}${q.spec !== "0x" ? " (rule)" : " (judge)"}`);
    if (verdict === "PENDING") continue;
    ids.push(id);
    answers.push(VERDICT_TO_ANSWER[verdict]);
  }
  if (ids.length === 0) return `no answers yet (checked at ${now})`;

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

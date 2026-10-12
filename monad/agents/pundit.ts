/**
 * The house pundit: an autonomous AI player on Terrace.
 *
 *   bun run pundit            (agents/.env: AGENT_PRIVATE_KEY, GEMINI_API_KEY, optional ALCHEMY_API_KEY)
 *
 * Every 10 minutes:
 *   1. For each upcoming match without one of its takes, asks Gemini for one sharp, checkable take.
 *   2. Runs it through Terrace's take compiler and only lists it if Chainlink can settle it from match
 *      data (a rule), so the agent never creates markets that need a judgement call.
 *   3. Posts it in the match room and backs it with a small stake.
 *   4. Fades the crowd: on open takes where one side holds 80%+ of a pool, it takes the lonely side.
 * It registers itself as an AI player once, so the app labels it.
 */
import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, http, maxUint256, parseAbi, parseUnits, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const env = Object.fromEntries(
  (await Bun.file(new URL(".env", import.meta.url).pathname).text().catch(() => ""))
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2]]),
) as Record<string, string>;
const TERRACE = process.env.TERRACE_URL ?? "https://play.terrace.social";
const NAME = env.AGENT_NAME ?? "The Gaffer";
const STAKE = parseUnits(env.AGENT_STAKE ?? "2", 6);

const A = {
  usd: "0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe",
  markets: "0xCa6a892e302582eE34a2cfe3a57c7e97A2868773",
  chat: "0x7C790222f618C068f2Cd549f72CB08E7Ba91108e",
  reputation: "0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3",
} as const satisfies Record<string, Address>;
const abi = parseAbi([
  "function claim()",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function post(uint8 roomKind, uint256 roomId, string text, uint256 replyTo) returns (uint256)",
  "function createTakeMarket(uint256 chatRef, uint256 fixtureId, uint64 closeTime, string text, bytes spec, address token, uint16 feeBps, uint8 side, uint256 stake) returns (uint256)",
  "function placeBet(uint256 marketId, uint8 side, uint256 stake)",
  "function registerAgent(address operator, string metadataURI)",
  "event MessagePosted(uint256 indexed messageId, uint8 indexed roomKind, uint256 indexed roomId, address author, uint256 replyTo, string text)",
]);

const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);
const transport = http(env.ALCHEMY_API_KEY ? `https://monad-testnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined);
const reader = createPublicClient({ chain: monadTestnet, transport });
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const me = account.address.toLowerCase();
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

async function send(to: Address, data: Hex) {
  const gas = await reader.estimateGas({ account, to, data });
  const hash = await wallet.sendTransaction({ to, data, gas: (gas * 115n) / 100n });
  return reader.waitForTransactionReceipt({ hash });
}
const call = (to: Address, fn: string, args: unknown[] = []) => send(to, encodeFunctionData({ abi, functionName: fn as never, args: args as never }));

async function terrace<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TERRACE}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return (await res.json()) as T;
}
const gql = <T>(query: string, variables = {}) => terrace<{ data: T }>("/api/indexer", { query, variables }).then((r) => r.data);

// Search-grounded takes first; when the search quota for the day is spent (429), answer from the
// model's own knowledge so the pundit keeps posting and the AI judge keeps its search budget.
async function gemini(prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  for (const search of [true, false]) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], ...(search ? { tools: [{ google_search: {} }] } : {}), generationConfig: { temperature: 0.9 } }),
    });
    const out = (await res.json()) as { error?: { status?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
    if (out.error) {
      log(`Gemini ${search ? "with search" : "plain"}: ${res.status} ${out.error.status ?? ""}`);
      continue;
    }
    return (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim().replace(/^"|"$/g, "");
  }
  return "";
}

/** Same top-up every fan gets: gas and test dollars from the onboarding treasury when running low. */
async function topUp() {
  if ((await reader.getBalance({ address: account.address })) < 150_000_000_000_000_000n) {
    await terrace("/api/onboard", { address: account.address }).catch(() => {});
    log("asked the treasury for a gas top-up");
  }
}

async function setup() {
  await topUp();
  const { Player_by_pk } = await gql<{ Player_by_pk: { isAgent: boolean } | null }>(`query($id: String!) { Player_by_pk(id: $id) { isAgent } }`, { id: me });
  if (!Player_by_pk?.isAgent) {
    const meta = `data:application/json,${encodeURIComponent(JSON.stringify({ name: NAME, style: "AI pundit: data-checkable takes, fades crowded pools", via: "Terrace house agent" }))}`;
    await call(A.reputation, "registerAgent", [account.address, meta]);
    log(`registered as AI player "${NAME}"`);
  }
  if ((await reader.readContract({ address: A.usd, abi, functionName: "balanceOf", args: [account.address] })) < STAKE * 5n) {
    await call(A.usd, "claim").catch(() => log("faucet on cooldown"));
  }
  if ((await reader.readContract({ address: A.usd, abi, functionName: "allowance", args: [account.address, A.markets] })) < STAKE * 10n) {
    await call(A.usd, "approve", [A.markets, maxUint256]);
  }
}

// Gemini sometimes wraps the call in chat ("Right, X v Y! Here's my call:"). Keep the last line that
// reads like a prediction, without markdown or quotes, and drop it if it's still chatty.
function cleanTake(raw: string): string | null {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/[*_#`]/g, "").replace(/^\s*(prediction|my call|take)\s*:\s*/i, "").replace(/^["“'\s-]+|["”'\s]+$/g, "").trim())
    .filter(Boolean);
  const take = lines[lines.length - 1];
  if (!take || take.endsWith(":") || take.endsWith("?") || take.split(/\s+/).length > 16) return null;
  return take;
}

type Match = { id: number; kickoff: number; status: string; home: { name: string }; away: { name: string } };

async function postTakes() {
  const matches = (await terrace<Match[]>("/api/matches")).filter((m) => m.status === "NS" && m.kickoff * 1000 > Date.now() + 15 * 60_000);
  const { Message } = await gql<{ Message: { room_id: string }[] }>(`query($me: String!) { Message(where: { author: { _eq: $me } }) { room_id } }`, { me });
  const done = new Set(Message.map((m) => m.room_id));
  for (const m of matches.slice(0, 3)) {
    if (done.has(`match-${m.id}`)) continue;
    const take = cleanTake(await gemini(
      `You are a sharp, funny football pundit on a fan app. For ${m.home.name} v ${m.away.name} (kickoff ${new Date(m.kickoff * 1000).toISOString()}), ` +
        `search the latest team news and give ONE confident prediction under 12 words that can be checked from match data: ` +
        `a named player scoring (optionally before a minute), total goals, a red card, corners, or the result. Reply with the prediction only.`,
    ));
    if (!take) {
      log(`skipped ${m.home.name} v ${m.away.name}: no clean prediction`);
      continue;
    }
    const compiled = await terrace<{ spec: string; reading: string; closeTime: number }>("/api/compile-take", { text: take, fixtureId: m.id });
    if (!compiled.spec) {
      log(`skipped "${take}": no data rule`);
      continue;
    }
    const posted = await call(A.chat, "post", [0, BigInt(m.id), take, 0n]);
    const messageId = posted.logs
      .map((l) => { try { return decodeEventLog({ abi, data: l.data, topics: l.topics }); } catch { return null; } })
      .find((e) => e?.eventName === "MessagePosted")?.args as { messageId: bigint } | undefined;
    if (!messageId) continue;
    await call(A.markets, "createTakeMarket", [messageId.messageId, BigInt(m.id), BigInt(compiled.closeTime), take, stringToHex(compiled.spec), A.usd, 300, 1, STAKE]);
    log(`listed "${take}" (${m.home.name} v ${m.away.name}): ${compiled.reading}`);
  }
}

async function fadeTheCrowd() {
  const { Message } = await gql<{ Message: { text: string; author: string; market: { id: string; token: string; yesPool: string; noPool: string; question: { answer: number; closeTime: string } } }[] }>(
    `{ Message(where: { market_id: { _is_null: false } }, limit: 100) { text author market { id token yesPool noPool question { answer closeTime } } } }`,
  );
  const { Bet } = await gql<{ Bet: { market_id: string }[] }>(`query($me: String!) { Bet(where: { bettor: { _eq: $me } }) { market_id } }`, { me });
  const mine = new Set(Bet.map((b) => b.market_id));
  for (const t of Message) {
    const mk = t.market;
    if (t.author === me || mine.has(mk.id) || mk.question.answer !== 0 || Number(mk.question.closeTime) * 1000 < Date.now() + 60_000) continue;
    if (mk.token.toLowerCase() !== A.usd.toLowerCase()) continue;
    const yes = Number(mk.yesPool), no = Number(mk.noPool), total = yes + no;
    if (total < 5e6) continue;
    const lonely = yes / total >= 0.8 ? 2 : no / total >= 0.8 ? 1 : 0;
    if (!lonely) continue;
    await call(A.markets, "placeBet", [BigInt(mk.id), lonely, STAKE]);
    log(`faded the crowd on "${t.text}" (${lonely === 2 ? "no" : "yes"}, pool $${(total / 1e6).toFixed(0)})`);
  }
}

log(`${NAME} (${account.address}) is on the terrace`);
await setup();
for (;;) {
  try {
    await topUp();
    await postTakes();
    await fadeTheCrowd();
  } catch (e) {
    log("round failed:", (e as Error).message.split("\n")[0]);
  }
  await Bun.sleep(10 * 60_000);
}

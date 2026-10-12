/**
 * Terrace House: opening liquidity for new markets.
 *
 * A fresh pari-mutuel market has no price until fans bet, and the first $5 swings it wildly. The
 * house seeds each new market once, on both sides, so it opens at a real price:
 *   - match markets (result, goals, both teams to score) at the bookmakers' line,
 *   - chat takes with no outside price at evens.
 * One account can only back one side of a market, so the house runs two wallets: one backs Yes,
 * the other No. Both are registered as house agents, so they never earn Terrace Points or rank.
 *
 * Limits: SEED per market (default $20), DAILY_CAP across both wallets (default $300), only
 * markets with at most one fan in (usually the take's author), never sealed or flash markets.
 *
 *   bun run house        (keys are created in agents/.env on first run; nothing secret is printed)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { bytesToHex, createPublicClient, createWalletClient, encodeFunctionData, http, maxUint256, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const envPath = new URL(".env", import.meta.url).pathname;
const statePath = new URL(".house-state.json", import.meta.url).pathname;

// Two keys of its own, created once and kept in the gitignored agents/.env.
let envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
for (const k of ["HOUSE_YES_KEY", "HOUSE_NO_KEY"]) {
  if (!new RegExp(`^${k}=0x[0-9a-fA-F]{64}$`, "m").test(envText)) {
    envText = `${envText.replace(/\n?$/, "\n")}${k}=${bytesToHex(new Uint8Array(randomBytes(32)))}\n`;
    writeFileSync(envPath, envText, { mode: 0o600 });
    console.log(`created ${k} in agents/.env`);
  }
}
const env = Object.fromEntries(envText.split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2]])) as Record<string, string>;

const TERRACE = process.env.TERRACE_URL ?? "https://play.terrace.social";
const SEED = parseUnits(env.HOUSE_SEED ?? "20", 6);
const DAILY_CAP = parseUnits(env.HOUSE_DAILY_CAP ?? "300", 6);
const EVERY_MS = 120_000;
const MIN = 100_000n; // the contract's 10-cent minimum stake

const A = {
  usd: "0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe",
  markets: "0xCa6a892e302582eE34a2cfe3a57c7e97A2868773",
  reputation: "0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3",
} as const satisfies Record<string, Address>;
const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function placeBet(uint256 marketId, uint8 side, uint256 stake)",
  "function registerAgent(address operator, string metadataURI)",
]);

const transport = http(env.ALCHEMY_API_KEY ? `https://monad-testnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined);
const reader = createPublicClient({ chain: monadTestnet, transport });
const sides = {
  1: privateKeyToAccount(env.HOUSE_YES_KEY as Hex),
  2: privateKeyToAccount(env.HOUSE_NO_KEY as Hex),
} as const;
const wallets = { 1: createWalletClient({ account: sides[1], chain: monadTestnet, transport }), 2: createWalletClient({ account: sides[2], chain: monadTestnet, transport }) };
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

async function terrace<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TERRACE}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return (await res.json()) as T;
}
// The hosted indexer rate-limits now and then: retry once, and say what it said if it fails again.
async function gql<T>(query: string, variables = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await terrace<{ data?: T; errors?: { message?: string }[]; error?: string }>("/api/indexer", { query, variables }).catch((e) => ({ error: (e as Error).message }) as { data?: T; errors?: { message?: string }[]; error?: string });
    if (r.data) return r.data;
    if (attempt >= 1) throw new Error(`indexer: ${r.errors?.[0]?.message ?? r.error ?? "no data"}`);
    await Bun.sleep(3000);
  }
}

async function call(side: 1 | 2, to: Address, functionName: string, args: unknown[] = []) {
  const data = encodeFunctionData({ abi, functionName: functionName as never, args: args as never });
  const account = sides[side];
  const gas = await reader.estimateGas({ account, to, data });
  const hash = await wallets[side].sendTransaction({ to, data, gas: (gas * 115n) / 100n });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return receipt;
}

// Spend so far today (UTC), kept on disk so a restart doesn't reset the cap.
type State = { day: string; spent: string; seeded: string[] };
const today = () => new Date().toISOString().slice(0, 10);
function loadState(): State {
  try {
    const s = JSON.parse(readFileSync(statePath, "utf8")) as State;
    return s.day === today() ? s : { day: today(), spent: "0", seeded: s.seeded ?? [] };
  } catch {
    return { day: today(), spent: "0", seeded: [] };
  }
}
const saveState = (s: State) => writeFileSync(statePath, JSON.stringify({ ...s, seeded: s.seeded.slice(-500) }));

/** Gas and test dollars from the onboarding treasury, the same top-up every fan gets. */
async function topUp(side: 1 | 2) {
  const a = sides[side].address;
  const [gas, usd] = await Promise.all([reader.getBalance({ address: a }), reader.readContract({ address: A.usd, abi, functionName: "balanceOf", args: [a] })]);
  if (gas < 150_000_000_000_000_000n || usd < SEED) {
    const r = await terrace<{ topUp?: boolean; error?: string }>("/api/onboard", { address: a }).catch(() => ({ error: "unreachable" }));
    if (r.error) log(`top-up for the ${side === 1 ? "Yes" : "No"} wallet: ${r.error}`);
    await Bun.sleep(4000);
  }
}

async function setup() {
  for (const side of [1, 2] as const) {
    const a = sides[side].address;
    await topUp(side);
    const { Player_by_pk } = await gql<{ Player_by_pk: { isAgent: boolean } | null }>(`query($id: String!) { Player_by_pk(id: $id) { isAgent } }`, { id: a.toLowerCase() });
    if (!Player_by_pk?.isAgent) {
      const meta = `data:application/json,${encodeURIComponent(JSON.stringify({ name: "Terrace House", style: "House liquidity: seeds new markets at the bookmakers' line", via: "Terrace house agent", house: true }))}`;
      await call(side, A.reputation, "registerAgent", [a, meta]);
      log(`registered the ${side === 1 ? "Yes" : "No"} wallet as Terrace House`);
    }
    if ((await reader.readContract({ address: A.usd, abi, functionName: "allowance", args: [a, A.markets] })) < SEED * 100n) {
      await call(side, A.usd, "approve", [A.markets, maxUint256]);
    }
  }
}

type Market = {
  id: string; isSealed: boolean; isFlash: boolean; yesPool: string; noPool: string; bettors: number;
  question: { kind: number; closeTime: string; answer: number; spec: string | null; fixture: { id: string } | null };
  bets: { bettor: string }[];
};
type Line = { home?: number; draw?: number; away?: number; over25?: number; under25?: number; bttsYes?: number; bttsNo?: number };

/**
 * A chat take whose rule is really a standard market ("Atalanta win" = home goals > away goals,
 * "over 2.5 goals" = total > 2.5) gets that market's kind, so it opens at the bookmakers' line too.
 */
function kindOfRule(spec: string | null): number {
  if (!spec) return 0;
  try {
    const r = JSON.parse(spec) as { op?: string; value?: number; left?: { score?: { side?: string; period?: string } }; right?: { score?: { side?: string; period?: string } } };
    const l = r.left?.score, rt = r.right?.score;
    if (l && (l.period ?? "fulltime") === "fulltime") {
      if (rt && (rt.period ?? "fulltime") === "fulltime" && r.op === ">") {
        if (l.side === "home" && rt.side === "away") return 1;
        if (l.side === "away" && rt.side === "home") return 3;
      }
      if (rt && r.op === "==" && ((l.side === "home" && rt.side === "away") || (l.side === "away" && rt.side === "home"))) return 2;
      if (l.side === "total" && !rt && ((r.op === ">" && r.value === 2.5) || (r.op === ">=" && r.value === 3) || (r.op === ">" && r.value === 2))) return 4;
    }
  } catch {}
  return 0;
}

/** The bookmakers' chance of Yes for a standard market, or evens for anything else. */
function chanceOfYes(kind: number, line?: Line): number {
  const inv = (x?: number) => (x ? 1 / x : 0);
  if (line && kind >= 1 && kind <= 3 && line.home && line.draw && line.away) {
    const all = inv(line.home) + inv(line.draw) + inv(line.away);
    return inv([line.home, line.draw, line.away][kind - 1]) / all;
  }
  if (line && kind === 4 && line.over25 && line.under25) return inv(line.over25) / (inv(line.over25) + inv(line.under25));
  if (line && kind === 5 && line.bttsYes && line.bttsNo) return inv(line.bttsYes) / (inv(line.bttsYes) + inv(line.bttsNo));
  return 0.5;
}

async function round() {
  const state = loadState();
  const left = DAILY_CAP - BigInt(state.spent);
  if (left < SEED) return log(`daily cap reached ($${Number(DAILY_CAP) / 1e6}); waiting for tomorrow`);

  const now = Math.floor(Date.now() / 1000);
  const { Market } = await gql<{ Market: Market[] }>(
    `query($now: numeric!) { Market(where: { isSealed: { _eq: false }, isFlash: { _eq: false }, bettors: { _lte: 1 }, question: { answer: { _eq: 0 }, closeTime: { _gt: $now } } }, order_by: { createdAt: desc }, limit: 40) {
        id isSealed isFlash yesPool noPool bettors question { kind closeTime answer spec fixture { id } } bets { bettor } } }`,
    { now: now + 30 * 60 },
  );
  const house = new Set([sides[1].address.toLowerCase(), sides[2].address.toLowerCase()]);
  const todo = Market.filter((m) => !state.seeded.includes(m.id) && !m.bets.some((b) => house.has(b.bettor)));
  if (!todo.length) return;
  const lines = await terrace<Record<string, Line>>("/api/odds").catch(() => ({}) as Record<string, Line>);

  let budget = left;
  for (const m of todo) {
    if (budget < SEED) break;
    const p = chanceOfYes(m.question.kind || kindOfRule(m.question.spec), m.question.fixture ? lines[m.question.fixture.id] : undefined);
    // Top up whichever side is short so the whole pool (fan + house) sits at the line.
    const yes = BigInt(m.yesPool), no = BigInt(m.noPool);
    const total = yes + no + SEED;
    let addYes = BigInt(Math.round(Number(total) * p)) - yes;
    addYes = addYes < 0n ? 0n : addYes > SEED ? SEED : addYes;
    let addNo = SEED - addYes;
    if (addYes > 0n && addYes < MIN) (addNo += addYes), (addYes = 0n);
    if (addNo > 0n && addNo < MIN) (addYes += addNo), (addNo = 0n);
    try {
      for (const [side, amount] of [[1, addYes], [2, addNo]] as const) {
        if (amount === 0n) continue;
        await topUp(side);
        await call(side, A.markets, "placeBet", [BigInt(m.id), side, amount]);
      }
      budget -= SEED;
      state.spent = String(BigInt(state.spent) + SEED);
      state.seeded.push(m.id);
      saveState(state);
      log(`seeded market ${m.id}: $${(Number(addYes) / 1e6).toFixed(2)} Yes / $${(Number(addNo) / 1e6).toFixed(2)} No (line ${(p * 100).toFixed(0)}% Yes)`);
    } catch (e) {
      // Don't retry a market that rejects us (closed, or a side already taken): skip it for good.
      state.seeded.push(m.id);
      saveState(state);
      log(`skipped market ${m.id}: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
    }
  }
}

log(`Terrace House: Yes ${sides[1].address}, No ${sides[2].address}; $${Number(SEED) / 1e6} a market, $${Number(DAILY_CAP) / 1e6} a day`);
await setup();
for (;;) {
  await round().catch((e) => log("round failed:", (e as Error).message.split("\n")[0]));
  await Bun.sleep(EVERY_MS);
}

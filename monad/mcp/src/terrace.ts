/**
 * Shared core for the Terrace MCP server: contract addresses, reads from Terrace's public API and
 * indexer, and a local account that signs on Monad testnet.
 *
 * The account is a key kept on this machine (~/.terrace/key, or TERRACE_PRIVATE_KEY). Terrace's
 * onboarding tops it up with gas and test dollars, and every stake is capped by TERRACE_MAX_STAKE,
 * so a Claude can only ever play with a small, known amount of test money.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const API = process.env.TERRACE_URL ?? "https://play.terrace.social";
export const MAX_STAKE = Number(process.env.TERRACE_MAX_STAKE ?? 25);

export const ADDR = {
  usd: "0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe",
  markets: "0xCa6a892e302582eE34a2cfe3a57c7e97A2868773",
  matchups: "0xd411fFE50574962e9376c60d72939F6982350E4B",
  chat: "0x7C790222f618C068f2Cd549f72CB08E7Ba91108e",
} as const satisfies Record<string, Address>;

const ERRORS = [
  "error BadInput()",
  "error StakeTooSmall()",
  "error QuestionClosed()",
  "error NotPending()",
  "error NotAccepted()",
  "error NotYourChallenge()",
  "error StillOpen()",
  "error NotResolved()",
  "error MarketClosed()",
  "error WrongSide()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
] as const;

export const ABI = {
  erc20: parseAbi([
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    ...ERRORS,
  ]),
  markets: parseAbi([
    "function placeBet(uint256 marketId, uint8 side, uint256 stake)",
    "function settleBet(uint256 marketId, address bettor) returns (uint256)",
    "function createTakeMarket(uint256 chatRef, uint256 fixtureId, uint64 closeTime, string text, bytes spec, address token, uint16 feeBps, uint8 side, uint256 stake) returns (uint256)",
    "function questionOf(uint256 marketId) view returns (uint256)",
    "event TakeListed(uint256 indexed marketId, uint256 indexed chatRef, address indexed creator, uint256 questionId)",
    ...ERRORS,
  ]),
  chat: parseAbi([
    "function post(uint8 roomKind, uint256 roomId, string text, uint256 replyTo) returns (uint256)",
    "event MessagePosted(uint256 indexed messageId, uint8 indexed roomKind, uint256 indexed roomId, address author, uint256 replyTo, string text)",
    ...ERRORS,
  ]),
  matchups: parseAbi([
    "function challenge(address opponent, uint256 questionId, uint8 side, address token, uint256 stake) returns (uint256)",
    "function accept(uint256 matchupId)",
    "function decline(uint256 matchupId)",
    "function expire(uint256 matchupId)",
    "function settle(uint256 matchupId)",
    "function getMatchup(uint256 matchupId) view returns ((address challenger, address opponent, uint256 questionId, address token, uint128 stake, uint8 challengerSide, uint8 status, address winner))",
    "event MatchupCreated(uint256 indexed matchupId, address indexed challenger, address indexed opponent, uint256 questionId, uint8 challengerSide, address token, uint256 stake)",
    ...ERRORS,
  ]),
};

export const dollars = (raw: string | number | bigint) => `$${(Number(raw) / 1e6).toFixed(2)}`;
export const toUnits = (d: number) => parseUnits(String(d), 6);
export const SIDE = ["", "yes", "no"] as const;
export const ANSWER = ["open", "yes", "no", "void"] as const;
export const MATCHUP_STATUS = ["waiting for a taker", "on", "called off", "expired (nobody took it)", "settled", "refunded (void)"] as const;
export const challengeLink = (id: bigint | number | string) => `${API}/c/${id}`;
export const matchLink = (fixture: number | string) => `${API}/m/${fixture}`;

/** "12", "#12" or "https://play.terrace.social/c/12" → 12n. */
export function challengeId(ref: string): bigint {
  const m = ref.trim().match(/(?:\/c\/|#)?(\d+)\s*$/);
  if (!m) throw new Error(`"${ref}" isn't a Terrace challenge link or number.`);
  return BigInt(m[1]);
}

// ---------------------------------------------------------------- Terrace API

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error === "match_data" ? "Terrace couldn't load that match. Check the match id with terrace_matches." : `Terrace ${path} answered ${res.status}${out.error ? ` (${out.error})` : ""}.`);
  return out;
}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const out = await api<{ data?: T; error?: string }>("/api/indexer", { query, variables });
  if (!out.data) throw new Error(out.error ?? "Terrace's indexer is unavailable. Try again in a minute.");
  return out.data;
}

export type Match = { id: number; kickoff: number; status: string; elapsed: number | null; home: { name: string }; away: { name: string }; goals: { home: number | null; away: number | null } };
export type Compiled = { spec: string; reading: string; closeTime: number };

export const compileTake = (text: string, fixtureId: number) => api<Compiled>("/api/compile-take", { text, fixtureId });

let matchCache: { at: number; list: Match[] } | null = null;
export async function matches(): Promise<Match[]> {
  if (!matchCache || Date.now() - matchCache.at > 60_000) matchCache = { at: Date.now(), list: await api<Match[]>("/api/matches") };
  return matchCache.list;
}
export async function fixtureName(id: number | string): Promise<string> {
  const m = (await matches().catch(() => [])).find((x) => String(x.id) === String(id));
  return m ? `${m.home.name} v ${m.away.name}` : `match ${id}`;
}

// ---------------------------------------------------------------- account

function loadKey(): Hex {
  const env = process.env.TERRACE_PRIVATE_KEY;
  if (env) return (env.startsWith("0x") ? env : `0x${env}`) as Hex;
  const dir = process.env.TERRACE_HOME ?? join(homedir(), ".terrace");
  const file = join(dir, "key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim() as Hex;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = generatePrivateKey();
  writeFileSync(file, key, { mode: 0o600 });
  return key;
}

export const account = privateKeyToAccount(loadKey());
const transport = http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz");
export const chain = createPublicClient({ chain: monadTestnet, transport });
const wallet = createWalletClient({ account, chain: monadTestnet, transport });

const GAS_LOW = parseEther("0.15");

/** Ask Terrace's onboarding to top the account up (gas and test dollars) when it runs low. */
export async function ensureFunds(stake = 0n) {
  const [gas, usd] = await Promise.all([chain.getBalance({ address: account.address }), chain.readContract({ address: ADDR.usd, abi: ABI.erc20, functionName: "balanceOf", args: [account.address] })]);
  if (gas >= GAS_LOW && usd >= stake) return;
  await api("/api/onboard", { address: account.address }).catch(() => undefined);
  if (usd < stake) {
    const now = await chain.readContract({ address: ADDR.usd, abi: ABI.erc20, functionName: "balanceOf", args: [account.address] });
    if (now < stake) throw new Error(`Not enough test dollars for a ${dollars(stake)} stake (you have ${dollars(now)}). Terrace tops accounts up to $100; try a smaller stake or collect winnings first.`);
  }
}

export function checkStake(amount: number): bigint {
  if (!(amount >= 0.1)) throw new Error("The minimum stake is $0.10.");
  if (amount > MAX_STAKE) throw new Error(`This Claude is capped at $${MAX_STAKE} a bet (TERRACE_MAX_STAKE).`);
  return toUnits(amount);
}

const PLAIN: Record<string, string> = {
  QuestionClosed: "Too late: betting on that take has closed.",
  MarketClosed: "Too late: that market has closed.",
  NotPending: "That challenge isn't waiting for a taker any more.",
  NotAccepted: "That challenge was never accepted, so there's nothing to settle.",
  NotYourChallenge: "That challenge was sent to someone else (or it's your own).",
  NotResolved: "No result yet. Chainlink settles it after the final whistle.",
  StillOpen: "It's still open: it can only expire after betting closes.",
  StakeTooSmall: "The minimum stake is $0.10.",
  WrongSide: "You've already backed the other side of that one.",
  ERC20InsufficientBalance: "Not enough test dollars for that stake.",
  BadInput: "Terrace rejected that (bad input).",
};

/** Simulate first so a revert comes back as a plain sentence, then send and wait (about a second on Monad). */
export async function send<const A extends Abi>(call: { address: Address; abi: A; functionName: string; args: readonly unknown[] }) {
  try {
    // viem's generics can't follow a generic ABI through here; the call shape is checked at each call site's ABI
    const { request } = await chain.simulateContract({ ...(call as object), account } as never);
    const hash = await wallet.writeContract(request as never);
    const receipt = await chain.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted.`);
    return receipt;
  } catch (e) {
    if (e instanceof BaseError) {
      const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
      const name = revert?.data?.errorName;
      if (name) throw new Error(PLAIN[name] ?? name);
      throw new Error(e.shortMessage);
    }
    throw e;
  }
}

/** An exact-amount approval when the allowance falls short (never unlimited). */
export async function approve(spender: Address, amount: bigint) {
  const allowance = await chain.readContract({ address: ADDR.usd, abi: ABI.erc20, functionName: "allowance", args: [account.address, spender] });
  if (allowance < amount) await send({ address: ADDR.usd, abi: ABI.erc20, functionName: "approve", args: [spender, amount] });
}

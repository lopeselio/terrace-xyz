/**
 * Shared core for the Terrace commands.
 *
 * Reads come from Terrace's public API (matches, takes, pools via the Envio indexer) and from
 * Monad through the wallet's own RPC client. Every transaction is handed to the Agent Wallet's
 * executor (`ctx.walletExecutor`), so MetaMask's signing, policy and MFA always decide: this
 * plugin never touches a key. Write commands are dry runs unless `--broadcast` is given.
 */
import { createPublicClient, encodeFunctionData, http, parseAbi, parseEther, parseUnits, toHex, type Address, type Hex, type PublicClient } from "viem";
import { monadTestnet } from "viem/chains";

export const CHAIN_ID = 10143;
export const API = process.env.TERRACE_URL ?? "https://play.terrace.social";

export const ADDR = {
  usd: "0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe",
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  markets: "0xCa6a892e302582eE34a2cfe3a57c7e97A2868773",
  matchups: "0xd411fFE50574962e9376c60d72939F6982350E4B",
  chat: "0x7C790222f618C068f2Cd549f72CB08E7Ba91108e",
  reputation: "0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3",
} as const satisfies Record<string, Address>;

export const ABI = {
  erc20: parseAbi([
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]),
  usd: parseAbi(["function claim()"]),
  markets: parseAbi([
    "function placeBet(uint256 marketId, uint8 side, uint256 stake)",
    "function settleBet(uint256 marketId, address bettor) returns (uint256)",
    "function createTakeMarket(uint256 chatRef, uint256 fixtureId, uint64 closeTime, string text, bytes spec, address token, uint16 feeBps, uint8 side, uint256 stake) returns (uint256)",
  ]),
  chat: parseAbi([
    "function post(uint8 roomKind, uint256 roomId, string text, uint256 replyTo) returns (uint256)",
    "event MessagePosted(uint256 indexed messageId, uint8 indexed roomKind, uint256 indexed roomId, address author, uint256 replyTo, string text)",
  ]),
  matchups: parseAbi([
    "function accept(uint256 matchupId)",
    "function getMatchup(uint256 matchupId) view returns ((address challenger, address opponent, uint256 questionId, address token, uint128 stake, uint8 challengerSide, uint8 status, address winner))",
  ]),
  reputation: parseAbi(["function registerAgent(address operator, string metadataURI)"]),
};

export const dollars = (raw: string | number | bigint) => (Number(raw) / 1e6).toFixed(2);
export const toUnits = (d: number) => parseUnits(String(d), 6);
export const tokenFor = (t: string): Address => (t === "usdc" ? ADDR.usdc : ADDR.usd);

// ---------------------------------------------------------------- Terrace API

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  if (!res.ok) throw new Error(`Terrace API ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const out = await api<{ data?: T; error?: string }>("/api/indexer", { query, variables });
  if (!out.data) throw new Error(out.error ?? "indexer unavailable");
  return out.data;
}

export type Match = { id: number; kickoff: number; status: string; elapsed: number | null; home: { name: string }; away: { name: string }; goals: { home: number | null; away: number | null } };
export type TakeMarket = {
  id: string;
  text: string;
  author: string;
  market: { id: string; token: string; yesPool: string; noPool: string; bettors: number; question: { answer: number; closeTime: string; spec: string | null } };
};

export const OPEN_TAKES = `{
  Message(where: { market_id: { _is_null: false } }, order_by: { heat: desc }, limit: 100) {
    id text author room_id
    market { id token yesPool noPool bettors question { answer closeTime spec } }
  }
}`;

/** What each side pays per dollar if it wins (pari-mutuel, before the creator fee), given an extra stake. */
export function payoutMultiple(yes: number, no: number, side: 1 | 2, stake = 1e6): number {
  const total = yes + no + stake;
  const mine = (side === 1 ? yes : no) + stake;
  return total / mine;
}

// ---------------------------------------------------------------- wallet bridge

/** The structural subset of the plugin context these commands use (members are typed `any` in the published SDK). */
export type Ctx = {
  walletStateManager?: { read(): WalletState };
  publicClient?: (chainId: number) => PublicClient;
  walletExecutor?: (io: unknown, source: string, opts?: unknown) => Promise<Executor>;
};
type WalletRecord = { id?: string; name?: string; address?: string; namespace?: string };
type WalletState = { byokWallets?: WalletRecord[]; remoteWallets?: WalletRecord[]; selectedWallet?: { ref?: { id?: string; address?: string; name?: string }; namespace?: string } };
type Executor = (request: unknown, opts?: { waitForReceipt?: boolean }) => Promise<{ status?: string; txHash?: string; explorerUrl?: string; failureDescription?: string }>;

const isEvm = (r: WalletRecord) => (r.namespace === undefined || r.namespace === "evm") && /^0x[0-9a-fA-F]{40}$/.test(r.address ?? "");

/** The EVM address the Agent Wallet signs with (selected wallet, else the first EVM one). */
export function walletAddress(ctx: Ctx): Address {
  const state = ctx.walletStateManager?.read();
  if (!state) throw new Error("This command needs wallet-read: reinstall the plugin and accept its capabilities.");
  const roster = [...(state.byokWallets ?? []), ...(state.remoteWallets ?? [])].filter(isEvm);
  const ref = state.selectedWallet?.ref;
  const chosen = ref ? roster.find((r) => (ref.id && r.id === ref.id) || (ref.address && r.address?.toLowerCase() === ref.address.toLowerCase()) || (ref.name && r.name === ref.name)) : undefined;
  const address = (chosen ?? roster[0])?.address;
  if (!address) throw new Error("No EVM wallet yet: run `mm init`, or pick one with `mm wallet select`.");
  return address as Address;
}

/** Monad reads: the wallet's RPC client when available, otherwise MONAD_RPC_URL or the public RPC. */
export function chainClient(ctx: Ctx): PublicClient {
  if (ctx.publicClient && !process.env.MONAD_RPC_URL) return ctx.publicClient(CHAIN_ID);
  return createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz") }) as PublicClient;
}

export type PlannedTx = { to: Address; data: Hex; summary: string };

/**
 * Print the plan, then (with --broadcast) submit each transaction through the Agent Wallet executor.
 * Every request carries a plain-English intent so the wallet's policy and the human see what it does.
 */
export async function submit(ctx: Ctx, io: unknown, commandId: string, txs: PlannedTx[], broadcast: boolean) {
  if (!broadcast) {
    return { broadcast: false, plan: txs.map((t) => ({ to: t.to, summary: t.summary, data: t.data })), note: "Dry run. Add --broadcast to hand these to the wallet." };
  }
  if (!ctx.walletExecutor) throw new Error("This command needs wallet-submit: reinstall the plugin and accept its capabilities.");
  const execute = await ctx.walletExecutor(io, commandId);
  const client = chainClient(ctx);
  await ensureGas(client, walletAddress(ctx));
  const sent: { summary: string; txHash?: string; explorerUrl?: string }[] = [];
  for (const t of txs) {
    // MetaMask's gas-price service doesn't know Monad testnet, so the fees come from Monad's RPC.
    const fees = await client.estimateFeesPerGas();
    const transaction = { to: t.to, data: t.data, maxFeePerGas: toHex(fees.maxFeePerGas), maxPriorityFeePerGas: toHex(fees.maxPriorityFeePerGas) };
    const result = await execute(
      { kind: "transaction", chainId: CHAIN_ID, transaction, intent: { summary: t.summary, action: "call", details: { app: "Terrace" } } },
      { waitForReceipt: true },
    );
    if (result.status && /DENIED|EXPIRED|FAILED/.test(result.status)) {
      throw new Error(`${t.summary}: the wallet reported ${result.status}${result.failureDescription ? ` (${result.failureDescription})` : ""}`);
    }
    sent.push({ summary: t.summary, txHash: result.txHash, explorerUrl: result.explorerUrl });
  }
  return { broadcast: true, sent };
}

const GAS_LOW = parseEther("0.15");

/** A new Agent Wallet has no MON: ask Terrace's onboarding for gas (and test dollars) when it runs low. */
async function ensureGas(client: PublicClient, address: Address) {
  if ((await client.getBalance({ address })) >= GAS_LOW) return;
  await api("/api/onboard", { address }).catch(() => undefined);
  if ((await client.getBalance({ address })) === 0n) throw new Error("This wallet has no MON for gas, and Terrace couldn't top it up just now. Try again in a minute.");
}

/** An exact-amount approval when the allowance falls short (never unlimited from an agent). */
export async function approvalIfNeeded(ctx: Ctx, owner: Address, token: Address, spender: Address, amount: bigint): Promise<PlannedTx[]> {
  const allowance = await chainClient(ctx).readContract({ address: token, abi: ABI.erc20, functionName: "allowance", args: [owner, spender] });
  if (allowance >= amount) return [];
  return [{ to: token, data: encodeFunctionData({ abi: ABI.erc20, functionName: "approve", args: [spender, amount] }), summary: `Allow Terrace to move ${dollars(amount)} ${token === ADDR.usdc ? "USDC" : "test dollars"}` }];
}

/** The host context, typed once (the SDK's own types for it don't resolve in plugins). */
export const ctxOf = (command: unknown): Ctx => (command as { ctx: Ctx }).ctx;

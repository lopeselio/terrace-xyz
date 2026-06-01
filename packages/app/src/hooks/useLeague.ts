import { useState, useCallback, useEffect } from "react";
import { Buffer } from "buffer";
import * as SecureStore from "expo-secure-store";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Address } from "@solana/kit";
import type { League, LeagueMember } from "@terrace/sdk";
import {
  TERRACE_PROGRAM_ID,
  USDC_DEVNET_MINT,
  getLeaguePda,
  getLeagueMemberPda,
  getLeagueScoreRecordPda,
  getBetPda,
  getMemberScorePda,
  getArciumMxePda,
  getArciumSignPda,
  getArciumCompDefPda,
  getArciumMempoolPda,
  getArciumExecpoolPda,
  getArciumComputationPda,
  getArciumClusterPda,
  getArciumFeePoolPda,
  getArciumClockPda,
  COMP_DEF_OFFSET_INIT_MEMBER_SCORE,
  COMP_DEF_OFFSET_INCREMENT_MEMBER_SCORE,
  COMP_DEF_OFFSET_REVEAL_MEMBER_SCORE,
  COMP_DEF_OFFSET_RECORD_PRIVATE_LEAGUE_WIN,
  deserializeLeagueAccount,
  deserializeLeagueMemberAccount,
  deserializeMarketAccount,
  buildCreateLeagueInstruction,
  buildJoinLeagueInstruction,
  buildRecordLeagueWinInstruction,
  buildAdvanceGameweekInstruction,
  buildInitMemberScoreInstruction,
  buildRecordPrivateLeagueWinInstruction,
  buildRecordPrivateLeagueWinV2Instruction,
  buildRevealMemberScoreInstruction,
  buildResetMemberScoreInstruction,
  getPrivateBetRecordPda,
  getPrivateStatePda,
} from "@terrace/sdk";

export interface EligibleBet {
  betAddress: Address;
  marketAddress: string;
  marketQuestion: string;
  amount: bigint;
  isActive?: boolean; // true = market is Open/Closed (not yet settled); scoring not available yet
  betType?: "public" | "private"; // "private" = PrivateBetRecord → record_private_league_win_v2
}
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const LOG = "[useLeague]";

// Discriminators from target/types/terrace.ts (IDL source of truth)
const LEAGUE_DISCRIMINATOR = Buffer.from([65, 23, 216, 206, 217, 174, 87, 182]);
const LEAGUE_MEMBER_DISCRIMINATOR = Buffer.from([138, 210, 116, 230, 53, 35, 47, 83]);

export type LeagueOpStatus = "idle" | "building" | "signing" | "success" | "error";

// ── RPC helpers ───────────────────────────────────────────────────────────────

function isPingError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("ping") || msg.includes("timed out") || msg.includes("timeout") || msg.includes("network request failed");
}

async function rpcPost(body: object, retries = 4): Promise<any> {
  if (!HELIUS_RPC_URL) throw new Error("RPC URL not configured");
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.error && isPingError(json.error)) {
        lastErr = new Error(json.error.message ?? "RPC ping timeout");
        if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchBlockhash(): Promise<string> {
  const json = await rpcPost({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] });
  return json.result.value.blockhash;
}

async function confirmTransaction(sig: string): Promise<void> {
  const TIMEOUT_MS = 90_000;
  const POLL_MS = 2_000;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await rpcPost({
        jsonrpc: "2.0", id: 1, method: "getSignatureStatuses",
        params: [[sig], { searchTransactionHistory: false }],
      });
      const status = res.result?.value?.[0];
      if (status != null) {
        if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Transaction failed on-chain")) throw e;
      console.warn(`${LOG} confirmTransaction: poll error (retrying) —`, e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("Transaction confirmation timed out after 90s");
}

function toWeb3Ix(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a: any) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

async function buildAndSend(
  payer: string,
  instructions: any[],
  signTransaction: (b64: string) => Promise<string>
): Promise<string> {
  const blockhash = await fetchBlockhash();
  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: blockhash,
    instructions: instructions.map(toWeb3Ix),
  }).compileToV0Message();
  const vt = new VersionedTransaction(message);
  const b64 = Buffer.from(vt.serialize()).toString("base64");

  // Simulate first
  const sim = await rpcPost({
    jsonrpc: "2.0", id: "sim", method: "simulateTransaction",
    params: [b64, { encoding: "base64", commitment: "confirmed", sigVerify: false }],
  });
  const simErr = sim.error || sim.result?.value?.err;
  const simLogs: string[] = sim.result?.value?.logs ?? [];
  if (simErr) {
    const anchorLine = simLogs.findLast((l: string) => l.includes("AnchorError") || l.includes("Error Message:"));
    const msg = anchorLine
      ? anchorLine.replace(/^.*Error Message: /, "").replace(/^.*AnchorError[^:]*: /, "")
      : sim.error?.message ?? `Simulation failed (${JSON.stringify(sim.result?.value?.err)})`;
    throw new Error(msg);
  }

  const signed = await signTransaction(b64);
  const json = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "sendTransaction",
    params: [signed, { encoding: "base64", preflightCommitment: "confirmed" }],
  });
  if (json.error) throw new Error(`RPC error: ${json.error.message as string}`);
  const sig = json.result as string;
  await confirmTransaction(sig);
  return sig;
}

// ── Account fetching ──────────────────────────────────────────────────────────

async function fetchLeaguesByCreator(creator: string): Promise<League[]> {
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
    params: [TERRACE_PROGRAM_ID, {
      encoding: "base64", commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: Buffer.from(LEAGUE_DISCRIMINATOR).toString("base64"), encoding: "base64" } },
        { memcmp: { offset: 8, bytes: creator } },
      ],
    }],
  });
  if (res.error) return [];
  return (res.result ?? []).flatMap(({ pubkey, account }: any) => {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      return [deserializeLeagueAccount(raw, pubkey as Address)];
    } catch { return []; }
  });
}

async function fetchMemberLeagues(member: string): Promise<LeagueMember[]> {
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
    params: [TERRACE_PROGRAM_ID, {
      encoding: "base64", commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: Buffer.from(LEAGUE_MEMBER_DISCRIMINATOR).toString("base64"), encoding: "base64" } },
        { memcmp: { offset: 8 + 32, bytes: member } }, // member field is after league pubkey
      ],
    }],
  });
  if (res.error) return [];
  return (res.result ?? []).flatMap(({ pubkey, account }: any) => {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      return [deserializeLeagueMemberAccount(raw, pubkey as Address)];
    } catch { return []; }
  });
}

export async function fetchLeagueMembersForLeague(leagueAddress: string): Promise<LeagueMember[]> {
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
    params: [TERRACE_PROGRAM_ID, {
      encoding: "base64", commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: Buffer.from(LEAGUE_MEMBER_DISCRIMINATOR).toString("base64"), encoding: "base64" } },
        { memcmp: { offset: 8, bytes: leagueAddress } }, // league field is at offset 8
      ],
    }],
  });
  if (res.error) return [];
  return (res.result ?? []).flatMap(({ pubkey, account }: any) => {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      return [deserializeLeagueMemberAccount(raw, pubkey as Address)];
    } catch { return []; }
  });
}

async function fetchLeagueByAddress(address: string): Promise<League | null> {
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getAccountInfo",
    params: [address, { encoding: "base64", commitment: "confirmed" }],
  });
  const b64 = res.result?.value?.data?.[0];
  if (!b64) return null;
  try {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return deserializeLeagueAccount(raw, address as Address);
  } catch { return null; }
}

// ── League address persistence ────────────────────────────────────────────────
// Saves league addresses to SecureStore so leagues survive getProgramAccounts
// indexing lag and app restarts. Belt-and-suspenders alongside on-chain queries.

function persistedKey(pubkey: string) { return `terrace:leagues:${pubkey}`; }

async function loadPersistedAddresses(pubkey: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(persistedKey(pubkey));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

async function persistAddress(pubkey: string, leagueAddress: string): Promise<void> {
  try {
    const existing = await loadPersistedAddresses(pubkey);
    if (!existing.includes(leagueAddress)) {
      await SecureStore.setItemAsync(persistedKey(pubkey), JSON.stringify([...existing, leagueAddress]));
    }
  } catch {}
}

// ── Per-gameweek score history (off-chain) ────────────────────────────────────
// On-chain LeagueMember only carries the most-recent revealed score
// (gameweekScore + lastScoredGameweek). To show "GW1: 2, GW2: 4, …" we snapshot
// every (member, gw, score) we observe via loadLeaderboard. First observation
// wins per (league, member, gw) so the value captured is the revealed one — not
// a zero seen later after a record_league_win lazy-resets the slot.

export interface GameweekScoreEntry { gw: number; score: number }
type LeagueHistory = Record<string /* memberPubkey */, GameweekScoreEntry[]>;

function historyKey(leagueAddress: string) { return `terrace:gw-history:${leagueAddress}`; }

export async function loadHistory(leagueAddress: string): Promise<LeagueHistory> {
  try {
    const raw = await SecureStore.getItemAsync(historyKey(leagueAddress));
    return raw ? (JSON.parse(raw) as LeagueHistory) : {};
  } catch { return {}; }
}

export async function snapshotHistory(leagueAddress: string, members: LeagueMember[]): Promise<void> {
  try {
    const current = await loadHistory(leagueAddress);
    let changed = false;
    for (const m of members) {
      if (m.lastScoredGameweek <= 0) continue;
      const pk = String(m.member);
      const entries = current[pk] ?? [];
      if (entries.some((e) => e.gw === m.lastScoredGameweek)) continue;
      entries.push({ gw: m.lastScoredGameweek, score: m.gameweekScore });
      entries.sort((a, b) => a.gw - b.gw);
      current[pk] = entries;
      changed = true;
    }
    if (changed) {
      await SecureStore.setItemAsync(historyKey(leagueAddress), JSON.stringify(current));
    }
  } catch { /* best-effort */ }
}

// ── Arcium helpers ────────────────────────────────────────────────────────────

// Read the cluster offset (Option<u32>) from the MXEAccount.
// MXEAccount Borsh: [8 discriminator][1+4 cluster Option<u32>]...
async function readMxeClusterOffset(): Promise<number> {
  const mxe = await getArciumMxePda(TERRACE_PROGRAM_ID as Address);
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getAccountInfo",
    params: [String(mxe), { encoding: "base64", commitment: "confirmed" }],
  });
  const b64 = res.result?.value?.data?.[0];
  if (!b64) throw new Error("Private features aren't available right now — please try again later.");
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (data[8] !== 1) throw new Error("Private features aren't fully set up — please try again later.");
  const view = new DataView(data.buffer, data.byteOffset);
  return view.getUint32(9, true); // LE u32 cluster offset
}

async function buildArciumAccounts(clusterOffset: number, computationOffset: bigint, compDefOffset: number) {
  const [mxeAccount, signPdaAccount, compDefAccount, mempoolAccount, executingPool,
         computationAccount, clusterAccount, poolAccount, clockAccount] = await Promise.all([
    getArciumMxePda(TERRACE_PROGRAM_ID as Address),
    getArciumSignPda(TERRACE_PROGRAM_ID as Address),
    getArciumCompDefPda(compDefOffset, TERRACE_PROGRAM_ID as Address),
    getArciumMempoolPda(clusterOffset),
    getArciumExecpoolPda(clusterOffset),
    getArciumComputationPda(clusterOffset, computationOffset),
    getArciumClusterPda(clusterOffset),
    getArciumFeePoolPda(),
    getArciumClockPda(),
  ]);
  return { mxeAccount, signPdaAccount, compDefAccount, mempoolAccount, executingPool,
           computationAccount, clusterAccount, poolAccount, clockAccount };
}

// Check whether a PrivateMemberScore PDA exists and has been initialised by the
// Arcium callback (encrypted_score field is non-zero at offset 72).
async function memberScoreReady(memberScoreAddress: string): Promise<boolean> {
  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getAccountInfo",
    params: [memberScoreAddress, { encoding: "base64", commitment: "confirmed" }],
  });
  const b64 = res.result?.value?.data?.[0];
  if (!b64) return false;
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  // encrypted_score lives at offset 72 (8 disc + 32 league + 32 member); 32 bytes.
  // The callback has run if any byte in the ciphertext is non-zero.
  return data.slice(72, 104).some((b) => b !== 0);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLeague(ownerPubkey?: string | null) {
  const [status, setStatus] = useState<LeagueOpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Leagues created by the connected wallet
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  // LeagueMember records for the connected wallet (joined leagues)
  const [myMemberships, setMyMemberships] = useState<LeagueMember[]>([]);
  // Full League objects for joined leagues (fetched after memberships)
  const [joinedLeagues, setJoinedLeagues] = useState<League[]>([]);
  // Leaderboard for the currently viewed league
  const [leaderboard, setLeaderboard] = useState<LeagueMember[]>([]);
  // Winning bets eligible to be scored in the currently viewed league
  const [eligibleBets, setEligibleBets] = useState<EligibleBet[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [notAMember, setNotAMember] = useState(false); // true when user isn't a LeagueMember for the viewed league
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const [loading, setLoading] = useState(false);
  // Human-readable progress label for multi-step create (null when idle)
  const [createStep, setCreateStep] = useState<string | null>(null);

  // Per-member encrypted score state for private leagues
  const [memberScoreState, setMemberScoreState] = useState<{
    isReady: boolean;
    isRevealed: boolean;
    scoresGameweek: number;
  } | null>(null);
  const [loadingMemberScore, setLoadingMemberScore] = useState(false);

  // Lifecycle of the per-(league, member) init_member_score flow.
  // Keyed by league address. Status drives the "Set up your league spot"
  // UI in LeagueScreen: visible spinner while submitting/pending, retry CTA
  // when failed, hidden when ready. See initMemberScore() below.
  const [memberScoreInit, setMemberScoreInit] = useState<
    Record<string, "submitting" | "pending_callback" | "ready" | "failed">
  >({});

  const { publicKey: walletPubkey, signTransaction } = useWallet();
  // ownerPubkey prop takes precedence for data fetches; falls back to wallet state.
  // This handles Privy users where _state.publicKey may be null while effectivePublicKey is not.
  const publicKey = ownerPubkey ?? walletPubkey;

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const [created, memberships, persistedAddrs] = await Promise.all([
        fetchLeaguesByCreator(publicKey),
        fetchMemberLeagues(publicKey),
        loadPersistedAddresses(publicKey),
      ]);

      // Fetch full League objects for each membership
      const membershipLeagues = (await Promise.all(
        memberships.map((m) => fetchLeagueByAddress(String(m.league)))
      )).filter(Boolean) as League[];

      // Also fetch any persisted addresses not already covered — handles indexing lag
      const knownAddrs = new Set([
        ...created.map((l) => String(l.address)),
        ...membershipLeagues.map((l) => String(l.address)),
      ]);
      const extraLeagues = (await Promise.all(
        persistedAddrs
          .filter((a) => !knownAddrs.has(a))
          .map((a) => fetchLeagueByAddress(a))
      )).filter(Boolean) as League[];

      setMyLeagues(created);
      setMyMemberships(memberships);
      setJoinedLeagues([...membershipLeagues, ...extraLeagues]);
    } catch (e) {
      console.warn(`${LOG} refresh error`, e);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadLeaderboard = useCallback(async (leagueAddress: string) => {
    setLoadingLeaderboard(true);
    try {
      const members = await fetchLeagueMembersForLeague(leagueAddress);
      // Sort by gameweek_score desc, then total_score desc
      members.sort((a, b) => b.gameweekScore - a.gameweekScore || b.totalScore - a.totalScore);
      setLeaderboard(members);
      // Fire-and-forget per-GW history snapshot. Capturing now (while the
      // revealed slot is still plaintext on-chain) keeps the data even after
      // the next GW's first record_league_win lazy-resets it.
      snapshotHistory(leagueAddress, members);
    } catch (e) {
      console.warn(`${LOG} loadLeaderboard error`, e);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  // Single-league refresh — used after advance_gameweek to update the
  // currently-viewed league's gameweek without bouncing through full refresh().
  const loadLeague = useCallback(async (leagueAddress: string): Promise<League | null> => {
    return fetchLeagueByAddress(leagueAddress);
  }, []);

  const loadGameweekHistory = useCallback(async (leagueAddress: string) => {
    return loadHistory(leagueAddress);
  }, []);

  const loadEligibleBets = useCallback(async (leagueAddress: string, isPrivate?: boolean) => {
    if (!publicKey) return;
    setLoadingEligible(true);
    setEligibleBets([]);
    setNotAMember(false);
    try {
      // 0. Check LeagueMember PDA exists — required to score wins
      const [leagueMemberAddr] = await getLeagueMemberPda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );
      const memberCheck = await rpcPost({
        jsonrpc: "2.0", id: 1, method: "getAccountInfo",
        params: [String(leagueMemberAddr), { encoding: "base64", commitment: "confirmed" }],
      });
      if (!memberCheck.result?.value) {
        setNotAMember(true);
        setLoadingEligible(false);
        return;
      }

      // 1. Fetch all bets for this wallet (dataSize=99, bettor at offset 40)
      // Claimed filtering is done in code below:
      //   private leagues — include Open/Closed (in-play) AND claimed wins
      //   public leagues  — include claimed=1 only
      const betsRes = await rpcPost({
        jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
        params: [TERRACE_PROGRAM_ID, {
          encoding: "base64", commitment: "confirmed",
          filters: [{ dataSize: 99 }, { memcmp: { offset: 40, bytes: publicKey } }],
        }],
      });

      const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      const b58 = (bytes: Uint8Array): string => {
        let n = 0n;
        for (const b of bytes) n = n * 256n + BigInt(b);
        let s = "";
        while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
        const lead = bytes.findIndex((b) => b !== 0);
        return "1".repeat(lead < 0 ? 0 : lead) + s;
      };

      type RawBet = { betAddress: Address; marketAddress: string; claimed: boolean; betType: "public" | "private" };
      const candidateBets: RawBet[] = [];

      // Public Bet accounts (dataSize=99, bettor@40, claimed@81)
      for (const { pubkey, account } of betsRes.result ?? []) {
        const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
        const claimed = raw[81] === 1;
        if (!isPrivate && !claimed) continue;
        candidateBets.push({ betAddress: pubkey as Address, marketAddress: b58(raw.slice(8, 40)), claimed, betType: "public" });
      }

      // PrivateBetRecord accounts for private leagues (dataSize=280, market@8, bettor@40).
      // See packages/programs/programs/terrace/src/state/private.rs:31 — SPACE = 280.
      // Hoisted out of the if-block so the amounts loop below can read it too.
      let privateBetsRes: any = null;
      if (isPrivate) {
        privateBetsRes = await rpcPost({
          jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
          params: [TERRACE_PROGRAM_ID, {
            encoding: "base64", commitment: "confirmed",
            filters: [
              { dataSize: 280 },
              { memcmp: { offset: 40, bytes: publicKey } },
            ],
          }],
        });
        // First pass: collect raw private bet rows that pass the bet-level
        // mxe_outcome_sealed check. We'll then look up PrivateMarketState for
        // each unique market to filter out markets that haven't been revealed.
        type PrivateRow = { pubkey: string; marketAddr: string };
        const privateRows: PrivateRow[] = [];
        for (const { pubkey, account } of privateBetsRes.result ?? []) {
          const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
          const marketAddr = b58(raw.slice(8, 40));
          // PrivateBetRecord layout (state/private.rs:31): the last meaningful
          // byte is `mxe_outcome_sealed: bool` at offset 274. If false, the
          // bet's outcome was never sealed by the place_private_bet_v4
          // callback (old contract version, or callback never landed) — the
          // bet is permanently unscoreable. Hide it from YOUR BETS THIS GW
          // so the user doesn't tap into a dead error.
          const mxeOutcomeSealed = raw[274] === 1;
          if (!mxeOutcomeSealed) continue;
          privateRows.push({ pubkey, marketAddr });
        }

        // Second pass: fetch PrivateMarketState for each unique market and
        // filter out bets whose market has is_revealed=false. The on-chain
        // `record_private_league_win_v2` account constraint
        // (league_private.rs:695) requires private_state.is_revealed → if
        // false, scoring will fail with "Private market totals not yet
        // revealed." So we hide these bets too.
        //
        // PrivateMarketState layout (state/private.rs:3): is_revealed at
        // offset 136 (after 8 disc + 32 market + 32+16 no_total + 32+16
        // yes_total).
        const uniqueMarkets = [...new Set(privateRows.map((r) => r.marketAddr))];
        const marketRevealed: Record<string, boolean> = {};
        await Promise.all(uniqueMarkets.map(async (mAddr) => {
          try {
            const [psPda] = await getPrivateStatePda(
              mAddr as Address,
              TERRACE_PROGRAM_ID as Address,
            );
            const psRes = await rpcPost({
              jsonrpc: "2.0", id: 1, method: "getAccountInfo",
              params: [String(psPda), { encoding: "base64", commitment: "confirmed" }],
            });
            const b64 = psRes.result?.value?.data?.[0];
            if (!b64) { marketRevealed[mAddr] = false; return; }
            const psRaw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            marketRevealed[mAddr] = psRaw[136] === 1;
          } catch { marketRevealed[mAddr] = false; }
        }));

        for (const { pubkey, marketAddr } of privateRows) {
          if (!marketRevealed[marketAddr]) continue;
          candidateBets.push({ betAddress: pubkey as Address, marketAddress: marketAddr, claimed: false, betType: "private" });
        }
      }

      // 2. Filter out bets already scored in this league
      const unscored: RawBet[] = [];
      await Promise.all(candidateBets.map(async (b) => {
        const [scoreRecordAddr] = await getLeagueScoreRecordPda(
          leagueAddress as Address, b.betAddress, TERRACE_PROGRAM_ID as Address
        );
        const res = await rpcPost({
          jsonrpc: "2.0", id: 1, method: "getAccountInfo",
          params: [String(scoreRecordAddr), { encoding: "base64", commitment: "confirmed" }],
        });
        if (!res.result?.value) unscored.push(b);
      }));

      // 3. Fetch market accounts for question text and status
      const marketAddrs = [...new Set(unscored.map((b) => b.marketAddress))];
      type MarketMeta = { question: string; status: string };
      const marketMeta: Record<string, MarketMeta> = {};
      await Promise.all(marketAddrs.map(async (addr) => {
        try {
          const res = await rpcPost({
            jsonrpc: "2.0", id: 1, method: "getAccountInfo",
            params: [addr, { encoding: "base64", commitment: "confirmed" }],
          });
          const b64 = res.result?.value?.data?.[0];
          if (!b64) return;
          const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const m = deserializeMarketAccount(raw, addr as Address);
          marketMeta[addr] = { question: m.question, status: m.status };
        } catch { marketMeta[addr] = { question: `${addr.slice(0, 8)}…`, status: "Settled" }; }
      }));

      // 4. Apply market-status filter:
      //    Public bets in private leagues — Open/Closed (in-play) OR won+claimed
      //    Private bet records — only Settled markets (private_state.is_revealed required by program)
      //    Public leagues — only won+claimed (Settled, claimed=1); already filtered above
      const eligible = unscored.filter((b) => {
        const meta = marketMeta[b.marketAddress];
        if (!meta) return false;
        if (b.betType === "private") {
          return meta.status === "Settled";
        }
        if (isPrivate) {
          return meta.status === "Open" || meta.status === "Closed" || b.claimed;
        }
        return true;
      });

      // 5. Bet amounts (u64 at offset 72 for both Bet and PrivateBetRecord).
      // Previously only iterated public bets — private bet records fell through
      // to ?? 0n below and rendered as "$0.00 stake". Iterate both so private
      // bets show their real stake.
      const betAmounts: Record<string, bigint> = {};
      const ingestAmounts = (results: any[] | undefined) => {
        for (const { pubkey, account } of results ?? []) {
          const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
          const view = new DataView(raw.buffer, raw.byteOffset);
          betAmounts[pubkey] = view.getBigUint64(72, true);
        }
      };
      ingestAmounts(betsRes.result);
      if (privateBetsRes) ingestAmounts(privateBetsRes.result);

      // Build the eligible list. When the same question text appears on more
      // than one distinct market (artifact of old test sessions creating
      // duplicates), append a #N ordinal so the user can tell them apart.
      // Different bet PDAs → independently scoreable; suffix is purely visual.
      const questionCounts: Record<string, number> = {};
      for (const b of eligible) {
        const q = marketMeta[b.marketAddress]?.question ?? `${b.marketAddress.slice(0, 8)}…`;
        questionCounts[q] = (questionCounts[q] ?? 0) + 1;
      }
      const seenSoFar: Record<string, number> = {};
      setEligibleBets(eligible.map((b) => {
        const meta = marketMeta[b.marketAddress];
        const baseQuestion = meta?.question ?? `${b.marketAddress.slice(0, 8)}…`;
        const total = questionCounts[baseQuestion] ?? 1;
        const ordinal = (seenSoFar[baseQuestion] = (seenSoFar[baseQuestion] ?? 0) + 1);
        const question = total > 1 ? `${baseQuestion}  #${ordinal}` : baseQuestion;
        return {
          betAddress: b.betAddress,
          marketAddress: b.marketAddress,
          marketQuestion: question,
          amount: betAmounts[String(b.betAddress)] ?? 0n,
          isActive: b.betType === "private" ? false : (meta ? meta.status !== "Settled" : false),
          betType: b.betType,
        };
      }));
    } catch (e) {
      console.warn(`${LOG} loadEligibleBets error`, e);
    } finally {
      setLoadingEligible(false);
    }
  }, [publicKey]);

  const createLeague = useCallback(async (params: {
    name: string;
    season?: number;
    isPrivate?: boolean;
    entryFeeUsdc?: bigint;
    maxMembers?: number;
  }) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    // Hoist PDA so catch block can check if tx landed despite a ping timeout
    const nonce = BigInt(Date.now());
    const [leagueAddress] = await getLeaguePda(publicKey as Address, nonce, TERRACE_PROGRAM_ID as Address);

    try {
      const ix = await buildCreateLeagueInstruction({
        name: params.name,
        season: params.season ?? 1,
        isPrivate: params.isPrivate ?? false,
        entryFeeUsdc: params.entryFeeUsdc ?? 0n,
        maxMembers: params.maxMembers ?? 20,
        nonce,
        leagueAddress,
        usdcMint: USDC_DEVNET_MINT,
        creator: publicKey as Address,
        programId: TERRACE_PROGRAM_ID as Address,
      });

      setCreateStep("Creating league… 1/2");
      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);

      // Persist address immediately so it survives indexing lag and app restarts
      await persistAddress(publicKey, String(leagueAddress));

      // Optimistic insert — getProgramAccounts may not index immediately after confirmation
      let newLeague: League | null = null;
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 800));
        newLeague = await fetchLeagueByAddress(String(leagueAddress));
        if (newLeague) break;
      }
      if (newLeague) {
        setMyLeagues((prev) => [newLeague!, ...prev.filter((l) => String(l.address) !== String(leagueAddress))]);
      }

      // Auto-join creator so they appear on the leaderboard without a second manual step
      const totalSteps = (params.isPrivate ?? false) ? 3 : 2;
      setCreateStep(`Joining league… 2/${totalSteps}`);
      setStatus("signing");
      let leagueMemberAddress: Address | null = null;
      try {
        const [lmAddr] = await getLeagueMemberPda(
          leagueAddress, publicKey as Address, TERRACE_PROGRAM_ID as Address
        );
        leagueMemberAddress = lmAddr;
        const joinIx = await buildJoinLeagueInstruction({
          leagueAddress,
          leagueCreator: publicKey as Address,
          leagueNonce: nonce,
          leagueMemberAddress,
          usdcMint: USDC_DEVNET_MINT,
          member: publicKey as Address,
          programId: TERRACE_PROGRAM_ID as Address,
        });
        await buildAndSend(publicKey, [joinIx], signTransaction);
      } catch (joinErr: any) {
        // Non-fatal — creator can still use the league even if auto-join fails
        console.warn(`${LOG} auto-join creator failed:`, joinErr?.message);
      }

      // Private leagues: initialise per-member encrypted score PDA (3rd step)
      if ((params.isPrivate ?? false) && leagueMemberAddress) {
        setCreateStep("Setting up private scores… 3/3");
        setStatus("signing");
        try {
          await _initMemberScore(String(leagueAddress), leagueMemberAddress);
        } catch (initErr: any) {
          console.warn(`${LOG} initMemberScore during createLeague failed:`, initErr?.message);
        }
      }

      setCreateStep(null);
      setStatus("success");
      if (!newLeague) refresh();
      return { sig, leagueAddress: String(leagueAddress) };
    } catch (e: any) {
      // Ping timeout = MWA keepalive died, but the tx may have already landed.
      // Check the PDA directly before surfacing the error.
      if (isPingError(e)) {
        setError("Wallet timed out — checking if league was created...");
        await new Promise((r) => setTimeout(r, 2500));
        const newLeague = await fetchLeagueByAddress(String(leagueAddress));
        if (newLeague) {
          setMyLeagues((prev) => [newLeague, ...prev.filter((l) => String(l.address) !== String(leagueAddress))]);
          setCreateStep(null);
          setStatus("success");
          setError(null);
          return { sig: "ambiguous", leagueAddress: String(leagueAddress) };
        }
      }
      setCreateStep(null);
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction, refresh]);

  const joinLeague = useCallback(async (leagueAddress: string) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    // Hoist member PDA so catch block can verify on ping timeout
    const [leagueMemberAddress] = await getLeagueMemberPda(
      leagueAddress as Address,
      publicKey as Address,
      TERRACE_PROGRAM_ID as Address
    );

    try {
      const league = await fetchLeagueByAddress(leagueAddress);
      if (!league) throw new Error("League not found");

      const ix = await buildJoinLeagueInstruction({
        leagueAddress: leagueAddress as Address,
        leagueCreator: league.creator,
        leagueNonce: league.nonce,
        leagueMemberAddress,
        usdcMint: USDC_DEVNET_MINT,
        member: publicKey as Address,
        programId: TERRACE_PROGRAM_ID as Address,
      });

      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);
      await persistAddress(publicKey, leagueAddress);

      // Private leagues: initialise per-member encrypted score PDA after joining
      if (league.isPrivate) {
        try {
          await _initMemberScore(leagueAddress, leagueMemberAddress);
        } catch (initErr: any) {
          // Non-fatal — user can retry via separate UI action
          console.warn(`${LOG} initMemberScore after join failed:`, initErr?.message);
        }
      }

      setStatus("success");
      refresh();
      return sig;
    } catch (e: any) {
      if (isPingError(e)) {
        setError("Wallet timed out — checking if you joined...");
        await new Promise((r) => setTimeout(r, 2500));
        const res = await rpcPost({
          jsonrpc: "2.0", id: 1, method: "getAccountInfo",
          params: [String(leagueMemberAddress), { encoding: "base64", commitment: "confirmed" }],
        });
        if (res.result?.value) {
          setStatus("success");
          setError(null);
          await persistAddress(publicKey, leagueAddress);
          refresh();
          return "ambiguous";
        }
      }
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction, refresh]);

  // Submit the init_member_score tx and start polling the PDA for the
  // Arcium callback to land (writes encrypted_score). Drives memberScoreInit
  // state machine. Called auto-fire from createLeague/joinLeague and as a
  // manual retry from the LeagueScreen "set up my league spot" CTA.
  const _initMemberScore = useCallback(async (
    leagueAddress: string,
    leagueMemberAddress: Address,
  ) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setMemberScoreInit((s) => ({ ...s, [leagueAddress]: "submitting" }));

    const clusterOffset = await readMxeClusterOffset();
    const computationOffset = BigInt(Date.now());
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

    const [memberScoreAddress] = await getMemberScorePda(
      leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
    );
    const arcium = await buildArciumAccounts(
      clusterOffset, computationOffset, COMP_DEF_OFFSET_INIT_MEMBER_SCORE
    );

    const ix = buildInitMemberScoreInstruction({
      member: publicKey as Address,
      ...arcium,
      leagueAddress: leagueAddress as Address,
      leagueMemberAddress,
      memberScoreAddress,
      computationOffset,
      nonce,
      programId: TERRACE_PROGRAM_ID as Address,
    });

    try {
      await buildAndSend(publicKey, [ix], signTransaction);
    } catch (e) {
      setMemberScoreInit((s) => ({ ...s, [leagueAddress]: "failed" }));
      throw e;
    }

    // Tx confirmed — now wait for the Arcium callback (~4–8s on devnet, up
    // to ~60s on a slow run). Poll the PDA every 3s; mark ready when
    // encrypted_score[72..104] becomes non-zero.
    setMemberScoreInit((s) => ({ ...s, [leagueAddress]: "pending_callback" }));
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 3000;
    const POLL_TIMEOUT_MS = 60000;
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      try {
        const ready = await memberScoreReady(String(memberScoreAddress));
        if (ready) {
          setMemberScoreInit((s) => ({ ...s, [leagueAddress]: "ready" }));
          return;
        }
      } catch (pollErr) {
        // Single-poll failures are transient — keep polling until timeout.
        console.warn("[useLeague] init poll error:", pollErr);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setMemberScoreInit((s) => ({ ...s, [leagueAddress]: "failed" }));
  }, [publicKey, signTransaction]);

  // Public retry — wraps _initMemberScore with the LeagueMember PDA derivation.
  const initMemberScore = useCallback(async (leagueAddress: string) => {
    if (!publicKey) throw new Error("Wallet not connected");
    const [leagueMemberAddress] = await getLeagueMemberPda(
      leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address,
    );
    await _initMemberScore(leagueAddress, leagueMemberAddress);
  }, [publicKey, _initMemberScore]);

  const recordWin = useCallback(async (params: {
    leagueAddress: string;
    marketAddress: string;
    isPrivate?: boolean;
    betType?: "public" | "private";
  }) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    try {
      const [leagueMemberAddress] = await getLeagueMemberPda(
        params.leagueAddress as Address,
        publicKey as Address,
        TERRACE_PROGRAM_ID as Address
      );

      let sig: string;

      if (params.betType === "private") {
        // Private market bet — use record_private_league_win_v2 (Arcium decrypts outcome internally)
        const [privateBetRecord] = await getPrivateBetRecordPda(
          params.marketAddress as Address,
          publicKey as Address,
          TERRACE_PROGRAM_ID as Address
        );
        const [privateState] = await getPrivateStatePda(
          params.marketAddress as Address,
          TERRACE_PROGRAM_ID as Address
        );
        const [memberScoreAddress] = await getMemberScorePda(
          params.leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
        );
        const [scoreRecordAddress] = await getLeagueScoreRecordPda(
          params.leagueAddress as Address,
          privateBetRecord,
          TERRACE_PROGRAM_ID as Address
        );

        const ready = await memberScoreReady(String(memberScoreAddress));
        if (!ready) {
          throw new Error(
            "Your encrypted score is still initializing (Arcium processing). " +
            "Please wait a moment and try again."
          );
        }

        const clusterOffset = await readMxeClusterOffset();
        const computationOffset = BigInt(Date.now());
        const arcium = await buildArciumAccounts(
          clusterOffset, computationOffset, COMP_DEF_OFFSET_RECORD_PRIVATE_LEAGUE_WIN
        );

        const ix = buildRecordPrivateLeagueWinV2Instruction({
          member: publicKey as Address,
          ...arcium,
          leagueAddress: params.leagueAddress as Address,
          leagueMemberAddress,
          memberScoreAddress,
          marketAddress: params.marketAddress as Address,
          privateState,
          privateBetRecord,
          scoreRecordAddress,
          computationOffset,
          programId: TERRACE_PROGRAM_ID as Address,
        });

        setStatus("signing");
        sig = await buildAndSend(publicKey, [ix], signTransaction);
      } else if (params.isPrivate) {
        // Public-bet in a private league — increment_member_score circuit
        const [betAddress] = await getBetPda(
          params.marketAddress as Address,
          publicKey as Address,
          TERRACE_PROGRAM_ID as Address
        );
        const [scoreRecordAddress] = await getLeagueScoreRecordPda(
          params.leagueAddress as Address,
          betAddress,
          TERRACE_PROGRAM_ID as Address
        );
        const [memberScoreAddress] = await getMemberScorePda(
          params.leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
        );

        const ready = await memberScoreReady(String(memberScoreAddress));
        if (!ready) {
          throw new Error(
            "Your encrypted score is still initializing (Arcium processing). " +
            "Please wait a moment and try again."
          );
        }

        const clusterOffset = await readMxeClusterOffset();
        const computationOffset = BigInt(Date.now());
        const arcium = await buildArciumAccounts(
          clusterOffset, computationOffset, COMP_DEF_OFFSET_INCREMENT_MEMBER_SCORE
        );

        const ix = buildRecordPrivateLeagueWinInstruction({
          member: publicKey as Address,
          ...arcium,
          leagueAddress: params.leagueAddress as Address,
          leagueMemberAddress,
          memberScoreAddress,
          marketAddress: params.marketAddress as Address,
          betAddress,
          scoreRecordAddress,
          computationOffset,
          programId: TERRACE_PROGRAM_ID as Address,
        });

        setStatus("signing");
        sig = await buildAndSend(publicKey, [ix], signTransaction);
      } else {
        // Public league — direct on-chain score update
        const [betAddress] = await getBetPda(
          params.marketAddress as Address,
          publicKey as Address,
          TERRACE_PROGRAM_ID as Address
        );
        const [scoreRecordAddress] = await getLeagueScoreRecordPda(
          params.leagueAddress as Address,
          betAddress,
          TERRACE_PROGRAM_ID as Address
        );
        const ix = buildRecordLeagueWinInstruction({
          leagueAddress: params.leagueAddress as Address,
          leagueMemberAddress,
          marketAddress: params.marketAddress as Address,
          betAddress,
          scoreRecordAddress,
          member: publicKey as Address,
          programId: TERRACE_PROGRAM_ID as Address,
        });

        setStatus("signing");
        sig = await buildAndSend(publicKey, [ix], signTransaction);
      }

      setTxSig(sig);
      setStatus("success");
      refresh();
      return sig;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction, refresh]);

  // Reveal a member's encrypted score after the gameweek has advanced.
  // Arcium processes reveal_member_score async; LeagueMember is updated in the callback.
  const revealMemberScore = useCallback(async (leagueAddress: string) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    try {
      const [leagueMemberAddress] = await getLeagueMemberPda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );
      const [memberScoreAddress] = await getMemberScorePda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );

      const clusterOffset = await readMxeClusterOffset();
      const computationOffset = BigInt(Date.now());
      const arcium = await buildArciumAccounts(
        clusterOffset, computationOffset, COMP_DEF_OFFSET_REVEAL_MEMBER_SCORE
      );

      const ix = buildRevealMemberScoreInstruction({
        member: publicKey as Address,
        ...arcium,
        leagueAddress: leagueAddress as Address,
        leagueMemberAddress,
        memberScoreAddress,
        computationOffset,
        programId: TERRACE_PROGRAM_ID as Address,
      });

      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);
      setStatus("success");
      // Leaderboard will update once the Arcium callback lands
      return sig;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction]);

  // Re-initialise encrypted score to 0 for the new gameweek.
  // Must be called after revealMemberScore before recording wins in the new GW.
  const resetMemberScore = useCallback(async (leagueAddress: string) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    try {
      const [leagueMemberAddress] = await getLeagueMemberPda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );
      const [memberScoreAddress] = await getMemberScorePda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );

      const clusterOffset = await readMxeClusterOffset();
      const computationOffset = BigInt(Date.now());
      const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      const arcium = await buildArciumAccounts(
        clusterOffset, computationOffset, COMP_DEF_OFFSET_INIT_MEMBER_SCORE
      );

      const ix = buildResetMemberScoreInstruction({
        member: publicKey as Address,
        ...arcium,
        leagueAddress: leagueAddress as Address,
        memberScoreAddress,
        computationOffset,
        nonce,
        programId: TERRACE_PROGRAM_ID as Address,
      });

      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);
      setStatus("success");
      return sig;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction]);

  // Polls PrivateMemberScore.is_revealed every `intervalMs` until it flips to
  // true, or the timeout expires. Used after revealMemberScore to detect when
  // the Arcium callback has actually landed (vs. just waiting a fixed delay
  // that leaves the UI in a stuck state if the computation hangs).
  const pollMemberScoreRevealed = useCallback(async (
    leagueAddress: string,
    {
      timeoutMs = 90_000,
      intervalMs = 2_000,
      targetGameweek,
    }: { timeoutMs?: number; intervalMs?: number; targetGameweek?: number } = {},
  ): Promise<boolean> => {
    if (!publicKey) return false;
    const [memberScoreAddress] = await getMemberScorePda(
      leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
    );
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await rpcPost({
          jsonrpc: "2.0", id: 1, method: "getAccountInfo",
          params: [String(memberScoreAddress), { encoding: "base64", commitment: "confirmed" }],
        });
        const b64 = res.result?.value?.data?.[0];
        if (b64) {
          const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const scoresGw = data[120];
          const isRevealed = data[121] === 1;
          if (isRevealed && (targetGameweek === undefined || scoresGw === targetGameweek)) {
            return true;
          }
        }
      } catch { /* transient RPC errors are fine — keep polling */ }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }, [publicKey]);

  const loadMemberScoreState = useCallback(async (leagueAddress: string) => {
    if (!publicKey) return;
    setLoadingMemberScore(true);
    try {
      const [memberScoreAddress] = await getMemberScorePda(
        leagueAddress as Address, publicKey as Address, TERRACE_PROGRAM_ID as Address
      );
      const res = await rpcPost({
        jsonrpc: "2.0", id: 1, method: "getAccountInfo",
        params: [String(memberScoreAddress), { encoding: "base64", commitment: "confirmed" }],
      });
      const b64 = res.result?.value?.data?.[0];
      if (!b64) { setMemberScoreState(null); return; }
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      // PrivateMemberScore layout: [8 disc][32 league][32 member][32 encrypted_score][16 nonce][1 scores_gw][1 is_revealed][1 bump]
      const isReady = data.slice(72, 104).some((b) => b !== 0);
      const scoresGameweek = data[120];
      const isRevealed = data[121] === 1;
      setMemberScoreState({ isReady, isRevealed, scoresGameweek });
    } catch (e) {
      console.warn(`${LOG} loadMemberScoreState error`, e);
      setMemberScoreState(null);
    } finally {
      setLoadingMemberScore(false);
    }
  }, [publicKey]);

  const advanceGameweek = useCallback(async (leagueAddress: string) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    setStatus("building");
    setError(null);
    setTxSig(null);

    try {
      const ix = buildAdvanceGameweekInstruction({
        leagueAddress: leagueAddress as Address,
        creator: publicKey as Address,
        programId: TERRACE_PROGRAM_ID as Address,
      });

      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);
      setStatus("success");
      refresh();
      return sig;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction, refresh]);

  return {
    // State
    myLeagues,
    myMemberships,
    joinedLeagues,
    leaderboard,
    eligibleBets,
    notAMember,
    loading,
    loadingLeaderboard,
    loadingEligible,
    memberScoreState,
    loadingMemberScore,
    memberScoreInit,
    status,
    createStep,
    error,
    txSig,
    // Actions
    createLeague,
    joinLeague,
    recordWin,
    advanceGameweek,
    revealMemberScore,
    resetMemberScore,
    initMemberScore,
    loadLeaderboard,
    loadEligibleBets,
    loadMemberScoreState,
    pollMemberScoreRevealed,
    loadLeague,
    loadGameweekHistory,
    refresh,
  };
}

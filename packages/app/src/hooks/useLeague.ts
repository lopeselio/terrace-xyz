import { useState, useCallback, useEffect } from "react";
import { Buffer } from "buffer";
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
  deserializeLeagueAccount,
  deserializeLeagueMemberAccount,
  buildCreateLeagueInstruction,
  buildJoinLeagueInstruction,
  buildRecordLeagueWinInstruction,
  buildAdvanceGameweekInstruction,
} from "@terrace/sdk";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const LOG = "[useLeague]";

// League account discriminator: sha256("account:League")[0..8]
const LEAGUE_DISCRIMINATOR = Buffer.from([138, 138, 131, 232, 188, 18, 247, 15]);
// LeagueMember discriminator: sha256("account:LeagueMember")[0..8]
const LEAGUE_MEMBER_DISCRIMINATOR = Buffer.from([45, 222, 196, 56, 246, 40, 250, 121]);

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

async function fetchLeagueMembersForLeague(leagueAddress: string): Promise<LeagueMember[]> {
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLeague() {
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
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const [loading, setLoading] = useState(false);

  const { publicKey, signTransaction } = useWallet();

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const [created, memberships] = await Promise.all([
        fetchLeaguesByCreator(publicKey),
        fetchMemberLeagues(publicKey),
      ]);
      setMyLeagues(created);
      setMyMemberships(memberships);

      // Fetch full League objects for each membership
      const leagueDetails = await Promise.all(
        memberships.map((m) => fetchLeagueByAddress(String(m.league)))
      );
      setJoinedLeagues(leagueDetails.filter(Boolean) as League[]);
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
    } catch (e) {
      console.warn(`${LOG} loadLeaderboard error`, e);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

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

      setStatus("signing");
      const sig = await buildAndSend(publicKey, [ix], signTransaction);
      setTxSig(sig);
      setStatus("success");

      // Optimistic insert — getProgramAccounts may not index immediately after confirmation
      let inserted = false;
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const newLeague = await fetchLeagueByAddress(String(leagueAddress));
        if (newLeague) {
          setMyLeagues((prev) => [newLeague, ...prev.filter((l) => String(l.address) !== String(leagueAddress))]);
          inserted = true;
          break;
        }
      }
      if (!inserted) refresh();
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
          setStatus("success");
          setError(null);
          return { sig: "ambiguous", leagueAddress: String(leagueAddress) };
        }
      }
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
          refresh();
          return "ambiguous";
        }
      }
      setError(e?.message ?? String(e));
      setStatus("error");
      throw e;
    }
  }, [publicKey, signTransaction, refresh]);

  const recordWin = useCallback(async (params: {
    leagueAddress: string;
    marketAddress: string;
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
    loading,
    loadingLeaderboard,
    status,
    error,
    txSig,
    // Actions
    createLeague,
    joinLeague,
    recordWin,
    advanceGameweek,
    loadLeaderboard,
    refresh,
  };
}

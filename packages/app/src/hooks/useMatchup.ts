import { useState, useCallback, useEffect } from "react";
import { Buffer } from "buffer";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Address } from "@solana/kit";
import type { Matchup } from "@terrace/sdk";
import {
  getMatchupPda,
  TERRACE_PROGRAM_ID,
  USDC_DEVNET_MINT,
  buildCreateMatchupInstruction,
  buildAcceptMatchupInstruction,
  buildSettleMatchupInstruction,
  buildDeclineMatchupInstruction,
  deserializeMatchupAccount,
} from "@terrace/sdk";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

// Matches Matchup::SPACE in the program: 8 disc + 32+32+32 keys + 1 outcome + 8 stake + 1 status + 8 nonce + 1 bump + 13 padding
const MATCHUP_ACCOUNT_SIZE = 136;

const LOG = "[useMatchup]";

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

async function rpcPost(body: object, retries = 2): Promise<any> {
  if (!HELIUS_RPC_URL) throw new Error("RPC URL not configured");
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchBlockhash(): Promise<string> {
  const json = await rpcPost({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] });
  return json.result.value.blockhash;
}

async function confirmTransaction(sig: string): Promise<void> {
  const TIMEOUT_MS = 60_000;
  const POLL_MS = 1_500;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const res = await rpcPost({
      jsonrpc: "2.0", id: 1, method: "getSignatureStatuses",
      params: [[sig], { searchTransactionHistory: false }],
    });
    const status = res.result?.value?.[0];
    if (status != null) {
      if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("Transaction confirmation timed out after 60s");
}

async function buildAndSend(
  payer: string,
  instructions: any[],
  signTransaction: (b64: string) => Promise<string>
): Promise<string> {
  console.log(`${LOG} buildAndSend: fetching blockhash for payer=${payer.slice(0,8)}…`);
  const blockhash = await fetchBlockhash();
  console.log(`${LOG} buildAndSend: blockhash=${blockhash}`);

  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: blockhash,
    instructions: instructions.map(toWeb3Ix),
  }).compileToV0Message();
  const vt = new VersionedTransaction(message);
  const base64Tx = Buffer.from(vt.serialize()).toString("base64");
  console.log(`${LOG} buildAndSend: tx serialized, running simulation…`);

  const sim = await rpcPost({
    jsonrpc: "2.0", id: "pre-sim", method: "simulateTransaction",
    params: [base64Tx, { encoding: "base64", commitment: "confirmed", sigVerify: false }],
  });

  const simErr = sim.error || sim.result?.value?.err;
  const simLogs: string[] = sim.result?.value?.logs ?? [];
  console.log(`${LOG} buildAndSend: simulation error=${JSON.stringify(simErr ?? null)}`);
  console.log(`${LOG} buildAndSend: simulation logs (${simLogs.length}):\n  ` + simLogs.join("\n  "));

  if (simErr) {
    const anchorLine = simLogs.findLast((l) => l.includes("AnchorError") || l.includes("Error Message:"));
    // exact token-program InsufficientFunds: 0x1 must NOT be followed by another hex digit
    const insufficientFunds = simLogs.some((l) => /custom program error: 0x1(?![0-9a-fA-F])/.test(l));
    const marketNotOpen = simLogs.some((l) => l.includes("MarketNotOpen"));
    const marketNotSettled = simLogs.some((l) => l.includes("MarketNotSettled") || l.includes("Error Number: 6009"));
    let msg: string;
    if (marketNotSettled) {
      msg = "This market hasn't been settled yet — settlement pays out once the market creator resolves the outcome.";
    } else if (insufficientFunds) {
      msg = "Insufficient USDC balance — lower your stake or top up your wallet.";
    } else if (marketNotOpen) {
      msg = "That market is no longer open. Please pick a different market.";
    } else if (anchorLine) {
      msg = anchorLine.replace(/^.*Error Message: /, "").replace(/^.*AnchorError[^:]*: /, "");
    } else {
      msg = sim.error?.message ?? `Transaction simulation failed (${JSON.stringify(sim.result?.value?.err)})`;
    }
    console.warn(`${LOG} buildAndSend: simulation FAILED → "${msg}"`);
    throw new Error(msg);
  }

  console.log(`${LOG} buildAndSend: simulation PASSED — requesting wallet signature…`);
  const signed = await signTransaction(base64Tx);
  console.log(`${LOG} buildAndSend: wallet signed, sending transaction…`);

  const json = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "sendTransaction",
    params: [signed, { encoding: "base64", preflightCommitment: "confirmed" }],
  });

  if (json.error) {
    console.warn(`${LOG} buildAndSend: sendTransaction RPC error:`, json.error);
    throw new Error(`RPC error: ${json.error.message as string}`);
  }

  const sig = json.result as string;
  console.log(`${LOG} buildAndSend: sent txSig=${sig} — waiting for confirmation…`);
  await confirmTransaction(sig);
  console.log(`${LOG} buildAndSend: SUCCESS confirmed txSig=${sig}`);
  return sig;
}

// Fetch matchup accounts where a specific pubkey appears at a given byte offset.
// memcmp.bytes is base58 by default in the Solana RPC spec — pass pubkey directly.
async function fetchMatchupsByField(pubkey: string, offset: number): Promise<Matchup[]> {
  console.log(`${LOG} fetchMatchupsByField: pubkey=${pubkey.slice(0,8)}… offset=${offset} programId=${TERRACE_PROGRAM_ID} dataSize=${MATCHUP_ACCOUNT_SIZE}`);

  const res = await rpcPost({
    jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
    params: [
      TERRACE_PROGRAM_ID,
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { memcmp: { offset, bytes: pubkey } },
          { dataSize: MATCHUP_ACCOUNT_SIZE },
        ],
      },
    ],
  });

  if (res.error) {
    console.warn(`${LOG} fetchMatchupsByField: RPC error:`, res.error);
    return [];
  }

  const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
    (res.result ?? []);

  console.log(`${LOG} fetchMatchupsByField: offset=${offset} → ${accounts.length} raw account(s) returned`);

  const parsed: Matchup[] = [];
  for (const { pubkey: addr, account } of accounts) {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      const matchup = deserializeMatchupAccount(raw, addr as Address);
      console.log(`${LOG} fetchMatchupsByField: parsed matchup addr=${addr.slice(0,8)}… status=${matchup.status} stake=${matchup.stakeUsdc} nonce=${matchup.nonce}`);
      parsed.push(matchup);
    } catch (e) {
      console.warn(`${LOG} fetchMatchupsByField: failed to deserialize account ${addr.slice(0,8)}…`, e);
    }
  }

  console.log(`${LOG} fetchMatchupsByField: offset=${offset} → ${parsed.length} valid matchup(s) parsed`);
  return parsed;
}

export type MatchupTxStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

interface UseMatchupResult {
  challengerMatchups: Matchup[];
  opponentMatchups: Matchup[];
  loadingMatchups: boolean;
  status: MatchupTxStatus;
  error: string | null;
  txSig: string | null;
  createMatchup: (
    market: Address,
    opponent: Address,
    challengerOutcome: 0 | 1,
    stakeUsdc: bigint,
    usdcMint?: Address
  ) => Promise<string>;
  acceptMatchup: (matchup: Matchup, usdcMint?: Address) => Promise<string>;
  settleMatchup: (matchup: Matchup, usdcMint?: Address) => Promise<string>;
  declineMatchup: (matchup: Matchup, usdcMint?: Address) => Promise<string>;
  refresh: () => void;
}

export function useMatchup(): UseMatchupResult {
  const { publicKey, signTransaction } = useWallet();
  const [challengerMatchups, setChallengerMatchups] = useState<Matchup[]>([]);
  const [opponentMatchups, setOpponentMatchups] = useState<Matchup[]>([]);
  const [loadingMatchups, setLoadingMatchups] = useState(false);
  const [status, setStatus] = useState<MatchupTxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    console.log(`${LOG} refresh() called — incrementing tick`);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    console.log(`${LOG} useEffect: publicKey=${publicKey?.slice(0,8) ?? "null"} tick=${tick} HELIUS_URL=${HELIUS_RPC_URL ? "set" : "MISSING"}`);

    if (!publicKey || !HELIUS_RPC_URL) {
      console.log(`${LOG} useEffect: skipping fetch — missing publicKey or RPC URL`);
      setChallengerMatchups([]);
      setOpponentMatchups([]);
      return;
    }

    let cancelled = false;
    setLoadingMatchups(true);

    (async () => {
      try {
        console.log(`${LOG} useEffect: fetching matchups for ${publicKey.slice(0,8)}… (challenger@8, opponent@40)`);
        // challenger is at offset 8, opponent is at offset 8+32=40
        const [asChallenger, asOpponent] = await Promise.all([
          fetchMatchupsByField(publicKey, 8),
          fetchMatchupsByField(publicKey, 40),
        ]);
        if (cancelled) {
          console.log(`${LOG} useEffect: fetch completed but effect was cancelled, discarding results`);
          return;
        }
        console.log(`${LOG} useEffect: setting state — challenger=${asChallenger.length} opponent=${asOpponent.length}`);
        setChallengerMatchups(asChallenger);
        setOpponentMatchups(asOpponent);
      } catch (e) {
        console.warn(`${LOG} useEffect: fetch threw:`, e);
      } finally {
        if (!cancelled) setLoadingMatchups(false);
      }
    })();

    return () => { cancelled = true; };
  }, [publicKey, tick]);

  const createMatchup = useCallback(
    async (
      market: Address,
      opponent: Address,
      challengerOutcome: 0 | 1,
      stakeUsdc: bigint,
      usdcMint: Address = USDC_DEVNET_MINT
    ) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      console.log(`${LOG} createMatchup: market=${market.slice(0,8)}… opponent=${opponent.slice(0,8)}… outcome=${challengerOutcome} stake=${stakeUsdc} usdcMint=${usdcMint.slice(0,8)}…`);

      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const challenger = publicKey as Address;
        const nonce = BigInt(Date.now());
        const [matchupAddress] = await getMatchupPda(challenger, market, nonce, TERRACE_PROGRAM_ID);
        console.log(`${LOG} createMatchup: PDA derived matchupAddress=${String(matchupAddress).slice(0,8)}… nonce=${nonce}`);

        const ix = await buildCreateMatchupInstruction({
          market,
          opponent,
          challengerOutcome,
          stakeUsdc,
          nonce,
          usdcMint,
          matchupAddress,
          challenger,
          programId: TERRACE_PROGRAM_ID,
        });
        console.log(`${LOG} createMatchup: instruction built, accounts=${ix.accounts?.length ?? 0}`);

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        console.log(`${LOG} createMatchup: SUCCESS sig=${sig}`);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        console.warn(`${LOG} createMatchup: FAILED`, e?.message ?? e);
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction, refresh]
  );

  const acceptMatchup = useCallback(
    async (matchup: Matchup, usdcMint: Address = USDC_DEVNET_MINT) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      console.log(`${LOG} acceptMatchup: matchup=${String(matchup.address).slice(0,8)}… challenger=${matchup.challenger.slice(0,8)}…`);
      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const ix = await buildAcceptMatchupInstruction({
          matchupAddress: matchup.address,
          challenger: matchup.challenger,
          market: matchup.market,
          nonce: matchup.nonce,
          usdcMint,
          opponent: publicKey as Address,
          programId: TERRACE_PROGRAM_ID,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        console.log(`${LOG} acceptMatchup: SUCCESS sig=${sig}`);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        console.warn(`${LOG} acceptMatchup: FAILED`, e?.message ?? e);
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction, refresh]
  );

  const settleMatchup = useCallback(
    async (matchup: Matchup, usdcMint: Address = USDC_DEVNET_MINT) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      console.log(`${LOG} settleMatchup: matchup=${String(matchup.address).slice(0,8)}… status=${matchup.status}`);
      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const ix = await buildSettleMatchupInstruction({
          matchupAddress: matchup.address,
          market: matchup.market,
          challenger: matchup.challenger,
          opponent: matchup.opponent,
          usdcMint,
          programId: TERRACE_PROGRAM_ID,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        console.log(`${LOG} settleMatchup: SUCCESS sig=${sig}`);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        console.warn(`${LOG} settleMatchup: FAILED`, msg);
        setError(msg);
        setStatus("error");
        if (msg.includes("Ping") || msg.includes("timed out") || msg.includes("timeout")) {
          setTimeout(() => refresh(), 2500);
        }
        throw e;
      }
    },
    [publicKey, signTransaction, refresh]
  );

  const declineMatchup = useCallback(
    async (matchup: Matchup, usdcMint: Address = USDC_DEVNET_MINT) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      console.log(`${LOG} declineMatchup: matchup=${String(matchup.address).slice(0,8)}… challenger=${matchup.challenger.slice(0,8)}…`);
      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const ix = await buildDeclineMatchupInstruction({
          matchupAddress: matchup.address,
          challenger: matchup.challenger,
          signer: publicKey as Address,
          usdcMint,
          programId: TERRACE_PROGRAM_ID,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        console.log(`${LOG} declineMatchup: SUCCESS sig=${sig}`);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        console.warn(`${LOG} declineMatchup: FAILED`, e?.message ?? e);
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction, refresh]
  );

  return {
    challengerMatchups,
    opponentMatchups,
    loadingMatchups,
    status,
    error,
    txSig,
    createMatchup,
    acceptMatchup,
    settleMatchup,
    declineMatchup,
    refresh,
  };
}

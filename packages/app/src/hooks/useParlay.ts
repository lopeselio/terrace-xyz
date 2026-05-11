import { useState, useCallback, useEffect } from "react";
import { Buffer } from "buffer";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Address } from "@solana/kit";
import type { Parlay, ParlayLeg } from "@terrace/sdk";
import {
  getParlayPda,
  TERRACE_PROGRAM_ID,
  USDC_DEVNET_MINT,
  buildCreateParlayInstruction,
  buildSettleParlayInstruction,
  buildClaimParlayInstruction,
  deserializeParlayAccount,
} from "@terrace/sdk";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

// Parlay account layout (after 8-byte discriminator):
//   creator: 32 bytes [8..40]  ← filter anchor for getProgramAccounts

const TOKEN_PROGRAM_ID       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

function deriveAta(mint: string, owner: string): Address {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBytes(),
      new PublicKey(TOKEN_PROGRAM_ID).toBytes(),
      new PublicKey(mint).toBytes(),
    ],
    new PublicKey(ASSOC_TOKEN_PROGRAM_ID),
  );
  return ata.toBase58() as Address;
}

function b58Decode(addr: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const c of addr) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`bad base58 char: ${c}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
  const leadingZeros = addr.match(/^1*/)?.[0].length ?? 0;
  return new Uint8Array([...Array(leadingZeros).fill(0), ...bytes]);
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

async function rpcPost(body: object, retries = 2): Promise<any> {
  if (!HELIUS_RPC_URL) throw new Error("RPC URL not configured — check EXPO_PUBLIC_HELIUS_RPC_URL in .env");
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

async function simulateAndThrow(signedBase64: string, baseMsg: string): Promise<never> {
  try {
    const sim = await rpcPost({
      jsonrpc: "2.0", id: 2, method: "simulateTransaction",
      params: [signedBase64, { encoding: "base64", commitment: "confirmed", sigVerify: false }],
    });
    const logs: string[] = sim.result?.value?.logs ?? [];
    // Show all logs so we can see the full Anchor constraint error trace
    if (logs.length > 0) {
      throw new Error(`${baseMsg}\n${logs.join("\n")}`);
    }
  } catch (inner: any) {
    if (inner?.message?.startsWith(baseMsg)) throw inner;
  }
  throw new Error(baseMsg);
}

async function sendRaw(signedBase64: string): Promise<string> {
  const json = await rpcPost({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [signedBase64, { encoding: "base64", preflightCommitment: "confirmed" }] });
  if (json.error) {
    await simulateAndThrow(signedBase64, `RPC error: ${json.error.message as string}`);
  }
  return json.result as string;
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
  const base64Tx = Buffer.from(vt.serialize()).toString("base64");

  // Pre-simulate to surface account/constraint errors before asking wallet to sign
  const sim = await rpcPost({
    jsonrpc: "2.0", id: "pre-sim", method: "simulateTransaction",
    params: [base64Tx, { encoding: "base64", commitment: "confirmed", sigVerify: false }],
  });
  if (sim.error || sim.result?.value?.err) {
    const logs: string[] = sim.result?.value?.logs ?? [];
    const rpcMsg: string = sim.error?.message ?? "";
    throw new Error(`Simulation failed: ${logs.length > 0 ? logs.join("\n") : rpcMsg}`);
  }

  const signed = await signTransaction(base64Tx);
  return sendRaw(signed);
}

export type ParlayTxStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

interface UseParlayResult {
  parlays: Parlay[];
  loadingParlays: boolean;
  status: ParlayTxStatus;
  error: string | null;
  txSig: string | null;
  createParlay: (legs: ParlayLeg[], stakeUsdc: bigint, usdcMint?: Address) => Promise<string>;
  settleParlay: (parlay: Parlay) => Promise<string>;
  claimParlay: (parlay: Parlay, usdcMint?: Address) => Promise<string>;
  refresh: () => void;
}

export function useParlay(): UseParlayResult {
  const { publicKey, signTransaction } = useWallet();
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [loadingParlays, setLoadingParlays] = useState(false);
  const [status, setStatus] = useState<ParlayTxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Fetch all parlays created by connected wallet
  useEffect(() => {
    if (!publicKey || !HELIUS_RPC_URL) {
      setParlays([]);
      return;
    }

    let cancelled = false;
    setLoadingParlays(true);

    (async () => {
      try {
        const creatorBytes = b58Decode(publicKey);
        const creatorBase64 = btoa(String.fromCharCode(...creatorBytes));

        const res = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getProgramAccounts",
            params: [
              TERRACE_PROGRAM_ID,
              {
                encoding: "base64",
                filters: [
                  // Match creator pubkey at offset 8 (after 8-byte discriminator)
                  { memcmp: { offset: 8, bytes: creatorBase64, encoding: "base64" } },
                ],
              },
            ],
          }),
        });

        const json = await res.json();
        if (cancelled) return;

        const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
          (json.result ?? []).filter((a: any) => {
            // Keep only accounts large enough to be a parlay (min 62 bytes)
            const raw = Uint8Array.from(atob(a.account.data[0]), (c) => c.charCodeAt(0));
            return raw.length >= 62;
          });

        const parsed: Parlay[] = [];
        for (const { pubkey, account } of accounts) {
          try {
            const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
            parsed.push(deserializeParlayAccount(raw, pubkey as Address));
          } catch {
            // skip malformed accounts (e.g. other account types that pass the memcmp)
          }
        }

        setParlays(parsed);
      } catch {
        // silently ignore — parlays are additive to the UI
      } finally {
        if (!cancelled) setLoadingParlays(false);
      }
    })();

    return () => { cancelled = true; };
  }, [publicKey, tick]);

  const createParlay = useCallback(
    async (legs: ParlayLeg[], stakeUsdc: bigint, usdcMint: Address = USDC_DEVNET_MINT) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
      if (legs.length < 2 || legs.length > 8)
        throw new Error("Parlays require 2–8 legs");

      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const creator = publicKey as Address;
        const nonce = BigInt(Date.now());
        const [parlayAddress] = await getParlayPda(creator, nonce, TERRACE_PROGRAM_ID);

        // Vault is the USDC ATA owned by the parlay PDA — where the stake is held on-chain
        const parlayVaultAddress = deriveAta(usdcMint, parlayAddress);

        const ix = await buildCreateParlayInstruction({
          legs,
          stakeUsdc,
          nonce,
          usdcMint,
          parlayAddress,
          parlayVaultAddress,
          creator,
          programId: TERRACE_PROGRAM_ID,
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
    },
    [publicKey, signTransaction, refresh]
  );

  const settleParlay = useCallback(
    async (parlay: Parlay) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const ix = buildSettleParlayInstruction({
          parlayAddress: parlay.address,
          marketAccounts: parlay.legs.map((l) => l.market),
          programId: TERRACE_PROGRAM_ID,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        setError(msg);
        setStatus("error");
        // Ping timeout = Phantom signed & sent before the keepalive expired.
        // Refresh after a short propagation delay so the UI reflects on-chain state.
        if (msg.includes("Ping") || msg.includes("timed out") || msg.includes("timeout")) {
          setTimeout(() => refresh(), 2500);
        }
        throw e;
      }
    },
    [publicKey, signTransaction, refresh]
  );

  const claimParlay = useCallback(
    async (parlay: Parlay, usdcMint: Address = USDC_DEVNET_MINT) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const creator = publicKey as Address;
        const ix = await buildClaimParlayInstruction({
          parlayAddress: parlay.address,
          parlayCreator: creator,
          parlayNonce: parlay.nonce,
          usdcMint,
          creator,
          programId: TERRACE_PROGRAM_ID,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        setTxSig(sig);
        setStatus("success");
        refresh();
        return sig;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
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

  return {
    parlays,
    loadingParlays,
    status,
    error,
    txSig,
    createParlay,
    settleParlay,
    claimParlay,
    refresh,
  };
}

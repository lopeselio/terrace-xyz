import { useState, useCallback } from "react";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  JupiterMarketsClient,
  buildPlaceBetInstruction,
  getBetPda,
  TERRACE_PROGRAM_ID,
} from "@terrace/sdk";
import type { Address } from "@solana/kit";
import { useWallet } from "./useWallet";

const jupiterClient = new JupiterMarketsClient(
  process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? ""
);

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address;

export type BetStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

export interface PlaceBetResult {
  status: BetStatus;
  txSignature: string | null;
  error: string | null;
  placeBet: (params: PlaceBetParams) => Promise<void>;
  reset: () => void;
}

export interface PlaceBetParams {
  marketId: string;
  /** true = backing the outcome (YES), false = against it (NO) */
  isYes: boolean;
  /** USDC amount in human units, e.g. 2.0 */
  amountUsdc: number;
  /** "native" = on-chain Terrace program; "jupiter" = Jupiter prediction market */
  source?: "native" | "jupiter";
}

export function usePlaceBet(): PlaceBetResult {
  const { publicKey, signTransaction, connected } = useWallet();
  const [status, setStatus] = useState<BetStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeBet = useCallback(
    async ({ marketId, isYes, amountUsdc, source = "jupiter" }: PlaceBetParams) => {
      if (!connected || !publicKey) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      setStatus("building");
      setError(null);
      setTxSignature(null);

      try {
        if (source === "native") {
          await placeNativeBet({ marketId, isYes, amountUsdc, publicKey, signTransaction, setStatus, setTxSignature });
        } else {
          await placeJupiterBet({ marketId, isYes, amountUsdc, publicKey, signTransaction, setStatus, setTxSignature });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        console.error("placeBet error:", e);
      }
    },
    [publicKey, connected, signTransaction]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxSignature(null);
    setError(null);
  }, []);

  return { status, txSignature, error, placeBet, reset };
}

// ---------------------------------------------------------------------------
// Jupiter path (unchanged)
// ---------------------------------------------------------------------------
async function placeJupiterBet(params: {
  marketId: string;
  isYes: boolean;
  amountUsdc: number;
  publicKey: string;
  signTransaction: (base64: string) => Promise<string>;
  setStatus: (s: BetStatus) => void;
  setTxSignature: (sig: string) => void;
}) {
  const { marketId, isYes, amountUsdc, publicKey, signTransaction, setStatus, setTxSignature } = params;

  const { transaction: unsignedBase64 } = await jupiterClient.buildBuyOrder({
    ownerPubkey: publicKey,
    marketId,
    isYes,
    depositAmountUsdc: amountUsdc,
  });

  setStatus("signing");
  const signedBase64 = await signTransaction(unsignedBase64);

  setStatus("executing");
  const { signature } = await jupiterClient.execute(signedBase64);
  setTxSignature(signature);
  setStatus("success");
}

// ---------------------------------------------------------------------------
// Native Terrace path
// ---------------------------------------------------------------------------
async function placeNativeBet(params: {
  marketId: string;
  isYes: boolean;
  amountUsdc: number;
  publicKey: string;
  signTransaction: (base64: string) => Promise<string>;
  setStatus: (s: BetStatus) => void;
  setTxSignature: (sig: string) => void;
}) {
  const { marketId, isYes, amountUsdc, publicKey, signTransaction, setStatus, setTxSignature } = params;

  const bettor = publicKey as Address;
  const market = marketId as Address;
  const amount = BigInt(Math.round(amountUsdc * 1_000_000));
  const outcome = isYes ? 1 : (0 as 0 | 1);

  const [betAddress] = await getBetPda(market, bettor, TERRACE_PROGRAM_ID);

  const ix = await buildPlaceBetInstruction({
    market,
    outcome,
    amount,
    usdcMint: USDC_MINT,
    betAddress,
    bettor,
    programId: TERRACE_PROGRAM_ID,
  });

  // Convert @solana/kit IInstruction → web3.js TransactionInstruction
  // (required because MWA bridge expects VersionedTransaction from web3.js)
  const webIx = new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });

  // Fetch latest blockhash from Helius
  const blockhashRes = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }],
    }),
  });
  const { result: { value: { blockhash } } } = await blockhashRes.json();

  const message = new TransactionMessage({
    payerKey: new PublicKey(publicKey),
    recentBlockhash: blockhash,
    instructions: [webIx],
  }).compileToV0Message();

  const versionedTx = new VersionedTransaction(message);
  const base64Tx = Buffer.from(versionedTx.serialize()).toString("base64");

  setStatus("signing");
  const signedBase64 = await signTransaction(base64Tx);

  setStatus("executing");
  const sendRes = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [signedBase64, { encoding: "base64", preflightCommitment: "confirmed" }],
    }),
  });
  const sendJson = await sendRes.json();
  if (sendJson.error) throw new Error(sendJson.error.message);

  setTxSignature(sendJson.result);
  setStatus("success");
}

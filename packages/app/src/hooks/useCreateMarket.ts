import { useState, useCallback } from "react";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildCreateMarketInstruction,
  getMarketPda,
  TERRACE_PROGRAM_ID,
} from "@terrace/sdk";
import type { Address } from "@solana/kit";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address;

export type CreateMarketStatus =
  | "idle"
  | "building"
  | "signing"
  | "executing"
  | "success"
  | "error";

export interface CreateMarketParams {
  question: string;
  /** Unix timestamp in seconds */
  expiryTimestamp: number;
  creatorFeeBps: number;
  isPrivate: boolean;
  isFlash: boolean;
}

export interface CreateMarketResult {
  status: CreateMarketStatus;
  txSignature: string | null;
  marketAddress: string | null;
  error: string | null;
  createMarket: (params: CreateMarketParams) => Promise<void>;
  reset: () => void;
}

export function useCreateMarket(): CreateMarketResult {
  const { publicKey, signTransaction, connected } = useWallet();
  const [status, setStatus] = useState<CreateMarketStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [marketAddress, setMarketAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMarket = useCallback(
    async ({ question, expiryTimestamp, creatorFeeBps, isPrivate, isFlash }: CreateMarketParams) => {
      if (!connected || !publicKey) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      setStatus("building");
      setError(null);
      setTxSignature(null);
      setMarketAddress(null);

      try {
        const creator = publicKey as Address;
        // Use ms timestamp as nonce — unique per creator per millisecond
        const nonce = BigInt(Date.now());
        const expiry = BigInt(expiryTimestamp);

        const [marketPda] = await getMarketPda(creator, nonce, TERRACE_PROGRAM_ID);

        const ix = await buildCreateMarketInstruction({
          question,
          expiry,
          creatorFeeBps,
          nonce,
          oracle: null,
          isPrivate,
          isFlash,
          usdcMint: USDC_MINT,
          marketAddress: marketPda,
          creator,
          programId: TERRACE_PROGRAM_ID,
        });

        // @solana/kit IInstruction → web3.js TransactionInstruction (MWA bridge requirement)
        // @solana/kit AccountRole bitmask: bit0 = WRITABLE (1), bit1 = IS_SIGNER (2)
        //   READONLY=0, WRITABLE=1, READONLY_SIGNER=2, WRITABLE_SIGNER=3
        const webIx = new TransactionInstruction({
          programId: new PublicKey(ix.programAddress),
          keys: (ix.accounts ?? []).map((a) => ({
            pubkey: new PublicKey(a.address),
            isWritable: (a.role & 1) !== 0,
            isSigner: (a.role & 2) !== 0,
          })),
          data: Buffer.from(ix.data ?? []),
        });

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
        const {
          result: {
            value: { blockhash },
          },
        } = await blockhashRes.json();

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
        setMarketAddress(marketPda);
        setStatus("success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        console.warn("[useCreateMarket]", e);
      }
    },
    [publicKey, connected, signTransaction]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxSignature(null);
    setMarketAddress(null);
    setError(null);
  }, []);

  return { status, txSignature, marketAddress, error, createMarket, reset };
}

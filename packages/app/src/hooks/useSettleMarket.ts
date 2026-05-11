import { useState, useCallback } from "react";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { buildSettleMarketInstruction, TERRACE_PROGRAM_ID } from "@terrace/sdk";
import type { Address } from "@solana/kit";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

export type SettleStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

export interface SettleMarketResult {
  status: SettleStatus;
  txSignature: string | null;
  error: string | null;
  settleMarket: (marketAddress: string, winningOutcome: 0 | 1) => Promise<void>;
  reset: () => void;
}

export function useSettleMarket(): SettleMarketResult {
  const { publicKey, signTransaction, connected } = useWallet();
  const [status, setStatus] = useState<SettleStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settleMarket = useCallback(
    async (marketAddress: string, winningOutcome: 0 | 1) => {
      if (!connected || !publicKey) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      setStatus("building");
      setError(null);
      setTxSignature(null);

      try {
        const creator = publicKey as Address;
        const market = marketAddress as Address;

        // buildSettleMarketInstruction is synchronous
        const ix = buildSettleMarketInstruction({
          market,
          winningOutcome,
          creator,
          programId: TERRACE_PROGRAM_ID,
        });

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
        setStatus("success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        console.warn("[useSettleMarket]", e);
      }
    },
    [publicKey, connected, signTransaction]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxSignature(null);
    setError(null);
  }, []);

  return { status, txSignature, error, settleMarket, reset };
}

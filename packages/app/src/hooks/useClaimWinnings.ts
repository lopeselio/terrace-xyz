import { useState, useCallback } from "react";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildClaimWinningsInstruction,
  getReputationPda,
  TERRACE_PROGRAM_ID,
  deserializeMarketAccount,
} from "@terrace/sdk";
import type { Address } from "@solana/kit";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address;

export type ClaimStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

export interface UseClaimWinningsResult {
  status: ClaimStatus;
  txSignature: string | null;
  error: string | null;
  claim: (betAddress: string, marketAddress: string) => Promise<void>;
  reset: () => void;
}

export function useClaimWinnings(): UseClaimWinningsResult {
  const { publicKey, signTransaction, connected } = useWallet();
  const [status, setStatus] = useState<ClaimStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claim = useCallback(
    async (betAddress: string, marketAddress: string) => {
      if (!connected || !publicKey) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      setStatus("building");
      setError(null);
      setTxSignature(null);

      try {
        const bettor = publicKey as Address;
        const market = marketAddress as Address;

        // Fetch market account to get creator
        const marketRes = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [marketAddress, { encoding: "base64" }],
          }),
        });
        const marketJson = await marketRes.json();
        const marketData = marketJson.result?.value?.data?.[0];
        if (!marketData) throw new Error("Market account not found");
        const raw = Uint8Array.from(atob(marketData), (c) => c.charCodeAt(0));
        const marketAccount = deserializeMarketAccount(raw, market);

        const [reputationAddress] = await getReputationPda(bettor, TERRACE_PROGRAM_ID);

        const ix = await buildClaimWinningsInstruction({
          market,
          marketCreator: marketAccount.creator as Address,
          betAddress: betAddress as Address,
          reputationAddress,
          usdcMint: USDC_MINT,
          bettor,
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        console.warn("[useClaimWinnings]", e);
      }
    },
    [publicKey, connected, signTransaction]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxSignature(null);
    setError(null);
  }, []);

  return { status, txSignature, error, claim, reset };
}

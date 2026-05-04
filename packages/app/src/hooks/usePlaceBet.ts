import { useState, useCallback } from "react";
import { JupiterMarketsClient } from "@terrace/sdk";
import { useWallet } from "./useWallet";

const jupiterClient = new JupiterMarketsClient(
  process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? ""
);

export type BetStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

export interface PlaceBetResult {
  status: BetStatus;
  txSignature: string | null;
  error: string | null;
  /** Call this to place a bet on a Jupiter YES outcome */
  placeBet: (params: PlaceBetParams) => Promise<void>;
  reset: () => void;
}

export interface PlaceBetParams {
  marketId: string;
  /** true = backing the outcome (YES), false = against it (NO) */
  isYes: boolean;
  /** USDC amount in human units, e.g. 2.0 */
  amountUsdc: number;
}

export function usePlaceBet(): PlaceBetResult {
  const { publicKey, signTransaction, connected } = useWallet();
  const [status, setStatus] = useState<BetStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeBet = useCallback(
    async ({ marketId, isYes, amountUsdc }: PlaceBetParams) => {
      if (!connected || !publicKey) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      setStatus("building");
      setError(null);
      setTxSignature(null);

      try {
        // 1. Build unsigned transaction from Jupiter
        const { transaction: unsignedBase64 } = await jupiterClient.buildBuyOrder({
          ownerPubkey: publicKey,
          marketId,
          isYes,
          depositAmountUsdc: amountUsdc,
        });

        // 2. Sign with connected wallet (MWA or Privy)
        setStatus("signing");
        const signedBase64 = await signTransaction(unsignedBase64);

        // 3. Submit to Jupiter execution endpoint
        setStatus("executing");
        const { signature } = await jupiterClient.execute(signedBase64);

        setTxSignature(signature);
        setStatus("success");
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

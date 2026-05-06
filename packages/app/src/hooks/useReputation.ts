import { useState, useEffect, useCallback } from "react";
import { deserializeReputationAccount, getReputationPda } from "@terrace/sdk";
import type { Reputation } from "@terrace/sdk";
import type { Address } from "@solana/kit";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

interface UseReputationResult {
  reputation: Reputation | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReputation(walletPubkey: string | null): UseReputationResult {
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletPubkey || !HELIUS_RPC_URL) {
      setReputation(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [repAddress] = await getReputationPda(walletPubkey as Address);

        const res = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [repAddress, { encoding: "base64" }],
          }),
        });

        const json = await res.json();
        if (cancelled) return;

        const value = json.result?.value;
        if (!value) {
          // New user — reputation PDA not yet initialised
          setReputation(null);
          return;
        }

        const raw = Uint8Array.from(atob(value.data[0]), (c) => c.charCodeAt(0));
        setReputation(deserializeReputationAccount(raw, repAddress));
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletPubkey, tick]);

  return { reputation, loading, error, refresh };
}

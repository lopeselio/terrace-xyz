import { useState, useEffect, useCallback } from "react";
import { JupiterMarketsClient } from "@terrace/sdk";
import { deserializeMarketAccount } from "@terrace/sdk";
import type { UnifiedMarket } from "@terrace/sdk";
import type { Address } from "@solana/kit";

const HELIUS_RPC_URL =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const JUPITER_API_KEY =
  process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "";
const TERRACE_PROGRAM_ID =
  process.env.EXPO_PUBLIC_TERRACE_PROGRAM_ID ?? "";

// Market::SPACE = 336 (from lib.rs) — used as a rough getProgramAccounts filter
const MARKET_ACCOUNT_SIZE = 336;

// Football-specific search terms to surface relevant Jupiter markets
const FOOTBALL_QUERIES = ["premier league", "champions league", "world cup", "euro"];

async function fetchNativeMarkets(): Promise<UnifiedMarket[]> {
  if (!HELIUS_RPC_URL || !TERRACE_PROGRAM_ID) return [];

  try {
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
            filters: [{ dataSize: MARKET_ACCOUNT_SIZE }],
          },
        ],
      }),
    });

    const json = await res.json();
    const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
      json.result ?? [];

    return accounts.map(({ pubkey, account }) => {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      const market = deserializeMarketAccount(raw, pubkey as Address);

      let statusMapped: UnifiedMarket["status"] = "Open";
      if (market.status === "Settled") statusMapped = "Settled";
      else if (market.status === "Closed") statusMapped = "Closed";

      const totalVol = Number(market.totalVolume);
      const yesVol = Number(market.yesVolume);
      const yesPrice = totalVol > 0 ? yesVol / totalVol : 0.5;

      return {
        source: "native" as const,
        id: pubkey,
        question: market.question,
        yesPrice,
        noPrice: 1 - yesPrice,
        totalVolumeUsdc: totalVol / 1_000_000,
        expiry: new Date(Number(market.expiry) * 1000),
        status: statusMapped,
        nativeMarketAddress: pubkey,
        isPrivate: market.isPrivate,
        isFlash: market.isFlash,
      };
    });
  } catch (e) {
    console.warn("fetchNativeMarkets failed:", e);
    return [];
  }
}

async function fetchJupiterMarkets(): Promise<UnifiedMarket[]> {
  if (!JUPITER_API_KEY) return [];

  const client = new JupiterMarketsClient(JUPITER_API_KEY);

  try {
    // Fan out football queries in parallel, then deduplicate by market id
    const results = await Promise.allSettled(
      FOOTBALL_QUERIES.map((q) => client.getSportsEvents(q))
    );

    const seenIds = new Set<string>();
    const allMarkets: UnifiedMarket[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const normalised = JupiterMarketsClient.normaliseEvents(result.value);
      for (const m of normalised) {
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        allMarkets.push(m);
      }
    }

    return allMarkets;
  } catch (e) {
    console.warn("fetchJupiterMarkets failed:", e);
    return [];
  }
}

interface UseMarketsResult {
  markets: UnifiedMarket[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMarkets(): UseMarketsResult {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchNativeMarkets(), fetchJupiterMarkets()])
      .then(([native, jupiter]) => {
        if (cancelled) return;
        // Merge and sort by volume descending; native markets float to top on tie
        const merged = [...native, ...jupiter].sort(
          (a, b) => b.totalVolumeUsdc - a.totalVolumeUsdc
        );
        setMarkets(merged);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { markets, loading, error, refresh };
}

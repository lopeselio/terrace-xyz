import { useState, useEffect, useCallback } from "react";
import { JupiterMarketsClient } from "@terrace/sdk";
import { deserializeMarketAccount } from "@terrace/sdk";
import type { UnifiedMarket } from "@terrace/sdk";
import type { Address } from "@solana/kit";
import { isFootballMarket } from "../utils/football";

const HELIUS_RPC_URL =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const JUPITER_API_KEY =
  process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "";
const TERRACE_PROGRAM_ID =
  process.env.EXPO_PUBLIC_TERRACE_PROGRAM_ID ?? "";

// Market::SPACE = 8 disc + 204 question + 8 expiry + 32 creator + 2 outcome + 8+8+8 volumes
//   + 32 vault + 1 status + 2 fee_bps + 33 oracle + 1 is_private + 1 is_flash + 8 nonce + 1 bump + 2 pad
const MARKET_ACCOUNT_SIZE = 359;

// Football-specific search terms to surface relevant Jupiter markets
const FOOTBALL_QUERIES = [
  "premier league",
  "champions league",
  "world cup",
  "fifa world cup",
  "world cup 2026",
  "euro",
];

// Football classification lives in utils/football.ts — see `isFootballMarket`.
// It is applied once, here at the data layer, so every screen's counts and
// empty states describe the same catalog.

// Cap for plausible market volume in raw u64 USDC base units ($1B = 10^15).
// Anything above this is corrupted on-chain data — historically caused by the
// pre-v8 Arcium `Enc<Mxe, (u64,u64)>` reveal bug (see
// docs/arcium-mxe-roundtrip-issue.md) where reveal_private_market_callback
// wrote garbage volumes that saturating_add'd to ~u64::MAX. The v8 contract
// fixes this for new markets; this filter hides the corrupted historical
// accounts still sitting on devnet.
const MAX_PLAUSIBLE_VOLUME_RAW = 1_000_000_000_000_000n; // $1B USDC

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

    return accounts.flatMap(({ pubkey, account }) => {
      const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
      const market = deserializeMarketAccount(raw, pubkey as Address);

      if (
        market.totalVolume > MAX_PLAUSIBLE_VOLUME_RAW ||
        market.yesVolume > MAX_PLAUSIBLE_VOLUME_RAW ||
        market.noVolume > MAX_PLAUSIBLE_VOLUME_RAW
      ) {
        return [];
      }

      let statusMapped: UnifiedMarket["status"] = "Open";
      if (market.status === "Settled") statusMapped = "Settled";
      else if (market.status === "Closed") statusMapped = "Closed";

      const totalVol = Number(market.totalVolume);
      const yesVol = Number(market.yesVolume);
      const yesPrice = totalVol > 0 ? yesVol / totalVol : 0.5;

      return [{
        source: "native" as const,
        id: pubkey,
        question: market.question,
        yesPrice,
        noPrice: 1 - yesPrice,
        totalVolumeUsdc: totalVol / 1_000_000,
        expiry: new Date(Number(market.expiry) * 1000),
        status: statusMapped,
        nativeMarketAddress: pubkey,
        creator: market.creator as string,
        isPrivate: market.isPrivate,
        isFlash: market.isFlash,
      }];
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
        if (!isFootballMarket(m)) continue;
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
  prependMarket: (market: UnifiedMarket) => void;
}

export function useMarkets(): UseMarketsResult {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const prependMarket = useCallback(
    (market: UnifiedMarket) => setMarkets((prev) => [market, ...prev]),
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchNativeMarkets(), fetchJupiterMarkets()])
      .then(([native, jupiter]) => {
        if (cancelled) return;

        const merged = [...native, ...jupiter]
          .filter(isFootballMarket)
          .sort((a, b) => {
            if (a.status === "Open" && b.status === "Open") {
              if (a.expiry && b.expiry) return a.expiry.getTime() - b.expiry.getTime();
              if (a.expiry) return -1;
              if (b.expiry) return 1;
            }
            if (a.status === "Open" && b.status !== "Open") return -1;
            if (a.status !== "Open" && b.status === "Open") return 1;
            return b.totalVolumeUsdc - a.totalVolumeUsdc;
          });

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

  return { markets, loading, error, refresh, prependMarket };
}

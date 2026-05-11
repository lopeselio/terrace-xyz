import { useState, useEffect, useCallback } from "react";
import { deserializeMarketAccount } from "@terrace/sdk";
import type { Address } from "@solana/kit";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const TERRACE_PROGRAM_ID = process.env.EXPO_PUBLIC_TERRACE_PROGRAM_ID ?? "";
// Market::SPACE = 8 disc + 204 question + 8 expiry + 32 creator + 2 outcome + 8+8+8 volumes
//   + 32 vault + 1 status + 2 fee_bps + 33 oracle + 1 is_private + 1 is_flash + 8 nonce + 1 bump + 2 pad
const MARKET_ACCOUNT_SIZE = 359;

export interface CreatedMarket {
  address: string;
  question: string;
  expiry: Date;
  status: "Open" | "Closed" | "Settled";
  outcome: number | null;
  nonce: bigint;
  totalVolumeUsdc: number;
  creatorFeeBps: number;
  /** Estimated creator fee revenue = totalVolumeUsdc × creatorFeeBps / 10000 */
  estimatedRevenueUsdc: number;
  isExpired: boolean;
  isSettleable: boolean;
}

interface Result {
  markets: CreatedMarket[];
  loading: boolean;
  refresh: () => void;
}

export function useCreatedMarkets(walletPubkey: string | null): Result {
  const [markets, setMarkets] = useState<CreatedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletPubkey || !HELIUS_RPC_URL || !TERRACE_PROGRAM_ID) {
      setMarkets([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(HELIUS_RPC_URL, {
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
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
          json.result ?? [];

        const now = Date.now();
        const created: CreatedMarket[] = [];

        for (const { pubkey, account } of accounts) {
          try {
            const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
            const m = deserializeMarketAccount(raw, pubkey as Address);

            if (m.creator !== walletPubkey) continue;

            const expiryMs = Number(m.expiry) * 1000;
            const isExpired = expiryMs < now;
            // Program has no on-chain expiry check for settle_market — creator can settle any time
            const isSettleable = m.status === "Open";

            const totalVolumeUsdc = Number(m.totalVolume) / 1_000_000;
            created.push({
              address: pubkey,
              question: m.question,
              expiry: new Date(expiryMs),
              status: m.status as "Open" | "Closed" | "Settled",
              outcome: m.outcome,
              nonce: m.nonce,
              totalVolumeUsdc,
              creatorFeeBps: m.creatorFeeBps,
              estimatedRevenueUsdc: totalVolumeUsdc * m.creatorFeeBps / 10_000,
              isExpired,
              isSettleable,
            });
          } catch {
            // skip malformed accounts
          }
        }

        // Sort: settleable first, then by expiry desc
        created.sort((a, b) => {
          if (a.isSettleable && !b.isSettleable) return -1;
          if (!a.isSettleable && b.isSettleable) return 1;
          return b.expiry.getTime() - a.expiry.getTime();
        });

        setMarkets(created);
      })
      .catch((e) => {
        if (!cancelled) console.warn("[useCreatedMarkets]", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletPubkey, tick]);

  return { markets, loading, refresh };
}

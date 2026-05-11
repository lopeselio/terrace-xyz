import { useState, useEffect, useCallback } from "react";
import { deserializeReputationAccount } from "@terrace/sdk";
import { TERRACE_PROGRAM_ID } from "@terrace/sdk";
import type { Address } from "@solana/kit";
import type { BadgeTier } from "./useLeaderboard";
import { truncatePubkey } from "./useLeaderboard";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

// Reputation::SPACE = 8 disc + 32 owner + 4 total_bets + 4 winning_bets
//   + 2 win_rate_bps + 2 current_streak + 1 badge_tier + 1 bump + 16 padding = 70
const REPUTATION_ACCOUNT_SIZE = 70;

export interface TerraceFan {
  pubkey: string;
  displayName: string;
  winRate: number | null;     // 0–1 fraction
  totalBets: number;
  winningBets: number;
  badge: BadgeTier;
  /** volume-weighted score used for ranking */
  score: number;
}

interface Result {
  fans: TerraceFan[];
  loading: boolean;
  refresh: () => void;
}

export function useTerraceUsers(): Result {
  const [fans, setFans] = useState<TerraceFan[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!HELIUS_RPC_URL) return;
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
            filters: [{ dataSize: REPUTATION_ACCOUNT_SIZE }],
          },
        ],
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
          json.result ?? [];

        const result: TerraceFan[] = [];
        for (const { account } of accounts) {
          try {
            const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
            // Parse owner directly (offset 8, 32 bytes) to get the wallet pubkey
            // deserializeReputationAccount uses the passed address as the PDA address,
            // but we need owner (the wallet). Read it manually.
            const rep = deserializeReputationAccount(raw, "" as Address);
            const ownerPubkey = rep.owner as string;
            const winRate = rep.totalBets > 0 ? rep.winRateBps / 10_000 : null;
            result.push({
              pubkey: ownerPubkey,
              displayName: truncatePubkey(ownerPubkey),
              winRate,
              totalBets: rep.totalBets,
              winningBets: rep.winningBets,
              badge: rep.badgeTier,
              // Volume-weighted score: win_rate × total_bets (favours active predictors)
              score: (winRate ?? 0) * rep.totalBets,
            });
          } catch {
            // skip malformed accounts
          }
        }

        // Sort by score descending
        result.sort((a, b) => b.score - a.score);
        setFans(result);
      })
      .catch((e) => {
        if (!cancelled) console.warn("[useTerraceUsers]", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  return { fans, loading, refresh };
}

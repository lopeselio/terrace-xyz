import { useState, useEffect, useCallback } from "react";
import { JupiterMarketsClient } from "@terrace/sdk";
import { handleOf, avatarColorOf } from "../utils/identity";

const JUPITER_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "";

export type LeaderboardPeriod = "daily" | "weekly" | "alltime";
export type BadgeTier = "Legend" | "Sharp" | "Casual";

export interface SharpEntry {
  rank: number;
  pubkey: string;
  displayName: string;
  winRate: number | null;   // 0–1 fraction
  pnlUsdc: number | null;
  volumeUsdc: number | null;
  badge: BadgeTier;
  isFollowing: boolean;
}

/**
 * Truncated base58 — for *things* only: markets, vaults, tx signatures. People
 * get a handle from `utils/identity`; see the note there on why.
 */
export function truncatePubkey(pk: string): string {
  if (pk.length < 8) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export function avatarColorFromPubkey(pubkey: string): string {
  return avatarColorOf(pubkey);
}

// winRate from Jupiter API is a 0–1 fraction; badge thresholds match on-chain logic
function inferBadge(winRate: number | null): BadgeTier {
  if (winRate === null) return "Casual";
  if (winRate >= 0.65) return "Legend";
  if (winRate >= 0.55) return "Sharp";
  return "Casual";
}

export function useLeaderboard(period: LeaderboardPeriod = "weekly") {
  const [entries, setEntries] = useState<SharpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!JUPITER_API_KEY) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const client = new JupiterMarketsClient(JUPITER_API_KEY);
    client
      .getLeaderboard(period)
      .then((raw) => {
        if (cancelled) return;
        const mapped: SharpEntry[] = raw.map((entry, i) => {
          const winRate = entry.winRate != null ? entry.winRate : null;
          const pnl = entry.pnlUsd != null ? parseFloat(entry.pnlUsd) : null;
          const vol = entry.volume != null ? parseFloat(entry.volume) / 1_000_000 : null;
          return {
            rank: entry.rank ?? i + 1,
            pubkey: entry.ownerPubkey,
            displayName: handleOf(entry.ownerPubkey),
            winRate,
            pnlUsdc: pnl,
            volumeUsdc: vol,
            badge: inferBadge(winRate),
            isFollowing: following.has(entry.ownerPubkey),
          };
        });
        setEntries(mapped);
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
  }, [period, tick]);

  const toggleFollow = useCallback(
    (pubkey: string, myPubkey: string | null) => {
      if (!myPubkey || !JUPITER_API_KEY) return;
      const client = new JupiterMarketsClient(JUPITER_API_KEY);
      const willFollow = !following.has(pubkey);

      // Optimistic update
      setFollowing((prev) => {
        const next = new Set(prev);
        willFollow ? next.add(pubkey) : next.delete(pubkey);
        return next;
      });
      setEntries((prev) =>
        prev.map((e) => (e.pubkey === pubkey ? { ...e, isFollowing: willFollow } : e))
      );

      const call = willFollow
        ? client.followUser(pubkey, myPubkey)
        : client.unfollowUser(pubkey, myPubkey);

      call.catch(() => {
        // Revert on error
        setFollowing((prev) => {
          const next = new Set(prev);
          willFollow ? next.delete(pubkey) : next.add(pubkey);
          return next;
        });
        setEntries((prev) =>
          prev.map((e) => (e.pubkey === pubkey ? { ...e, isFollowing: !willFollow } : e))
        );
      });
    },
    [following]
  );

  return { entries, loading, error, refresh, toggleFollow };
}

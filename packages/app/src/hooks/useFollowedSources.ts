import { useState, useEffect } from "react";
import { JupiterMarketsClient } from "@terrace/sdk";
import type { TerraceFan } from "./useTerraceUsers";

const JUPITER_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "";

export type UserSource = "terrace" | "polymarket";

/**
 * For each followed pubkey, determines which prediction platforms they are active on:
 *   "terrace"    — has an on-chain Terrace Reputation account
 *   "polymarket" — has ≥1 position on Jupiter/Polymarket (via /positions endpoint)
 *
 * Returns a stable Map<pubkey, UserSource[]> that updates as profile fetches resolve.
 */
export function useFollowedSources(
  following: Set<string>,
  fans: TerraceFan[],
): Map<string, UserSource[]> {
  const [polySet, setPolySet] = useState<Set<string>>(new Set());

  // Rerun whenever the set of followed pubkeys changes (compare by serialised key)
  const followingKey = [...following].sort().join(",");

  useEffect(() => {
    if (!JUPITER_API_KEY || following.size === 0) {
      setPolySet(new Set());
      return;
    }

    let cancelled = false;
    const client = new JupiterMarketsClient(JUPITER_API_KEY);
    const pubkeys = [...following];

    // Check positions endpoint — returns [] for wallets with no Polymarket history.
    // getUserProfile returns HTTP 200 with {"error":"profile_not_found"} for unknown
    // wallets (not a 4xx), so totalTrades is always undefined there. Positions array
    // is the reliable signal.
    Promise.allSettled(
      pubkeys.map((pk) =>
        client.getUserPositions(pk).then((positions) => ({
          pk,
          hasActivity: positions.length > 0,
        }))
      )
    ).then((results) => {
      if (cancelled) return;
      const active = new Set<string>();
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.hasActivity) {
          active.add(r.value.pk);
        }
      }
      setPolySet(active);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followingKey]);

  // Build the final map on every render — cheap since fans/polySet are already resolved
  const fanSet = new Set(fans.map((f) => f.pubkey));
  const result = new Map<string, UserSource[]>();
  for (const pk of following) {
    const sources: UserSource[] = [];
    if (fanSet.has(pk))  sources.push("terrace");
    if (polySet.has(pk)) sources.push("polymarket");
    result.set(pk, sources);
  }
  return result;
}

import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import type { League } from "@terrace/sdk";

/**
 * Tracks unseen gameweek advances across the leagues the user belongs to.
 *
 * Per-league last-seen gameweek lives in SecureStore. On each refresh we
 * compare the on-chain `league.gameweek` to the persisted value — anything
 * higher counts as an unread advance and surfaces in the bell-icon panel.
 *
 * Mark-as-seen is opt-in: callers explicitly mark a league seen when the user
 * actually opens it (so just glancing at the panel doesn't clear the badge).
 */

export interface AdvanceNotification {
  leagueAddress: string;
  leagueName: string;
  gameweek: number;
}

const lastSeenKey = (pubkey: string, leagueAddress: string) =>
  `terrace:gw-last-seen:${pubkey}:${leagueAddress}`;

export function useLeagueAdvanceNotifications(
  walletPubkey: string | null,
  leagues: League[],
) {
  const [advances, setAdvances] = useState<AdvanceNotification[]>([]);
  // Cache of last-seen values so we don't hit SecureStore on every render.
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});

  // Re-compute advances when leagues or lastSeen change.
  useEffect(() => {
    if (!walletPubkey) {
      setAdvances([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const next: AdvanceNotification[] = [];
      const seenSnapshot: Record<string, number> = { ...lastSeen };
      for (const league of leagues) {
        const addr = String(league.address);
        let seen = seenSnapshot[addr];
        if (seen === undefined) {
          try {
            const raw = await SecureStore.getItemAsync(lastSeenKey(walletPubkey, addr));
            seen = raw ? Number(raw) : league.gameweek;
            if (!raw) {
              // First time we observe this league — treat current GW as the
              // baseline so we don't flag a stale advance the user pre-knows.
              await SecureStore.setItemAsync(
                lastSeenKey(walletPubkey, addr),
                String(league.gameweek),
              );
            }
            seenSnapshot[addr] = seen;
          } catch {
            seen = league.gameweek;
          }
        }
        if (league.gameweek > seen) {
          next.push({
            leagueAddress: addr,
            leagueName: league.name,
            gameweek: league.gameweek,
          });
        }
      }
      if (cancelled) return;
      setAdvances(next);
      // Only commit cache values that came from disk this run, so subsequent
      // markSeen() updates aren't overwritten.
      setLastSeen((prev) => ({ ...seenSnapshot, ...prev }));
    })();
    return () => { cancelled = true; };
    // intentionally omit lastSeen from deps — we hydrate it inside; reading
    // it would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletPubkey, leagues]);

  const markSeen = useCallback(async (leagueAddress: string) => {
    if (!walletPubkey) return;
    const league = leagues.find((l) => String(l.address) === leagueAddress);
    if (!league) return;
    try {
      await SecureStore.setItemAsync(
        lastSeenKey(walletPubkey, leagueAddress),
        String(league.gameweek),
      );
    } catch { /* best-effort */ }
    setLastSeen((prev) => ({ ...prev, [leagueAddress]: league.gameweek }));
    setAdvances((prev) => prev.filter((a) => a.leagueAddress !== leagueAddress));
  }, [walletPubkey, leagues]);

  const markAllSeen = useCallback(async () => {
    if (!walletPubkey) return;
    await Promise.all(
      leagues.map((l) =>
        SecureStore.setItemAsync(
          lastSeenKey(walletPubkey, String(l.address)),
          String(l.gameweek),
        ).catch(() => {}),
      ),
    );
    setLastSeen(
      Object.fromEntries(leagues.map((l) => [String(l.address), l.gameweek])),
    );
    setAdvances([]);
  }, [walletPubkey, leagues]);

  return { advances, markSeen, markAllSeen };
}

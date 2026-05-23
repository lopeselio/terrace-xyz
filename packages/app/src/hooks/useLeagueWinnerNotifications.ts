import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import type { League } from "@terrace/sdk";
import { fetchLeagueMembersForLeague, loadHistory, snapshotHistory } from "./useLeague";

/**
 * Emits a notification when every member of a league has revealed their score
 * for a previously-completed gameweek, so users on the Home screen learn who
 * won the GW (the "fan they're competing with"). Sourced from the off-chain
 * per-(member, gw) history snapshots persisted by loadLeaderboard.
 *
 * Notifications are persisted as seen per (league, gw) so they don't re-fire
 * after dismissal.
 */

export interface WinnerNotification {
  leagueAddress: string;
  leagueName: string;
  gameweek: number;
  winnerPubkey: string;
  winnerScore: number;
  totalMembers: number;
}

const seenKey = (pubkey: string, leagueAddress: string, gw: number) =>
  `terrace:gw-winner-seen:${pubkey}:${leagueAddress}:${gw}`;

async function computeWinners(
  walletPubkey: string,
  leagues: League[],
): Promise<WinnerNotification[]> {
  const out: WinnerNotification[] = [];

  for (const league of leagues) {
    const addr = String(league.address);
    // Pull fresh members & snapshot so any reveals that happened while the
    // user was away get captured before we read history.
    let members;
    try {
      members = await fetchLeagueMembersForLeague(addr);
    } catch {
      continue;
    }
    if (members.length < 2) continue; // solo league — no opponent to surface
    await snapshotHistory(addr, members);

    const history = await loadHistory(addr);
    // Consider all completed gameweeks: [1 .. league.gameweek - 1]. League
    // starts at GW1; if it's now GW2+, GW1 is the earliest candidate.
    for (let gw = 1; gw < league.gameweek; gw++) {
      // Every current member must have a history entry for this GW.
      const scores: { member: string; score: number }[] = [];
      let complete = true;
      for (const m of members) {
        const pk = String(m.member);
        const entry = history[pk]?.find((e) => e.gw === gw);
        if (!entry) { complete = false; break; }
        scores.push({ member: pk, score: entry.score });
      }
      if (!complete) continue;

      // Skip if already notified.
      let seen = false;
      try {
        const raw = await SecureStore.getItemAsync(seenKey(walletPubkey, addr, gw));
        seen = !!raw;
      } catch {}
      if (seen) continue;

      // Highest score wins; ties pick the first (deterministic by member order).
      const winner = scores.reduce((best, cur) => (cur.score > best.score ? cur : best));
      out.push({
        leagueAddress: addr,
        leagueName: league.name,
        gameweek: gw,
        winnerPubkey: winner.member,
        winnerScore: winner.score,
        totalMembers: members.length,
      });
    }
  }

  return out;
}

export function useLeagueWinnerNotifications(
  walletPubkey: string | null,
  leagues: League[],
) {
  const [winners, setWinners] = useState<WinnerNotification[]>([]);

  useEffect(() => {
    if (!walletPubkey) { setWinners([]); return; }
    let cancelled = false;
    (async () => {
      const next = await computeWinners(walletPubkey, leagues);
      if (!cancelled) setWinners(next);
    })();
    return () => { cancelled = true; };
  }, [walletPubkey, leagues]);

  const markSeen = useCallback(async (leagueAddress: string, gameweek: number) => {
    if (!walletPubkey) return;
    try {
      await SecureStore.setItemAsync(seenKey(walletPubkey, leagueAddress, gameweek), "1");
    } catch {}
    setWinners((prev) =>
      prev.filter((w) => !(w.leagueAddress === leagueAddress && w.gameweek === gameweek)),
    );
  }, [walletPubkey]);

  const markAllSeen = useCallback(async () => {
    if (!walletPubkey) return;
    await Promise.all(
      winners.map((w) =>
        SecureStore.setItemAsync(seenKey(walletPubkey, w.leagueAddress, w.gameweek), "1").catch(() => {}),
      ),
    );
    setWinners([]);
  }, [walletPubkey, winners]);

  return { winners, markSeen, markAllSeen };
}

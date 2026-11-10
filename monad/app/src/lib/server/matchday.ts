import "server-only";
import { FINISHED } from "@/components/MatchRow";
import { fanName } from "@/lib/names";
import { GD_QUERY, RECENT, buildGroups, type MatchGroup, type Position, type RawBet, type RawDuel } from "@/lib/positions";
import { gql } from "./indexer";
import { matches } from "./football";

/** A fan's matchday in one glance, for the share card: results so far, and how the rest stands. */
export type Matchday = {
  name: string;
  won: number;
  lost: number;
  net: number; // raw units: settled winnings less settled losses, plus live readings
  winning: number;
  losing: number;
  games: { home: string; away: string; score: string; clock: string; pick: string; standing: Position["standing"]; amount: number }[];
};

const clockOf = (g: MatchGroup) => {
  const m = g.match;
  if (g.phase === "live") return m?.status === "HT" ? "HT" : m?.elapsed ? `${m.elapsed}'` : "LIVE";
  if (g.phase !== "fulltime") return "";
  return m && !FINISHED.has(m.status) ? (m.status === "PST" ? "Postponed" : m.status) : "FT";
};

export async function matchday(fan: string): Promise<Matchday> {
  const me = fan.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const d = await gql<{ Bet: RawBet[]; Matchup: RawDuel[] }>(GD_QUERY, { me, since: now - RECENT });
  const ids = [...new Set([...d.Bet.map((b) => b.market.question.fixture?.id), ...d.Matchup.map((m) => m.question.fixture?.id)].filter(Boolean).map(Number))];
  const byId = new Map((await matches(ids)).map((m) => [m.id, m]));
  const groups = buildGroups(d.Bet, d.Matchup, me, byId, {}, now).filter((g) => g.phase !== "upcoming");
  const ps = groups.flatMap((g) => g.positions);
  const settled = (p: Position) => p.standing === "won" || p.standing === "lost";
  const gain = (p: Position) => (p.standing === "won" || p.standing === "winning" ? (p.returns ?? p.stake) - p.stake : p.standing === "lost" || p.standing === "losing" ? -p.stake : 0);
  return {
    name: fanName(me),
    won: ps.filter((p) => p.standing === "won").length,
    lost: ps.filter((p) => p.standing === "lost").length,
    net: ps.filter((p) => settled(p) || p.standing === "winning" || p.standing === "losing").reduce((s, p) => s + gain(p), 0),
    winning: ps.filter((p) => p.standing === "winning").length,
    losing: ps.filter((p) => p.standing === "losing").length,
    games: groups.slice(0, 4).map((g) => {
      const p = [...g.positions].sort((a, b) => Math.abs(gain(b)) - Math.abs(gain(a)))[0];
      return {
        home: g.match?.home.name ?? "Home",
        away: g.match?.away.name ?? "Away",
        score: g.score ? `${g.score.home}–${g.score.away}` : "v",
        clock: clockOf(g),
        pick: `${p.title}: ${p.pick}`,
        standing: p.standing,
        amount: gain(p),
      };
    }),
  };
}

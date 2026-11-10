/*
 * Swing alerts: a goal (or, for a custom take, whatever its rule counts) turns a position a fan holds
 * from winning to losing as it stands, or back. Pure: the push sender reads positions with buildGroups,
 * keeps each one's last reading in the `pushsent` table, and asks here whether it swung and what to say.
 */
import { money } from "./money";
import { shortTeam } from "./labels";
import type { MatchGroup, Q } from "./positions";

export type Reading = { standing: "winning" | "losing"; home: number; away: number };

/** A position on a match in play that reads winning or losing right now. */
export type LivePosition = Reading & {
  key: string;
  fixture: number;
  call: string; // "Man Utd win", "1v1 against the draw"
  swing: number; // raw units: profit if it ends like this, or minus the stake
};

type Names = { home: { id?: number; name: string }; away: { id?: number; name: string }; elapsed?: number | null };
export type GoalEvent = { time: { elapsed: number; extra: number | null }; team: { id: number }; player: { name?: string | null }; type: string; detail: string };

/** Live positions with a reading, from buildGroups' output. Sealed picks and settled ones never swing. */
export function livePositions(groups: MatchGroup[]): LivePosition[] {
  const out: LivePosition[] = [];
  for (const g of groups) {
    if (g.phase !== "live" || !g.score || !g.match) continue;
    for (const p of g.positions) {
      if ((p.standing !== "winning" && p.standing !== "losing") || !p.side) continue;
      out.push({
        key: p.key,
        fixture: g.fixture,
        standing: p.standing,
        home: g.score.home,
        away: g.score.away,
        call: callFor(p.question, p.side, g.match, p.kind === "duel"),
        swing: p.standing === "winning" ? (p.returns ?? p.stake) - p.stake : -p.stake,
      });
    }
  }
  return out;
}

/** "Man Utd win", "under 2.5 goals", "bet against the draw", "1v1 on both teams scoring". */
export function callFor(q: Pick<Q, "kind" | "line" | "text">, side: 1 | 2, m: Names, duel = false) {
  const home = shortTeam(m.home.name), away = shortTeam(m.away.name);
  const short = q.text.length > 48 ? `${q.text.slice(0, 47).trimEnd()}…` : q.text;
  const what = q.kind === 1 ? `${home} win` : q.kind === 2 ? "the draw" : q.kind === 3 ? `${away} win` : q.kind === 4 ? `over ${q.line}.5 goals` : q.kind === 5 ? "both teams scoring" : `“${short}”`;
  if (q.kind === 4) return `${duel ? "1v1 on " : ""}${side === 1 ? what : `under ${q.line}.5 goals`}`;
  if (side === 1) return duel ? `1v1 on ${what}` : q.kind === 1 || q.kind === 3 ? what : `bet on ${what}`;
  return `${duel ? "1v1" : "bet"} against ${q.kind === 1 || q.kind === 3 ? `a ${what}` : what}`;
}

/**
 * What to do with a position's reading given the last one stored: `first` the first time we see it
 * (stored quietly, so kick-off at 0-0 never reads as a swing), `swing` when it turned, `track` when only
 * the score moved, `same` otherwise.
 */
export function compare(prev: Reading | undefined, cur: Reading): "first" | "swing" | "track" | "same" {
  if (!prev) return "first";
  if (prev.standing !== cur.standing) return "swing";
  return prev.home !== cur.home || prev.away !== cur.away ? "track" : "same";
}

/** The pushsent row that claims one swing: the same swing at the same score never goes out twice. */
export const swingId = (p: LivePosition) => `w${p.key}-${p.standing}-${p.home}-${p.away}`;
/** The pushsent row holding a position's last reading. */
export const readingId = (key: string) => `w${key}`;

const minute = (t: { elapsed: number; extra: number | null }) => `${t.elapsed}${t.extra ? `+${t.extra}` : ""}'`;
/** "B. Fernandes" -> "Fernandes"; full names stay as they are. */
const scorerName = (n: string) => n.replace(/^[A-Z]\.\s*/, "");

/**
 * The start of the push: "Fernandes 41'" when the scorer is in the match data, else "84' Chelsea level",
 * "41' Man Utd ahead", "70' Chelsea score", "62' goal ruled out", or just "62'" when the score didn't move.
 */
export function swingLead(m: Names, before: { home: number; away: number }, now: { home: number; away: number }, events?: GoalEvent[]) {
  const dh = now.home - before.home, da = now.away - before.away;
  const goals = (events ?? []).filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
  // Only trust the events once they've caught up with the score (cached detail can be a goal behind).
  const last = goals.length === now.home + now.away ? goals[goals.length - 1] : undefined;
  const at = last ? minute(last.time) : m.elapsed ? `${m.elapsed}'` : "";
  if (dh + da < 0) return `${at} goal ruled out`.trim();
  if (dh + da === 0) return at || "Now";
  if (last?.player.name && last.detail !== "Own Goal") return `${scorerName(last.player.name)} ${at}`;
  const homeScored = last && m.home.id !== undefined ? last.team.id === m.home.id : dh > 0;
  const team = shortTeam(homeScored ? m.home.name : m.away.name);
  const [us, them] = homeScored ? [now.home, now.away] : [now.away, now.home];
  return `${at} ${team} ${us === them ? "level" : us === them + 1 ? "ahead" : "score"}`.trim();
}

/** One push per match per round, however many of the fan's positions swung on that goal. */
export function swingPush(m: Names, swung: LivePosition[], before: { home: number; away: number }, events?: GoalEvent[]) {
  const now = { home: swung[0].home, away: swung[0].away };
  const lead = swingLead(m, before, now, events);
  const score = `${shortTeam(m.home.name)} ${now.home}–${now.away} ${shortTeam(m.away.name)}`;
  const amount = (p: LivePosition) => (p.swing >= 0 ? `+${money(p.swing)}` : `−${money(-p.swing)}`);
  if (swung.length === 1) {
    const p = swung[0];
    return {
      title: `${lead}: your ${p.call} is now ${p.standing}${p.standing === "winning" ? ` (${amount(p)})` : ""}`,
      body: `${score} · ${amount(p)} if it ends like this`,
      url: "/live",
      tag: `swing-${p.fixture}`,
    };
  }
  const net = swung.reduce((s, p) => s + p.swing, 0);
  return {
    title: `${lead}: ${swung.length} of your bets swing`,
    body: `${swung.map((p) => `${p.call} now ${p.standing}`).join(" · ")} · ${score}, ${net >= 0 ? "+" : "−"}${money(Math.abs(net))} on these if it ends like this`,
    url: "/live",
    tag: `swing-${swung[0].fixture}`,
  };
}

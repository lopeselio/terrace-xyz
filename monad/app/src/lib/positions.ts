import { questionLabel, sideLabel } from "./labels";
import { betOutcome, effectiveAnswer, standardAnswer } from "./outcome";
import { FINISHED, LIVE } from "@/components/MatchRow";
import type { MatchLite } from "./useMatches";

/*
 * Game day: every position a fan holds, grouped by match and read against the live score.
 * A reading ("winning as it stands") is never a result; results come from CRE and the indexer.
 */
export const RECENT = 36 * 3600; // settled positions stay on the board this long after kickoff (older ones live on Profile)

type Fx = { id: string; kickoff: string; state: number; homeGoals: number; awayGoals: number };
export type Q = { id: string; text: string; kind: number; line: number; answer: number; closeTime: string; spec: string | null; fixture: Fx | null };
export type RawBet = { id: string; side: number; stake: string; result: number | null; payout: string | null; market: { id: string; feeBps: number; yesPool: string; noPool: string; isFlash: boolean; question: Q } };
export type RawDuel = { id: string; challenger: string; opponent: string | null; challengerSide: number; stake: string; status: number; winner: string | null; question: Q };
export type Acca = { id: string; legs: number; liveLegs: number; stake: string; status: number; payout: string | null };

/**
 * won/lost/refund: settled. winning/losing: as it stands (or as it finished, before the result lands).
 * live: in play with nothing to read. due: over (or past kick-off) and waiting on its result.
 * upcoming. waiting: a 1v1 nobody has taken yet; expired: one nobody took before kick-off.
 */
export type Standing = "won" | "lost" | "refund" | "winning" | "losing" | "live" | "due" | "upcoming" | "waiting" | "expired";

export type Position = {
  key: string;
  kind: "bet" | "duel";
  title: string;
  pick: string; // the side in plain words
  stake: number; // raw units (6 decimals)
  returns: number | null; // if this side wins (null when unknown: a sealed side)
  standing: Standing;
  collectible: boolean; // a bet that has paid out on-chain and is waiting to be collected
  flash: boolean;
  href: string;
  side: 1 | 2 | null; // null: a sealed pick
  question: Q;
  bet?: RawBet;
};

export type MatchGroup = {
  fixture: number;
  match?: MatchLite;
  kickoff: number;
  phase: "live" | "fulltime" | "upcoming";
  score: { home: number; away: number } | null;
  positions: Position[];
  staked: number; // still riding
  ifEndsNow: number | null; // net, live and full-time matches only
};

const Q_FIELDS = `question { id text kind line answer closeTime spec fixture { id kickoff state homeGoals awayGoals } }`;
export const GD_BET = `id side stake result payout market { id feeBps yesPool noPool isFlash ${Q_FIELDS} }`;
export const GD_DUEL = `id challenger opponent challengerSide stake status winner ${Q_FIELDS}`;

export const GD_QUERY = `query GD($me: String!, $since: numeric!) {
  Bet(where: { bettor: { _eq: $me }, market: { question: { _or: [{ answer: { _eq: 0 } }, { fixture: { kickoff: { _gt: $since } } }] } } }) { ${GD_BET} }
  Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }], status: { _in: [0, 1, 4, 5] } }) { ${GD_DUEL} }
  Parlay(where: { player: { _eq: $me }, status: { _eq: 0 } }, order_by: { id: desc }) { id legs liveLegs stake status payout }
}`;

/** Answer (1 yes / 2 no) a question would get if the match ended now, or null with nothing to read. */
function reading(q: Q, m: MatchLite | undefined, custom: Record<string, "YES" | "NO" | null>): 1 | 2 | null {
  if (q.kind >= 1 && q.kind <= 5) {
    const h = m?.goals?.home, a = m?.goals?.away;
    if (h === null || h === undefined || a === null || a === undefined) return null;
    return standardAnswer(q.kind, q.line, { state: 1, homeGoals: h, awayGoals: a }) as 1 | 2;
  }
  const r = custom[q.id];
  return r === "YES" ? 1 : r === "NO" ? 2 : null;
}

/** What a pool bet pays if the question settles with this answer (raw units). */
function poolPays(b: RawBet, answer: 1 | 2) {
  return betOutcome({ ...b, result: null, market: { ...b.market, question: { ...b.market.question, answer } } }).amount;
}

function phaseOf(m: MatchLite | undefined, fx: Fx | null, now: number): MatchGroup["phase"] {
  if (m && LIVE.has(m.status)) return "live";
  if ((m && FINISHED.has(m.status)) || (fx && fx.state !== 0)) return "fulltime";
  if (m) return m.kickoff < now - 3 * 3600 ? "fulltime" : "upcoming"; // past kick-off and never played: postponed
  // Not on the schedule any more: in play for the first two hours after kick-off, then it's over.
  const kickoff = Number(fx?.kickoff ?? 0);
  return !kickoff || kickoff > now ? "upcoming" : kickoff > now - 2 * 3600 ? "live" : "fulltime";
}

/** Where an unsettled position stands: by the clock first, then by the score if there's one to read. */
function openStanding(g: MatchGroup, side: 1 | 2 | null, r: 1 | 2 | null, now: number): Standing {
  if (g.phase === "upcoming") return g.kickoff && g.kickoff <= now ? "due" : "upcoming";
  if (side === null || r === null) return g.phase === "live" ? "live" : "due";
  return r === side ? "winning" : "losing";
}

export function buildGroups(bets: RawBet[], duels: RawDuel[], me: string, matches: Map<number, MatchLite>, custom: Record<string, "YES" | "NO" | null>, now: number) {
  const groups = new Map<number, MatchGroup>();
  const group = (q: Q) => {
    const id = Number(q.fixture?.id ?? 0);
    let g = groups.get(id);
    if (!g) {
      const m = matches.get(id);
      const phase = phaseOf(m, q.fixture, now);
      const fx = q.fixture;
      const score = m?.goals?.home != null && m.goals.away != null ? { home: m.goals.home, away: m.goals.away } : fx && fx.state === 1 ? { home: fx.homeGoals, away: fx.awayGoals } : null;
      g = { fixture: id, match: m, kickoff: m?.kickoff ?? Number(fx?.kickoff ?? 0), phase, score, positions: [], staked: 0, ifEndsNow: null };
      groups.set(id, g);
    }
    return g;
  };
  const recent = (q: Q) => Number(q.fixture?.kickoff ?? 0) > now - RECENT;
  const href = (q: Q) => (q.fixture ? `/m/${q.fixture.id}` : "/me");

  for (const raw of bets) {
    // Act on the answer the contracts use, so a timed-out question shows as a refund.
    const b = { ...raw, market: { ...raw.market, question: { ...raw.market.question, answer: effectiveAnswer(raw.market.question, now) } } };
    const q = b.market.question;
    if (q.text.startsWith("E2E ")) continue;
    const settled = betOutcome(b);
    const toCollect = !settled.collected && (settled.outcome === "won" || settled.outcome === "refund");
    const g = group(q);
    const side = b.side === 1 || b.side === 2 ? (b.side as 1 | 2) : null;
    let standing: Standing;
    if (settled.outcome !== "open") standing = settled.outcome;
    else standing = openStanding(g, side, reading(q, g.match, custom), now);
    g.positions.push({
      key: `b${b.id}`,
      kind: "bet",
      title: questionLabel(q, g.match),
      pick: side ? sideLabel(side, q) : "Sealed pick",
      stake: Number(b.stake),
      returns: settled.outcome !== "open" ? settled.amount : side ? poolPays(b, side) : null,
      standing,
      collectible: toCollect,
      flash: b.market.isFlash,
      href: href(q),
      side,
      question: q,
      bet: b,
    });
  }

  for (const d of duels) {
    const q = d.question;
    if ((d.status === 4 || d.status === 5) && !recent(q)) continue;
    const g = group(q);
    const mine = d.challenger === me ? d.challengerSide : 3 - d.challengerSide;
    const side = (mine === 1 ? 1 : 2) as 1 | 2;
    let standing: Standing;
    if (d.status === 4) standing = d.winner === me ? "won" : "lost";
    else if (d.status === 5 || effectiveAnswer(q, now) === 3) standing = "refund";
    else if (d.status === 0) standing = g.phase === "upcoming" && g.kickoff > now ? "waiting" : "expired";
    else standing = openStanding(g, side, reading(q, g.match, custom), now);
    const stake = Number(d.stake);
    g.positions.push({
      key: `d${d.id}`,
      kind: "duel",
      title: questionLabel(q, g.match),
      pick: `${sideLabel(side, q)} · 1v1`,
      stake,
      returns: d.status === 5 || standing === "expired" ? stake : stake * 2,
      standing,
      collectible: false,
      flash: false,
      href: `/c/${d.id}`,
      side,
      question: q,
    });
  }

  for (const g of groups.values()) {
    const riding = g.positions.filter((p) => !["won", "lost", "refund"].includes(p.standing));
    g.staked = riding.reduce((s, p) => s + p.stake, 0);
    if (g.phase !== "upcoming") {
      const read = g.positions.filter((p) => p.standing === "winning" || p.standing === "losing");
      g.ifEndsNow = read.length ? read.reduce((s, p) => s + (p.standing === "winning" ? (p.returns ?? p.stake) - p.stake : -p.stake), 0) : null;
    }
  }
  const order = { live: 0, fulltime: 1, upcoming: 2 } as const;
  return [...groups.values()]
    .filter((g) => g.positions.length)
    .sort((a, b) => order[a.phase] - order[b.phase] || (a.phase === "fulltime" ? b.kickoff - a.kickoff : a.kickoff - b.kickoff));
}

/** Open positions for several fans at once (the mates strip): bets only, each row tagged with its fan. */
export const MATES_QUERY = `query Mates($fans: [String!]) {
  Bet(where: { bettor: { _in: $fans }, market: { question: { answer: { _eq: 0 } } } }, limit: 400) { id bettor side stake result payout market { id feeBps yesPool noPool isFlash question { id text kind line answer closeTime spec fixture { id kickoff state homeGoals awayGoals } } } }
}`;

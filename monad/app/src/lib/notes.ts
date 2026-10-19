/*
 * What happened to a fan, built from the indexer: challenges a mate sent, 1v1s taken on and settled,
 * bet results, new followers and social points. Shared by the bell (client) and the push sender (server)
 * so a push and the bell always say the same thing. No React here.
 */
import { money } from "./money";
import { fanName } from "./names";
import { questionLabel, type MatchNames, type QuestionLike } from "./labels";
import { betOutcome } from "./outcome";
import { points, reasonLabel } from "./terracePoints";
import type { IconName } from "@/components/Icon";

type Q = QuestionLike & { answer?: number };
export type DuelN = { id: string; challenger: string; opponent: string | null; stake: string; status: number; winner: string | null; createdAt: string; question: Q };
export type BetN = {
  id: string; bettor?: string; side: number; stake: string; result: number | null; payout: string | null;
  market: { id: string; feeBps: number; yesPool: string; noPool: string; take: { room_id: string } | null; question: Q & { answer: number; closeTime: string } };
};
export type PointN = { id: string; reason: string; amount: string; timestamp: string };
export type FollowN = { follower: string; followee?: string; since: string };

/** Which push setting a note falls under. Points lines only show in the bell. */
export type NoteKind = "results" | "challenges" | "followers" | "points";

export type Note = {
  id: string;
  kind: NoteKind;
  at: number;
  icon: IconName;
  tone: "green" | "red" | "amber" | "violet" | "neutral";
  who?: string;
  title: string;
  sub?: string;
  href: string;
  action?: string;
  /** Show a Follow back button for this fan instead of a link. */
  followBack?: string;
};

export const DUEL_FIELDS = `id challenger opponent stake status winner createdAt question { kind line text answer fixture { id } }`;
export const BET_FIELDS = `id bettor side stake result payout market { id feeBps yesPool noPool take { room_id } question { kind line text answer closeTime fixture { id } } }`;

const SOCIAL_REASONS = new Set(["TAKE_BACKED", "BET_ON_YOUR_TAKE", "CHALLENGE_TAKEN", "LEAGUE_MEMBER", "INVITE", "STREAK_3", "STREAK_7"]);

/** Fixture ids these rows mention, so the caller can look up team names. */
export const fixtureIds = (duels: DuelN[], bets: BetN[]) =>
  [...new Set([...duels.map((m) => m.question.fixture?.id), ...bets.map((b) => b.market.question.fixture?.id)].filter(Boolean).map(Number))];

export function buildNotes(
  me: string,
  d: { duels: DuelN[]; bets: BetN[]; follows: FollowN[]; points?: PointN[] },
  look: { agents: Map<string, string>; match: (id: number) => MatchNames | undefined },
): Note[] {
  const name = (a: string) => look.agents.get(a) || fanName(a);
  const label = (q: Q) => questionLabel(q, q.fixture ? look.match(Number(q.fixture.id)) : undefined) || "a match result";
  const out: Note[] = [];

  for (const m of d.duels) {
    const mine = m.challenger === me;
    const other = mine ? m.opponent : m.challenger;
    const at = Number(m.createdAt);
    const base = { kind: "challenges" as const, at, href: `/c/${m.id}` };
    if (!mine && m.status === 0) {
      out.push({ ...base, id: `c${m.id}`, icon: "swords", tone: "green", who: m.challenger, title: `${name(m.challenger)} challenged you`, sub: `${label(m.question)} · ${money(m.stake)} each`, action: "Accept" });
    } else if (mine && m.status === 1 && other) {
      out.push({ ...base, id: `a${m.id}`, icon: "swords", tone: "amber", who: other, title: `${name(other)} took on your 1v1`, sub: `${label(m.question)} · winner takes ${money(Number(m.stake) * 2)}` });
    } else if (m.status === 4) {
      const won = m.winner === me;
      out.push({ ...base, kind: "results", id: `s${m.id}`, icon: won ? "trophy" : "close", tone: won ? "green" : "red", who: other ?? undefined, title: won ? `You won your 1v1 with ${other ? name(other) : "a mate"}` : `${other ? name(other) : "Your mate"} won your 1v1`, sub: `${label(m.question)} · ${won ? "+" : "−"}${money(won ? Number(m.stake) * 2 : m.stake)}` });
    } else if (mine && m.status === 2 && other) {
      out.push({ ...base, id: `d${m.id}`, icon: "swords", tone: "neutral", who: other, title: `${name(other)} turned down your 1v1`, sub: `${label(m.question)} · your stake is back` });
    }
  }

  for (const b of d.bets) {
    const r = betOutcome(b);
    if (r.outcome === "open") continue;
    const fixture = b.market.question.fixture?.id ?? b.market.take?.room_id.split("-")[1];
    out.push({
      id: `b${b.id}`,
      kind: "results",
      at: Number(b.market.question.closeTime),
      icon: r.outcome === "won" ? "trophy" : r.outcome === "lost" ? "close" : "refresh",
      tone: r.outcome === "won" ? "green" : r.outcome === "lost" ? "red" : "neutral",
      title: r.outcome === "won" ? `You won ${money(r.amount)}` : r.outcome === "lost" ? `Your bet didn't come in · −${money(r.amount)}` : `Stake back · ${money(r.amount)}`,
      sub: label(b.market.question),
      href: r.collected ? (fixture ? `/m/${fixture}` : "/me") : "/me",
      action: !r.collected && r.outcome !== "lost" ? "Collect" : undefined,
    });
  }

  for (const f of d.follows) {
    out.push({ id: `f${f.follower}`, kind: "followers", at: Number(f.since), icon: "users", tone: "green", who: f.follower, title: `${name(f.follower)} followed you`, sub: "Follow back to see their calls in your feed", href: "/social", followBack: f.follower });
  }

  for (const e of d.points ?? []) {
    if (!SOCIAL_REASONS.has(e.reason)) continue;
    out.push({ id: `p${e.id}`, kind: "points", at: Number(e.timestamp), icon: "bolt", tone: "amber", title: reasonLabel(e.reason), sub: `+${points(e.amount)} Terrace Points`, href: "/me" });
  }

  return out.sort((a, b) => b.at - a.at);
}

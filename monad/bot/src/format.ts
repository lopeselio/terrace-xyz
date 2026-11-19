/*
 * Everything the bot says in a group. House voice: football language, short lines, never an address,
 * hash or crypto word. Messages use Telegram HTML parse mode, so user text is always escaped.
 */
import type { Fixture } from "./parse";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const when = (unix: number, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(unix * 1000));
export const clock = (unix: number, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(unix * 1000));

export const matchLabel = (f: Pick<Fixture, "home" | "away">) => `${f.home.name} v ${f.away.name}`;
export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Reply to a new take: the rule in plain English, the match, kickoff and when backing closes. */
export function takeCard(t: { author: string; text: string; reading: string; fixture: Fixture; closeTime: number; stake: number; ruled: boolean; tz: string }) {
  const lock = Math.abs(t.closeTime - t.fixture.kickoff) < 60 ? `at kick-off (${clock(t.closeTime, t.tz)})` : when(t.closeTime, t.tz);
  return [
    `<b>${esc(t.author)}'s take</b>: “${esc(t.text)}”`,
    "",
    `<b>The rule:</b> ${esc(t.reading)}`,
    `<b>Match:</b> ${esc(matchLabel(t.fixture))} · ${esc(t.fixture.league)}`,
    `<b>Kick-off:</b> ${when(t.fixture.kickoff, t.tz)}`,
    `<b>Locks:</b> ${lock}`,
    t.ruled ? "Settled from the match data by Chainlink." : "Settled by Chainlink's AI judge after full time. Unclear means refunds.",
    "",
    `Back it or fade it, ${money(t.stake)} each. The first one in opens the market.`,
  ].join("\n");
}

export const listedLine = (n: { backers: number; pot: number }) =>
  n.backers ? `\n\n<b>Open:</b> ${n.backers} in, ${money(n.pot)} in the pot.` : "\n\n<b>Open</b> on Terrace.";

export const ANSWER = ["", "came in", "didn't happen", "refunded"] as const;

export type Settled = {
  text: string;
  answer: 1 | 2 | 3;
  ruled: boolean;
  match: string;
  score?: string;
  winners: string[];
  refunded: string[];
};

/** Full-time result for one take: what happened, where the result came from, and who won (names only). */
export function settlementCard(s: Settled) {
  const source = s.ruled ? "Chainlink, from the official match data" : "Chainlink's AI judge, reading the match reports";
  const head =
    s.answer === 3
      ? `<b>Refunded</b>: “${esc(s.text)}” couldn't be called, so everyone gets their stake back.`
      : `<b>${s.answer === 1 ? "It came in" : "It didn't happen"}</b>: “${esc(s.text)}”`;
  const lines = [head, `${esc(s.match)}${s.score ? ` · ${esc(s.score)}` : ""}`, `<i>Result from ${source}.</i>`];
  if (s.answer !== 3) lines.push(s.winners.length ? `Winners: ${s.winners.map(esc).join(", ")}` : "No winners on this one.");
  else if (s.refunded.length) lines.push(`Refunded: ${s.refunded.map(esc).join(", ")}`);
  lines.push("Collect on Terrace.");
  return lines.join("\n");
}

/** Dispute reply. The bot never relitigates a result; settlement is Chainlink's call. */
export const disputeReply = () =>
  "I don't referee the referee. Results come straight from the match data through Chainlink, not from me, and anything unclear is refunded.";

export type LiveEvent = { kind: "goal" | "red" | "yellow" | "kickoff" | "ht" | "ft"; minute: number | null; team?: string; player?: string };

/** One message for a burst of match events (debounced), instead of a message per event. */
export function liveCard(match: string, score: string, events: LiveEvent[]) {
  const ICON: Record<LiveEvent["kind"], string> = { goal: "⚽", red: "🟥", yellow: "🟨", kickoff: "▶️", ht: "⏸", ft: "🏁" };
  const words: Record<LiveEvent["kind"], string> = { goal: "Goal", red: "Red card", yellow: "Yellow card", kickoff: "Kick-off", ht: "Half-time", ft: "Full-time" };
  const lines = events.map((e) => `${ICON[e.kind]} ${e.minute != null ? `${e.minute}' ` : ""}${words[e.kind]}${e.player ? ` · ${esc(e.player)}` : ""}${e.team ? ` (${esc(e.team)})` : ""}`);
  return [`<b>${esc(match)}</b> · ${esc(score)}`, ...lines].join("\n");
}

export type OpenMarket = { text: string; match: string; closeTime: number; backers: number; pot: number; open: boolean };
export function marketsCard(list: OpenMarket[], tz: string) {
  if (!list.length) return "No takes open in this chat. Start one: <code>/take Saka scores Sunday</code>";
  return ["<b>This chat's takes</b>", ...list.map((m, i) => `${i + 1}. “${esc(m.text)}” · ${esc(m.match)} · ${m.open ? `${m.backers} in, ${money(m.pot)} · locks ${when(m.closeTime, tz)}` : "waiting for the first backer"}`)].join("\n");
}

export type TableRow = { name: string; won: number; lost: number; points: number };
export function tableCard(rows: TableRow[]) {
  if (!rows.length) return "No table yet. Use /mylink to put your Terrace record on this chat's table.";
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.won - a.won);
  return ["<b>The table</b>", ...sorted.slice(0, 15).map((r, i) => `${i + 1}. ${esc(r.name)} · ${r.points} pts · W${r.won} L${r.lost}`)].join("\n");
}

export const helpText = (bot: string) =>
  [
    "<b>Terrace</b> turns the chat's takes into markets.",
    `Tag me with a take: <code>@${bot} Saka scores Sunday, 10</code> or <code>/take Saka scores Sunday</code>.`,
    "I'll write the rule, the match and when it locks. Tap Back it or Fade it to play on Terrace.",
    "/markets this chat's takes · /table this chat's table · /mylink put your Terrace record on the table",
  ].join("\n");

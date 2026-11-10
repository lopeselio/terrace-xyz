/**
 * Game day: every open position grouped by match and read against the live score.
 *
 * The rules mirror Terrace's app (app/src/lib/positions.ts and app/src/lib/outcome.ts) so a Claude
 * and the app tell a fan the same thing. A reading ("winning as it stands") is never a result;
 * results come from Chainlink CRE and the indexer. This module has no account and no key, so it can
 * read anyone's game day from Terrace's public API.
 */

// ---------------------------------------------------------------- mirrors app/src/lib/outcome.ts

/** TerraceOracle.RESOLVE_GRACE: a match or take with no answer this long after it closes counts as void. */
export const RESOLVE_GRACE = 3 * 86400;

type BetLike = {
  side: number;
  stake: string;
  result: number | null; // 0 refund, 1 won, 2 lost (once collected)
  payout: string | null;
  market: { feeBps: number; yesPool: string; noPool: string; question: { answer: number } };
};

/** What a bet comes to, exactly as TerraceMarkets.settleBet pays it. */
export function betOutcome(b: BetLike): { outcome: "won" | "lost" | "refund" | "open"; amount: number; collected: boolean } {
  const stake = Number(b.stake);
  if (b.result !== null) {
    const outcome = b.result === 1 ? "won" : b.result === 2 ? "lost" : "refund";
    return { outcome, amount: outcome === "lost" ? stake : Number(b.payout ?? stake), collected: true };
  }
  const answer = b.market.question.answer; // 0 open, 1 yes, 2 no, 3 void
  if (answer === 0) return { outcome: "open", amount: stake, collected: false };
  const yes = Number(b.market.yesPool), no = Number(b.market.noPool);
  const winning = answer === 1 ? yes : answer === 2 ? no : 0;
  if (answer === 3 || b.side === 0 || winning === 0) return { outcome: "refund", amount: stake, collected: false };
  if (b.side !== answer) return { outcome: "lost", amount: stake, collected: false };
  const gross = (stake * (yes + no)) / winning;
  return { outcome: "won", amount: gross - ((gross - stake) * b.market.feeBps) / 10_000, collected: false };
}

/** A standard question's answer from a score, as TerraceOracle.outcomeOf works it out. 0 open, 1 yes, 2 no, 3 void. */
export function standardAnswer(kind: number, line: number, f: { state: number; homeGoals: number; awayGoals: number }) {
  if (kind === 0 || f.state === 0) return 0;
  if (f.state === 2) return 3;
  const h = f.homeGoals, a = f.awayGoals;
  const yes = kind === 1 ? h > a : kind === 2 ? h === a : kind === 3 ? a > h : kind === 4 ? h + a > line : h > 0 && a > 0;
  return yes ? 1 : 2;
}

/** The answer the contracts act on: the stored one, or void once the match is off or the grace has passed. */
export function effectiveAnswer(q: { answer: number; kind: number; closeTime?: string | null; fixture?: { state: number; kickoff: string } | null }, now = Date.now() / 1000): number {
  if (q.answer !== 0) return q.answer;
  if (q.fixture?.state === 2) return 3;
  const close = q.kind === 0 ? Number(q.closeTime || q.fixture?.kickoff || 0) : q.fixture?.state === 0 ? Number(q.fixture.kickoff) : 0;
  return close && now > close + RESOLVE_GRACE ? 3 : 0;
}

// ---------------------------------------------------------------- mirrors app/src/lib/labels.ts

type Names = { home: { name: string }; away: { name: string } };

export function questionLabel(q: { kind: number; line: number; text: string }, m?: Names): string {
  const home = m?.home.name ?? "Home";
  const away = m?.away.name ?? "Away";
  switch (q.kind) {
    case 1: return `${home} win`;
    case 2: return `${home} v ${away}: draw`;
    case 3: return `${away} win`;
    case 4: return `Over ${q.line}.5 goals in ${home} v ${away}`;
    case 5: return `Both teams score in ${home} v ${away}`;
    default: return q.text;
  }
}

const sideLabel = (side: number, q: { kind: number }) => (side === 1 ? "Yes" : q.kind >= 1 && q.kind <= 3 ? "No" : "Not happening");

// ---------------------------------------------------------------- mirrors app/src/lib/positions.ts

export const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
export const FINISHED = new Set(["FT", "AET", "PEN"]);
export const RECENT = 36 * 3600; // settled positions stay on the board this long after kick-off

export type MatchLite = { id: number; kickoff: number; status: string; elapsed?: number | null; home: { name: string }; away: { name: string }; goals?: { home: number | null; away: number | null } };
type Fx = { id: string; kickoff: string; state: number; homeGoals: number; awayGoals: number };
export type Q = { id: string; text: string; kind: number; line: number; answer: number; closeTime: string; spec: string | null; fixture: Fx | null };
export type RawBet = { id: string; side: number; stake: string; result: number | null; payout: string | null; market: { id: string; feeBps: number; yesPool: string; noPool: string; isFlash: boolean; question: Q } };
export type RawDuel = { id: string; challenger: string; opponent: string | null; challengerSide: number; stake: string; status: number; winner: string | null; question: Q };
export type Acca = { id: string; legs: number; liveLegs: number; stake: string; status: number; payout: string | null };
export type Readings = Record<string, "YES" | "NO" | null>;

/**
 * won/lost/refund: settled. winning/losing: as it stands (or as it finished, before the result lands).
 * live: in play with nothing to read. due: over (or past kick-off) and waiting on its result.
 * upcoming. waiting: a 1v1 nobody has taken yet; expired: one nobody took before kick-off.
 */
export type Standing = "won" | "lost" | "refund" | "winning" | "losing" | "live" | "due" | "upcoming" | "waiting" | "expired";

export type Position = {
  kind: "bet" | "duel";
  id: number;
  title: string;
  take: boolean; // a fan's own words (quoted), not a standard market
  pick: string;
  stake: number; // raw units (6 decimals)
  returns: number | null; // if this side wins (null for a sealed pick)
  standing: Standing;
  collectible: boolean; // terrace_collect would pay this out now
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

export const GD_QUERY = `query GD($me: String!, $since: numeric!) {
  Bet(where: { bettor: { _eq: $me }, market: { question: { _or: [{ answer: { _eq: 0 } }, { fixture: { kickoff: { _gt: $since } } }] } } }) { id side stake result payout market { id feeBps yesPool noPool isFlash question { id text kind line answer closeTime spec fixture { id kickoff state homeGoals awayGoals } } } }
  Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }], status: { _in: [0, 1, 4, 5] } }) { id challenger opponent challengerSide stake status winner question { id text kind line answer closeTime spec fixture { id kickoff state homeGoals awayGoals } } }
  Parlay(where: { player: { _eq: $me }, status: { _eq: 0 } }, order_by: { id: desc }) { id legs liveLegs stake status payout }
}`;

/** Answer (1 yes / 2 no) a question would get if the match ended now, or null with nothing to read. */
function reading(q: Q, m: MatchLite | undefined, custom: Readings): 1 | 2 | null {
  if (q.kind >= 1 && q.kind <= 5) {
    const h = m?.goals?.home, a = m?.goals?.away;
    if (h === null || h === undefined || a === null || a === undefined) return null;
    return standardAnswer(q.kind, q.line, { state: 1, homeGoals: h, awayGoals: a }) as 1 | 2;
  }
  const r = custom[q.id];
  return r === "YES" ? 1 : r === "NO" ? 2 : null;
}

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

function openStanding(g: MatchGroup, side: 1 | 2 | null, r: 1 | 2 | null, now: number): Standing {
  if (g.phase === "upcoming") return g.kickoff && g.kickoff <= now ? "due" : "upcoming";
  if (side === null || r === null) return g.phase === "live" ? "live" : "due";
  return r === side ? "winning" : "losing";
}

export function buildGroups(bets: RawBet[], duels: RawDuel[], me: string, matches: Map<number, MatchLite>, custom: Readings, now: number): MatchGroup[] {
  const groups = new Map<number, MatchGroup>();
  const group = (q: Q) => {
    const id = Number(q.fixture?.id ?? 0);
    let g = groups.get(id);
    if (!g) {
      const m = matches.get(id);
      const fx = q.fixture;
      const score = m?.goals?.home != null && m.goals.away != null ? { home: m.goals.home, away: m.goals.away } : fx && fx.state === 1 ? { home: fx.homeGoals, away: fx.awayGoals } : null;
      g = { fixture: id, match: m, kickoff: m?.kickoff ?? Number(fx?.kickoff ?? 0), phase: phaseOf(m, fx, now), score, positions: [], staked: 0, ifEndsNow: null };
      groups.set(id, g);
    }
    return g;
  };
  const recent = (q: Q) => Number(q.fixture?.kickoff ?? 0) > now - RECENT;

  for (const raw of bets) {
    // Act on the answer the contracts use, so a timed-out question shows as a refund.
    const b = { ...raw, market: { ...raw.market, question: { ...raw.market.question, answer: effectiveAnswer(raw.market.question, now) } } };
    const q = b.market.question;
    if (q.text.startsWith("E2E ")) continue;
    const settled = betOutcome(b);
    const g = group(q);
    const side = b.side === 1 || b.side === 2 ? (b.side as 1 | 2) : null;
    g.positions.push({
      kind: "bet",
      id: Number(b.market.id),
      title: questionLabel(q, g.match),
      take: q.kind === 0,
      pick: side ? sideLabel(side, q) : "Sealed pick",
      stake: Number(b.stake),
      returns: settled.outcome !== "open" ? settled.amount : side ? poolPays(b, side) : null,
      standing: settled.outcome !== "open" ? settled.outcome : openStanding(g, side, reading(q, g.match, custom), now),
      collectible: !settled.collected && (settled.outcome === "won" || settled.outcome === "refund"),
    });
  }

  for (const d of duels) {
    const q = d.question;
    if ((d.status === 4 || d.status === 5) && !recent(q)) continue;
    const g = group(q);
    const mine = d.challenger === me ? d.challengerSide : 3 - d.challengerSide;
    const side = (mine === 1 ? 1 : 2) as 1 | 2;
    const answer = effectiveAnswer(q, now);
    // MCP only: what terrace_collect would pay out now (the app leaves 1v1s to the challenge page)
    const settles = d.status === 1 && q.answer !== 0;
    const expires = d.status === 0 && d.challenger === me && Number(q.closeTime) <= now;
    let standing: Standing;
    if (d.status === 4) standing = d.winner === me ? "won" : "lost";
    else if (d.status === 5 || answer === 3) standing = "refund";
    else if (d.status === 0) standing = g.phase === "upcoming" && g.kickoff > now ? "waiting" : "expired";
    else if (settles) standing = answer === side ? "won" : "lost"; // MCP only: the result is in, so say so rather than read the score
    else standing = openStanding(g, side, reading(q, g.match, custom), now);
    const collectible = (settles && (standing === "won" || standing === "refund")) || expires;
    const stake = Number(d.stake);
    g.positions.push({
      kind: "duel",
      id: Number(d.id),
      title: questionLabel(q, g.match),
      take: q.kind === 0,
      pick: `${sideLabel(side, q)}, 1v1`,
      stake,
      returns: d.status === 5 || standing === "expired" || standing === "refund" ? stake : stake * 2,
      standing,
      collectible,
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

/** The custom takes worth reading live: rule-based, unanswered, on a match in play or just finished. */
export function takesToRead(bets: RawBet[], duels: RawDuel[], matches: Map<number, MatchLite>, now: number) {
  const qs = [...bets.filter((b) => b.result === null).map((b) => b.market.question), ...duels.filter((d) => d.status === 1).map((d) => d.question)];
  const seen = new Set<string>();
  return qs
    .filter((q) => q.kind === 0 && q.spec && q.answer === 0 && q.fixture && !seen.has(q.id) && seen.add(q.id))
    .filter((q) => {
      const status = matches.get(Number(q.fixture!.id))?.status ?? "";
      return LIVE.has(status) || (FINISHED.has(status) && Number(q.fixture!.kickoff) > now - RECENT);
    })
    .map((q) => ({ id: q.id, fixture: Number(q.fixture!.id), spec: q.spec! }));
}

// ---------------------------------------------------------------- the board, in words

const usd = (raw: number) => `$${(raw / 1e6).toFixed(2)}`;
const signed = (raw: number) => `${raw >= 0 ? "+" : "-"}${usd(Math.abs(raw))}`;

const LABEL: Record<Standing, string> = {
  won: "Won",
  lost: "Lost",
  refund: "Refund",
  winning: "Winning",
  losing: "Losing",
  live: "In play",
  due: "Awaiting result",
  upcoming: "Not started",
  waiting: "Waiting for a mate",
  expired: "Not taken",
};

function amount(p: Position) {
  if (p.collectible) return p.standing === "won" ? `${usd(p.returns ?? p.stake)} (won ${signed((p.returns ?? p.stake) - p.stake)})` : `${usd(p.stake)} (stake back)`;
  if (p.standing === "winning" || p.standing === "won") return p.returns !== null ? `${signed(p.returns - p.stake)}` : "";
  if (p.standing === "losing" || p.standing === "lost") return signed(-p.stake);
  if (p.standing === "refund") return `${usd(p.stake)} back`;
  if (p.standing === "expired") return ""; // the challenger's stake comes back through terrace_collect; a mate never put one in
  return p.returns !== null ? `pays ${usd(p.returns)}` : "";
}

const kickoffWhen = (unix: number) => new Date(unix * 1000).toUTCString().replace(/:00 GMT$/, " UTC").replace(/ \d{4} /, " ");

function header(g: MatchGroup) {
  const m = g.match;
  const fixture = m ? `${m.home.name} v ${m.away.name}` : g.fixture ? `Match ${g.fixture}` : "Other takes";
  const score = g.score && m ? `${m.home.name} ${g.score.home}-${g.score.away} ${m.away.name}` : g.score ? `${fixture} (${g.score.home}-${g.score.away})` : fixture;
  if (g.phase === "live") return `LIVE ${m?.status === "HT" ? "HT" : m?.elapsed ? `${m.elapsed}'` : ""}`.trim() + `  ${score}`;
  if (g.phase === "fulltime") {
    const clock = m && !FINISHED.has(m.status) ? (m.status === "PST" ? "POSTPONED" : m.status) : "FT";
    const waiting = g.positions.some((p) => ["winning", "losing", "live", "due"].includes(p.standing));
    return `${clock}  ${score}${waiting ? " (awaiting result)" : ""}`;
  }
  return `${g.kickoff ? kickoffWhen(g.kickoff) : "Kick-off to be confirmed"}  ${fixture}`;
}

/** The game day as plain text: each match, its positions, then the totals. */
export function renderGameDay(groups: MatchGroup[], accas: Acca[]) {
  if (!groups.length && !accas.length) return "No open bets right now. Find a match with terrace_matches, or back a take from terrace_open_takes.";
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(header(g));
    for (const p of [...g.positions].sort((a, b) => Number(b.collectible) - Number(a.collectible))) {
      const label = p.collectible ? "To collect" : LABEL[p.standing];
      const amt = amount(p);
      lines.push(`  - ${p.take ? `"${p.title}"` : p.title}: ${p.pick}, ${usd(p.stake)} staked. ${label}${amt ? `, ${amt}` : ""}`);
    }
    if (g.ifEndsNow !== null) lines.push(`  ${g.phase === "live" ? "If it ends now" : "As it finished"}: ${signed(g.ifEndsNow)}`);
    lines.push("");
  }

  const all = groups.flatMap((g) => g.positions);
  const riding = groups.reduce((s, g) => s + g.staked, 0) + accas.reduce((s, a) => s + Number(a.stake), 0);
  const games = groups.filter((g) => g.staked > 0).length;
  const winning = all.filter((p) => p.standing === "winning").length;
  const losing = all.filter((p) => p.standing === "losing").length;
  const read = groups.filter((g) => g.ifEndsNow !== null);
  const net = read.reduce((s, g) => s + (g.ifEndsNow ?? 0), 0);
  const toCollect = all.filter((p) => p.collectible).reduce((s, p) => s + (p.returns ?? p.stake), 0);

  lines.push(`On the line: ${usd(riding)} across ${games} ${games === 1 ? "game" : "games"}${accas.length ? ` and ${accas.length} ${accas.length === 1 ? "parlay" : "parlays"}` : ""}.`);
  if (read.length) lines.push(`If it all ends now: ${signed(net)} (${winning} winning, ${losing} losing).`);
  if (toCollect > 0) lines.push(`Ready to collect: ${usd(toCollect)}. Run terrace_collect to pay it out.`);
  lines.push("Readings are as it stands, never a result: Chainlink settles every bet after full time.");
  return lines.join("\n");
}

// ---------------------------------------------------------------- loading it from Terrace's public API

async function post<T>(api: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${api}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`Terrace ${path} answered ${res.status}${out.error ? ` (${out.error})` : ""}.`);
  return out;
}

/** Everything the board needs for one player: positions, live scores, live readings of custom takes. */
export async function loadGameDay(api: string, address: string, now = Math.floor(Date.now() / 1000)) {
  const me = address.toLowerCase();
  const [d, list] = await Promise.all([
    post<{ data?: { Bet: RawBet[]; Matchup: RawDuel[]; Parlay: Acca[] }; error?: string }>(api, "/api/indexer", { query: GD_QUERY, variables: { me, since: now - RECENT } }),
    fetch(`${api}/api/matches`).then((r) => r.json() as Promise<MatchLite[]>).catch(() => [] as MatchLite[]),
  ]);
  if (!d.data) throw new Error(d.error ?? "Terrace's indexer is unavailable. Try again in a minute.");
  const { Bet: bets, Matchup: duels, Parlay: accas } = d.data;
  const matches = new Map(list.map((m) => [m.id, m]));
  const takes = takesToRead(bets, duels, matches, now);
  const custom = takes.length ? await post<Readings>(api, "/api/live", { takes }).catch(() => ({}) as Readings) : {};
  return { groups: buildGroups(bets, duels, me, matches, custom, now), accas };
}

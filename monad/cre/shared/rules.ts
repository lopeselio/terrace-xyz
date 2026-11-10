/**
 * Terrace rule language: how a take becomes something CRE can settle from match data.
 *
 * The take compiler (AI, in the app) turns chat text into a rule; the fan confirms its
 * plain-English reading; the rule is stored on-chain with the question; this module
 * evaluates it against API-Football's /fixtures?id= response (events, lineups, statistics,
 * players, score). Every CRE node runs the same pure function on the same data, so they
 * agree without any AI involved.
 *
 *   Rule   = { v: 1, left: Metric, op: Op, right?: Metric, value?: number }
 *   Metric = { events:  { type?, detail?, team?, player?, assist?, minute?: [from, to] } }  count of matching events
 *          | { lineup:  { player } }                                                     1 if in the starting XI
 *          | { stat:    { team, type } }                                                 team statistic ("Corner Kicks", "Ball Possession" -> 60 for "60%")
 *          | { player:  { player, field } }                                              player statistic by path ("shots.total", "goals.saves", "cards.yellow")
 *          | { score:   { side: "home" | "away" | "total", period?: "fulltime" | "halftime" } }
 *
 * Examples
 *   "Haaland scores before the hour"  { v:1, left:{events:{type:"Goal",player:1100,minute:[0,60]}}, op:">=", value:1 }
 *   "2+ red cards"                     { v:1, left:{events:{type:"Card",detail:"Red Card"}}, op:">=", value:2 }
 *   "Salah starts"                     { v:1, left:{lineup:{player:306}}, op:"==", value:1 }
 *   "Liverpool win the corners"        { v:1, left:{stat:{team:40,type:"Corner Kicks"}}, op:">", right:{stat:{team:50,type:"Corner Kicks"}} }
 *   "Alisson makes 5+ saves"           { v:1, left:{player:{player:280,field:"goals.saves"}}, op:">=", value:5 }
 */

export type Verdict = "YES" | "NO" | "VOID" | "PENDING";
type Op = ">=" | ">" | "==" | "<=" | "<";

type EventsMetric = {
  events: { type?: string; detail?: string; team?: number; player?: number; assist?: number; minute?: [number, number] };
};
type Metric =
  | EventsMetric
  | { lineup: { player: number } }
  | { stat: { team: number; type: string } }
  | { player: { player: number; field: string } }
  | { score: { side: "home" | "away" | "total"; period?: "fulltime" | "halftime" } };

export type Rule = { v: 1; left: Metric; op: Op; right?: Metric; value?: number };

/** The subset of API-Football's /fixtures?id= response the evaluator reads. */
export type FixtureDetail = {
  fixture: { status: { short: string; elapsed: number | null } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
  events?: {
    time: { elapsed: number; extra: number | null };
    team: { id: number };
    player: { id: number | null; name?: string | null };
    assist: { id: number | null; name?: string | null };
    type: string;
    detail: string;
  }[];
  lineups?: { team: { id: number }; startXI: { player: { id: number } }[] }[];
  statistics?: { team: { id: number }; statistics: { type: string; value: number | string | null }[] }[];
  players?: { team: { id: number }; players: { player: { id: number }; statistics: Record<string, unknown>[] }[] }[];
};

const FINISHED = new Set(["FT", "AET", "PEN"]);
const CALLED_OFF = new Set(["CANC", "AWD", "WO"]);
// Postponed or abandoned can still end in a result (a kickoff pushed back on the day shows as PST),
// so they wait; the oracle voids the question itself if nothing comes within 3 days.
const ON_HOLD = new Set(["PST", "ABD"]);
const NOT_STARTED = new Set(["NS", "TBD"]);
const OPS = new Set([">=", ">", "==", "<=", "<"]);

/** Parse and sanity-check a rule; anything malformed returns null (the question is then voided). */
export function parseRule(raw: string): Rule | null {
  try {
    const r = JSON.parse(raw) as Rule;
    if (r.v !== 1 || !OPS.has(r.op) || !isMetric(r.left)) return null;
    if (r.right !== undefined ? !isMetric(r.right) : typeof r.value !== "number") return null;
    return r;
  } catch {
    return null;
  }
}

function isMetric(m: unknown): m is Metric {
  if (!m || typeof m !== "object") return false;
  const keys = Object.keys(m);
  return keys.length === 1 && ["events", "lineup", "stat", "player", "score"].includes(keys[0]);
}

const compare = (a: number, op: Op, b: number) =>
  op === ">=" ? a >= b : op === ">" ? a > b : op === "==" ? a === b : op === "<=" ? a <= b : a < b;

/**
 * Settle a rule against the current match data.
 * Events counts only ever go up, so ">=" / ">" against a number can turn YES mid-match;
 * everything else waits until the data can no longer change (window over or full time).
 */
export function evaluate(rule: Rule, f: FixtureDetail): Verdict {
  const status = f.fixture.status.short;
  if (CALLED_OFF.has(status)) return "VOID";
  if (ON_HOLD.has(status)) return "PENDING";
  if (NOT_STARTED.has(status) && !("lineup" in rule.left)) return "PENDING";

  const finished = FINISHED.has(status);
  const left = metric(rule.left, f);
  const right = rule.right ? metric(rule.right, f) : { value: rule.value!, final: true };
  if (left.value === null || right.value === null) return finished ? "VOID" : "PENDING";

  const holds = compare(left.value, rule.op, right.value);
  const canOnlyGrow = "events" in rule.left && rule.right === undefined && (rule.op === ">=" || rule.op === ">");
  if (holds && canOnlyGrow) return "YES";
  if (left.final && right.final) return holds ? "YES" : "NO";
  return "PENDING";
}

/**
 * How a rule reads right now, for the live game-day view: YES or NO if the match ended this minute,
 * null when there's nothing to read yet (not started, or the data isn't published). Never used to settle.
 */
export function asItStands(rule: Rule, f: FixtureDetail): "YES" | "NO" | null {
  const settled = evaluate(rule, f);
  if (settled === "YES" || settled === "NO") return settled;
  if (settled === "VOID" || NOT_STARTED.has(f.fixture.status.short)) return null;
  const left = metric(rule.left, f).value;
  const right = rule.right ? metric(rule.right, f).value : rule.value!;
  if (left === null || right === null) return null;
  return compare(left, rule.op, right) ? "YES" : "NO";
}

/** A metric's value now, and whether it can still change. */
function metric(m: Metric, f: FixtureDetail): { value: number | null; final: boolean } {
  const status = f.fixture.status.short;
  const finished = FINISHED.has(status);
  const elapsed = f.fixture.status.elapsed ?? 0;

  if ("events" in m) {
    const q = m.events;
    const [from, to] = q.minute ?? [0, 200];
    const count = (f.events ?? []).filter(
      (e) =>
        (q.type === undefined || e.type === q.type) &&
        (q.detail === undefined || e.detail === q.detail) &&
        (q.team === undefined || e.team.id === q.team) &&
        (q.player === undefined || e.player.id === q.player) &&
        (q.assist === undefined || e.assist.id === q.assist) &&
        e.time.elapsed >= from &&
        e.time.elapsed <= to, // stoppage time (45+2) counts as minute 45
    ).length;
    const firstHalfOver = to <= 45 && !["1H"].includes(status) && !NOT_STARTED.has(status);
    const windowOver = finished || firstHalfOver || (elapsed > to && !["HT"].includes(status));
    return { value: count, final: windowOver };
  }

  if ("lineup" in m) {
    const lineups = f.lineups ?? [];
    if (lineups.length === 0) return { value: null, final: false }; // published about an hour before kickoff
    const starts = lineups.some((l) => l.startXI.some((s) => s.player.id === m.lineup.player));
    return { value: starts ? 1 : 0, final: true };
  }

  if ("stat" in m) {
    const team = (f.statistics ?? []).find((s) => s.team.id === m.stat.team);
    const raw = team?.statistics.find((s) => s.type === m.stat.type)?.value;
    const value = raw === undefined ? null : raw === null ? 0 : typeof raw === "number" ? raw : parseFloat(raw);
    return { value: Number.isNaN(value) ? null : value, final: finished };
  }

  if ("player" in m) {
    for (const team of f.players ?? []) {
      const p = team.players.find((x) => x.player.id === m.player.player);
      if (!p) continue;
      let v: unknown = p.statistics[0];
      for (const key of m.player.field.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
      const value = v === null || v === undefined ? 0 : typeof v === "number" ? v : parseFloat(String(v));
      return { value: Number.isNaN(value) ? null : value, final: finished };
    }
    // Didn't play (yet): zero once the match is over, unknown before.
    return { value: finished ? 0 : null, final: finished };
  }

  const s = m.score;
  const src = s.period === "halftime" ? f.score.halftime : f.goals;
  if (src.home === null || src.away === null) return { value: null, final: false };
  const value = s.side === "home" ? src.home : s.side === "away" ? src.away : src.home + src.away;
  const halftimeDone = s.period === "halftime" && !["1H"].includes(status) && !NOT_STARTED.has(status);
  return { value, final: finished || halftimeDone };
}

/** Compact match summary used as evidence for the AI judge on rule-less takes. */
export function evidence(f: FixtureDetail & { teams: { home: { id: number; name?: string }; away: { id: number; name?: string } } }): string {
  const name = (id: number) => (id === f.teams.home.id ? f.teams.home.name : f.teams.away.name) ?? String(id);
  const lines = (f.events ?? []).map(
    (e) =>
      // Names let the judge read "who scored" straight from the evidence instead of searching for it.
      `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ""}' ${e.type} (${e.detail}) ${name(e.team.id)} ${e.player.name ?? `player#${e.player.id ?? "?"}`}${e.assist?.name ? ` (assist ${e.assist.name})` : ""}`,
  );
  return [
    `Status: ${f.fixture.status.short}, minute ${f.fixture.status.elapsed ?? "-"}`,
    `Score: ${name(f.teams.home.id)} ${f.goals.home ?? "-"}-${f.goals.away ?? "-"} ${name(f.teams.away.id)} (HT ${f.score.halftime.home ?? "-"}-${f.score.halftime.away ?? "-"})`,
    "Events:",
    ...lines,
  ].join("\n");
}

export type Names = { teams: Record<number, string>; players: Record<number, string> };

const OP_WORDS: Record<Op, string> = { ">=": "at least", ">": "more than", "==": "exactly", "<=": "at most", "<": "fewer than" };

/**
 * The plain-English reading a fan confirms before a take becomes a market. Generated from the
 * rule itself, never by the AI, so what the fan agrees to is exactly what CRE will check.
 */
export function describeRule(rule: Rule, names: Names): string {
  const left = describeMetric(rule.left, names);
  if (rule.right) {
    const cmp = rule.op === ">" ? "is higher than" : rule.op === "<" ? "is lower than" : rule.op === "==" ? "equals" : rule.op === ">=" ? "is at least" : "is at most";
    return `Settles YES if ${left.what} ${cmp} ${describeMetric(rule.right, names).what}${left.when}.`;
  }
  const n = rule.value!;
  if ("lineup" in rule.left) return `Settles YES if ${left.what} ${n >= 1 ? "is in" : "is not in"} the starting XI.`;
  if ("events" in rule.left && rule.op === ">=" && n === 1) return `Settles YES if there is ${left.single}${left.when}.`;
  return `Settles YES if ${left.what} is ${OP_WORDS[rule.op]} ${n}${left.unit}${left.when}.`;
}

const PLAYER_FIELDS: Record<string, string> = {
  "goals.total": "goals",
  "goals.assists": "assists",
  "goals.saves": "saves",
  "goals.conceded": "goals conceded",
  "shots.total": "shots",
  "shots.on": "shots on target",
  "passes.total": "passes",
  "passes.key": "key passes",
  "tackles.total": "tackles",
  "cards.yellow": "yellow cards",
  "cards.red": "red cards",
  "fouls.committed": "fouls",
  "dribbles.success": "successful dribbles",
  "games.minutes": "minutes played",
};

function describeMetric(m: Metric, names: Names): { what: string; single: string; unit: string; when: string } {
  const team = (id?: number) => (id === undefined ? "" : names.teams[id] ?? `team ${id}`);
  const player = (id?: number) => (id === undefined ? "" : names.players[id] ?? `player ${id}`);
  if ("events" in m) {
    const e = m.events;
    const kind = e.detail ? e.detail.toLowerCase() : e.type === "Card" ? "card" : e.type === "subst" ? "substitution" : (e.type ?? "event").toLowerCase();
    const by = e.player !== undefined ? ` by ${player(e.player)}` : e.team !== undefined ? ` for ${team(e.team)}` : "";
    const assisted = e.assist !== undefined ? `, assisted by ${player(e.assist)}` : "";
    const when = e.minute ? ` between minute ${e.minute[0]} and ${e.minute[1]}` : "";
    return { what: `the number of ${kind}s${by}${assisted}`, single: `a ${kind}${by}${assisted}`, unit: "", when };
  }
  if ("lineup" in m) return { what: player(m.lineup.player), single: "", unit: "", when: "" };
  if ("stat" in m) return { what: `${team(m.stat.team)}'s ${m.stat.type.toLowerCase()} total`, single: "", unit: m.stat.type === "Ball Possession" ? "%" : "", when: " at full time" };
  if ("player" in m) {
    const field = PLAYER_FIELDS[m.player.field] ?? m.player.field.replace(".", " ");
    return { what: `${player(m.player.player)}'s ${field}`, single: "", unit: "", when: " at full time" };
  }
  const side = m.score.side === "total" ? "total goals" : `${m.score.side} goals`;
  return { what: side, single: "", unit: "", when: m.score.period === "halftime" ? " at half time" : " at full time" };
}

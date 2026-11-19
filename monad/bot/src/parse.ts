/*
 * Reading a take out of a group message: "@TerraceBot Arsenal beat Chelsea Sunday, 10" or
 * "/take Arsenal beat Chelsea Sunday, 10" → the take text, an optional stake, and the match it's about.
 */

export type Fixture = { id: number; kickoff: number; status: string; league: string; home: { name: string }; away: { name: string } };
export type ParsedTake = { text: string; stake: number | null };

export const MIN_STAKE = 1;
export const MAX_STAKE = 500;
const MAX_TEXT = 140;

/** Strip the command or mention and pull a trailing stake ("…, 10", "… £10", "… $10", "… for 10"). */
export function parseTake(raw: string, botUsername: string): ParsedTake | null {
  let s = raw.trim();
  s = s.replace(new RegExp(`^/take(@${escape(botUsername)})?\\b`, "i"), "");
  s = s.replace(new RegExp(`@${escape(botUsername)}\\b`, "ig"), "");
  s = s.replace(/\s+/g, " ").trim();
  let stake: number | null = null;
  const m = s.match(/(?:[,;:\-–]\s*|\s+for\s+|\s+)(?:[$£€]\s?)?(\d{1,4}(?:\.\d{1,2})?)\s*(?:quid|bucks|dollars|usd)?\s*[.!]?$/i);
  // Only treat a trailing number as a stake when it's clearly separated (comma, currency, "for") or there's a
  // currency sign; "Haaland scores 2" must keep its number.
  if (m && (/[,;:\-–$£€]|for\s/i.test(m[0]) || /quid|bucks|dollars|usd/i.test(m[0]))) {
    const n = Number(m[1]);
    if (n >= MIN_STAKE && n <= MAX_STAKE) {
      stake = n;
      s = s.slice(0, m.index).trim();
    }
  }
  s = s.replace(/[,;:\-–\s]+$/, "").trim();
  if (s.length < 6) return null;
  return { text: s.slice(0, MAX_TEXT), stake };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names fans actually type, keyed by a word in API-Football's team name. */
const ALIASES: Record<string, string[]> = {
  "manchester united": ["man utd", "man united", "united", "mufc"],
  "manchester city": ["man city", "city", "mcfc"],
  "tottenham": ["spurs", "tottenham"],
  "wolverhampton": ["wolves"],
  "brighton": ["brighton", "seagulls"],
  "nottingham forest": ["forest", "nffc"],
  "newcastle": ["newcastle", "toon", "magpies"],
  "west ham": ["west ham", "hammers", "irons"],
  "arsenal": ["arsenal", "gunners", "afc"],
  "chelsea": ["chelsea", "blues", "cfc"],
  "liverpool": ["liverpool", "pool", "reds", "lfc"],
  "aston villa": ["villa"],
  "crystal palace": ["palace"],
  "paris saint germain": ["psg"],
  "bayern": ["bayern"],
  "borussia dortmund": ["dortmund", "bvb"],
  "inter": ["inter"],
  "ac milan": ["milan"],
  "real madrid": ["real", "madrid"],
  "barcelona": ["barca", "barça", "barcelona"],
  "atletico madrid": ["atleti", "atletico"],
  "juventus": ["juve", "juventus"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "the", "de", "club", "city", "united", "real", "athletic", "sporting"]);

/** Ways a fan might name this team: the full name, its distinctive words, and known nicknames. */
export function teamKeys(name: string): string[] {
  const n = norm(name);
  const keys = new Set<string>([n]);
  for (const w of n.split(" ")) if (w.length >= 4 && !STOP.has(w)) keys.add(w);
  for (const [k, v] of Object.entries(ALIASES)) if (n.includes(k)) v.forEach((a) => keys.add(norm(a)));
  return [...keys];
}

function mentions(text: string, team: string): number {
  const t = ` ${norm(text)} `;
  let best = 0;
  for (const k of teamKeys(team)) if (t.includes(` ${k} `)) best = Math.max(best, k.length);
  return best;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DONE = new Set(["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"]);

/** Day of week a kickoff falls on, in the group's time zone. */
export function weekday(unix: number, tz: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: tz }).format(new Date(unix * 1000)).toLowerCase();
  return DAYS.indexOf(name);
}

/**
 * The match a take is about. Both teams named wins outright; one team named narrows to its next match.
 * "Sunday", "today", "tonight" and "tomorrow" narrow by day. Returns every candidate when it's still
 * ambiguous, so the bot can ask which one.
 */
export function resolveFixture(text: string, fixtures: Fixture[], nowUnix: number, tz: string): Fixture[] {
  const open = fixtures.filter((f) => !DONE.has(f.status) && f.kickoff > nowUnix - 3 * 3600);
  const scored = open
    .map((f) => {
      const h = mentions(text, f.home.name), a = mentions(text, f.away.name);
      return { f, both: h > 0 && a > 0, score: h + a };
    })
    .filter((x) => x.score > 0);
  if (!scored.length) return [];
  let pool = scored.some((x) => x.both) ? scored.filter((x) => x.both) : scored;

  const t = norm(text);
  const today = weekday(nowUnix, tz);
  let day = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (/\b(today|tonight)\b/.test(t)) day = today;
  if (/\btomorrow\b/.test(t)) day = (today + 1) % 7;
  if (day >= 0) {
    const onDay = pool.filter((x) => weekday(x.f.kickoff, tz) === day);
    if (onDay.length) pool = onDay;
  }
  if (pool[0].both) {
    const top = Math.max(...pool.map((x) => x.score));
    pool = pool.filter((x) => x.score === top);
  }
  pool.sort((a, b) => a.f.kickoff - b.f.kickoff);
  // One team named and no day: their next match is what fans mean.
  if (!pool[0].both && day < 0) {
    const teams = new Set(pool.map((x) => (mentions(text, x.f.home.name) >= mentions(text, x.f.away.name) ? x.f.home.name : x.f.away.name)));
    if (teams.size === 1) return [pool[0].f];
  }
  return pool.slice(0, 5).map((x) => x.f);
}

/** Things fans say when they think the ref (or the bot) got it wrong. */
export const isDispute = (text: string) =>
  /\b(robbed|rigged|fix(ed)?|bent|corrupt|var|referee|ref|wrong result|disput\w*|appeal|overturn|cheat\w*|scandal)\b/i.test(text);

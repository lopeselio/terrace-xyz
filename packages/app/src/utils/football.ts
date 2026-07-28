// ---------------------------------------------------------------------------
// Football classification — the single place the app decides "is this football,
// and which competition?".
//
// Before this file the logic lived in three places that had already drifted:
//   - useMarkets.ts `NON_FOOTBALL_BLOCK` (applied to Jupiter search results)
//   - useMarkets.ts inline `FOOTBALL_BLOCK` (applied again after the merge)
//   - HomeScreen.tsx `matchesLeague` (applied to the league chips)
// A market could pass one and fail another, so counts and empty states lied.
// Everything now funnels through `isFootballMarket` / `matchesCompetition`.
//
// Policy: classify on the provider's own metadata, not on the title.
//
// An earlier version of this file used a keyword blocklist, on the reasoning
// that football titles are often bare club names with nothing to allowlist. On
// device that turned out to be badly wrong: "Netanyahu out by July 31?" and
// "Will China invade Taiwan by end of 2026?" both sailed onto Home, because
// neither contains a blocked word. A blocklist can only exclude what you
// thought of in advance, and the catalog is adversarial to that.
//
// The live API settles it. Every event carries `category` ("sports",
// "politics", "esports", "crypto") and `tags` — and every football event is
// tagged `soccer`:
//
//   sports    | ucl  | ['sports','games','soccer','ucl']  | Górnik Zabrze vs. Fenerbahçe SK
//   politics  |      | ['geopolitics','politics',...]     | Will the US capture another world leader in 2026?
//   esports   | cs2  | ['esports','counter-strike-2',...] | Counter-Strike: Fortress vs STATE
//
// (Note the `&category=sports` query param is NOT respected by the search
// endpoint — those non-sports rows came back from a "premier league" search.
// Filtering has to happen client-side.)
//
// So: tags are the authority, and the title heuristic below survives only as a
// fallback for events that arrive with no tags at all.
// ---------------------------------------------------------------------------

import type { UnifiedMarket } from "@terrace/sdk";

/** Tags that positively identify football. */
const FOOTBALL_TAGS = new Set(["soccer", "football", "futbol"]);

/** Provider subcategories that are football competitions. */
const FOOTBALL_SUBCATEGORIES = new Set([
  "epl", "ucl", "uel", "uecl", "laliga", "seriea", "bundesliga", "ligue1",
  "wc", "worldcup", "fifa", "mls", "eredivisie", "primeiraliga", "efl",
  "championship", "copa", "euro", "soccer",
]);

/** Categories that are never football, whatever the title says. */
const NON_SPORT_CATEGORIES = new Set([
  "politics", "crypto", "economics", "culture", "science", "tech", "esports",
]);

// Word-boundary regex so "f1" doesn't match "match 1" and "mma" doesn't match
// "comma". Grouped by why each entry is here — keep it commented, this list is
// load-bearing for what users see.
const NON_FOOTBALL = new RegExp(
  [
    // Esports
    "counter-?strike", "cs:go", "csgo", "cs2",
    "dota", "league of legends", "\\blck\\b", "\\blcs\\b", "\\blpl\\b", "\\blec\\b",
    "valorant", "\\bvct\\b",
    "starcraft", "overwatch", "rocket league",
    "rainbow six", "\\br6\\b", "fortnite", "call of duty", "cod mw",
    "esports?",
    // US sports
    "\\bnba\\b", "\\bnfl\\b", "\\bmlb\\b", "\\bnhl\\b", "super bowl",
    // Combat / individual
    "\\bufc\\b", "\\bmma\\b", "\\bwwe\\b", "boxing",
    // Racing
    "formula 1", "\\bf1\\b", "nascar", "indycar", "motogp",
    // Racquet / other field sports
    "tennis", "golf", "\\bpga\\b", "\\batp\\b", "\\bwta\\b", "rugby",
    // Cricket (IPL = Indian Premier League — cricket, not football)
    "cricket", "\\bipl\\b", "\\bbbl\\b", "\\bt20\\b",
    // Non-sport Polymarket categories that reach the sports search
    "eurovision", "election", "politic", "grammy", "oscar", "\\bawards?\\b",
  ].join("|"),
  "i",
);

/** True when a free-text title is *recognisably* not football. Fallback only. */
export function isNonFootballTitle(title: string): boolean {
  return NON_FOOTBALL.test(title);
}

/**
 * Football check for a unified market.
 *
 * Native Terrace markets are always kept: they're permissionless and user
 * authored, so filtering them by keyword would delete a fan's own market from
 * their own feed. Only the syndicated Jupiter/Polymarket catalog is filtered.
 *
 * For syndicated markets the order is: tags → subcategory → category → title.
 * The first three are the provider's own classification and are trusted
 * outright; the title heuristic only runs when an event arrives untagged, and
 * it *excludes* rather than includes — an untagged event with an unrecognised
 * title is dropped, because the failure we actually saw was politics leaking
 * in, not football being too shy to announce itself.
 */
export function isFootballMarket(m: UnifiedMarket): boolean {
  if (m.source === "native") return true;

  const tags = m.jupiterTags?.map((t) => t.toLowerCase()) ?? [];
  if (tags.some((t) => FOOTBALL_TAGS.has(t))) return true;
  if (tags.length > 0) return false; // tagged, and not as football

  const sub = m.jupiterSubcategory?.toLowerCase();
  if (sub && FOOTBALL_SUBCATEGORIES.has(sub)) return true;

  const cat = m.jupiterCategory?.toLowerCase();
  if (cat && NON_SPORT_CATEGORIES.has(cat)) return false;

  // Untagged fallback: require a positive football signal in the title.
  const title = `${m.jupiterEventTitle ?? ""} ${m.question}`;
  if (isNonFootballTitle(title)) return false;
  return competitionOf(title) !== null || FOOTBALL_VOCAB.test(title);
}

// Football-specific language, for the untagged fallback only. Deliberately
// narrow — it decides what gets shown when the provider told us nothing.
const FOOTBALL_VOCAB =
  /\b(goal|goals|goalscorer|top scorer|golden boot|clean sheet|hat-?trick|penalt(y|ies)|offside|relegat|promot|matchday|kick-?off|first half|second half|full time|manager|transfer|assists?|nil|draw|equali[sz]er|own goal|red card|yellow card|var)\b/i;

// --- Event titles ----------------------------------------------------------

/**
 * "Arsenal vs Tottenham" → ["Arsenal", "Tottenham"]. Away is "" when the title
 * isn't a head-to-head (e.g. "CL Top Scorer").
 */
export function splitEventTitle(title: string): [string, string] {
  const parts = title.split(/\s+(?:vs\.?|v\.?)\s+/i);
  return parts.length >= 2 ? [parts[0].trim(), parts[1].trim()] : [title.trim(), ""];
}

/** The title we classify/display a market by — event title if we have one. */
export function marketTitle(m: UnifiedMarket): string {
  return m.jupiterEventTitle ?? m.question;
}

// --- Competitions ----------------------------------------------------------

export const HOT_COMPETITION = "World Cup";

export const COMPETITIONS = [
  "All",
  HOT_COMPETITION,
  "Premier League",
  "Champions League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "Europa League",
] as const;

export type Competition = (typeof COMPETITIONS)[number];

// Club-name fallbacks: Polymarket titles are often bare club names with no
// competition word, so each domestic league carries its own club roster.
const COMPETITION_PATTERNS: Record<Exclude<Competition, "All">, RegExp> = {
  "Premier League": /premier league|\bepl\b|man (?:utd|united|city)|arsenal|chelsea|liverpool|tottenham|spurs|newcastle|west ham|everton|crystal palace|wolves|fulham|brentford|brighton|nottingham|bournemouth|aston villa|ipswich|leicester|southampton/i,
  "Champions League": /champions league|\bucl\b/i,
  "La Liga": /la liga|real madrid|barcelona|atl[eé]tico|sevilla|villarreal|real sociedad|athletic bilbao|valencia|betis/i,
  Bundesliga: /bundesliga|bayern|dortmund|leverkusen|leipzig|frankfurt|stuttgart|wolfsburg/i,
  "Serie A": /serie a|juventus|inter\b|ac milan|\bmilan\b|napoli|roma|lazio|atalanta|fiorentina/i,
  "Ligue 1": /ligue 1|\bpsg\b|paris saint|lyon|marseille|monaco|lille|nice\b/i,
  "Europa League": /europa league|\buel\b/i,
  // World Cup titles frequently omit the tournament name entirely, so the
  // country-vs-country pattern is the safety net.
  [HOT_COMPETITION]:
    /world cup|fifa|\bwcup\b|wc 20\d\d|qualifier|\b(fra|esp|ger|eng|bra|arg|por|ned|ita|usa|mex|mar|cro|bel|uru|jpn|kor|can|sui|den|pol|sen|gha|cmr|nga|wal|sco|aus|qat|ksa|irn|tun|crc)\s+(?:vs\.?|v\.?)\s+(fra|esp|ger|eng|bra|arg|por|ned|ita|usa|mex|mar|cro|bel|uru|jpn|kor|can|sui|den|pol|sen|gha|cmr|nga|wal|sco|aus|qat|ksa|irn|tun|crc)\b/i,
};

/** Does this event title belong to the given competition? "All" always matches. */
export function matchesCompetition(title: string, competition: string): boolean {
  if (competition === "All") return true;
  const pattern = COMPETITION_PATTERNS[competition as Exclude<Competition, "All">];
  return pattern ? pattern.test(title) : true;
}

/**
 * Best-guess competition for a title, or null when nothing matches. Used for
 * the small grey competition line above a market's call.
 */
export function competitionOf(title: string): Competition | null {
  for (const key of Object.keys(COMPETITION_PATTERNS) as Exclude<Competition, "All">[]) {
    if (COMPETITION_PATTERNS[key].test(title)) return key;
  }
  return null;
}

/** Competition label for a market — falls back to source provenance. */
export function competitionLabel(m: UnifiedMarket): string {
  const comp = competitionOf(marketTitle(m));
  if (comp) return comp;
  if (m.source === "native") return "Fan created";
  return "Football";
}

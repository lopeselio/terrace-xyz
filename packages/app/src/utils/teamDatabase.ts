// Club data seeded from football-data.org crests endpoint.
// Crest SVGs: https://crests.football-data.org/{id}.svg
// Colors: primary kit color for badge backgrounds.

export interface TeamEntry {
  tla: string;          // 3-letter abbreviation
  color: string;        // primary kit hex
  crest: string;        // SVG URL
}

// Key: lowercase normalised name (strip punctuation, "fc", "afc", "city"→ keep)
const RAW: Array<[string[], TeamEntry]> = [
  // ── Premier League ─────────────────────────────────────────────────
  [["arsenal"],              { tla: "ARS", color: "#ef0107", crest: "https://crests.football-data.org/57.svg" }],
  [["aston villa", "villa"], { tla: "AVL", color: "#670e36", crest: "https://crests.football-data.org/58.svg" }],
  [["bournemouth"],          { tla: "BOU", color: "#da291c", crest: "https://crests.football-data.org/1044.svg" }],
  [["brentford"],            { tla: "BRE", color: "#e30613", crest: "https://crests.football-data.org/402.svg" }],
  [["brighton", "brighton & hove", "bha"], { tla: "BHA", color: "#0057b8", crest: "https://crests.football-data.org/397.svg" }],
  [["chelsea"],              { tla: "CHE", color: "#034694", crest: "https://crests.football-data.org/61.svg" }],
  [["crystal palace", "palace"], { tla: "CRY", color: "#1b458f", crest: "https://crests.football-data.org/354.svg" }],
  [["everton"],              { tla: "EVE", color: "#003399", crest: "https://crests.football-data.org/62.svg" }],
  [["fulham"],               { tla: "FUL", color: "#cc0000", crest: "https://crests.football-data.org/63.svg" }],
  [["ipswich", "ipswich town"], { tla: "IPS", color: "#3a64a3", crest: "https://crests.football-data.org/349.svg" }],
  [["leicester", "leicester city"], { tla: "LEI", color: "#003090", crest: "https://crests.football-data.org/338.svg" }],
  [["liverpool"],            { tla: "LIV", color: "#c8102e", crest: "https://crests.football-data.org/64.svg" }],
  [["manchester city", "man city"], { tla: "MCI", color: "#6cabdd", crest: "https://crests.football-data.org/65.svg" }],
  [["manchester united", "man united", "man utd"], { tla: "MUN", color: "#da291c", crest: "https://crests.football-data.org/66.svg" }],
  [["newcastle", "newcastle united"], { tla: "NEW", color: "#241f20", crest: "https://crests.football-data.org/67.svg" }],
  [["nottingham forest", "nottm forest", "forest"], { tla: "NFO", color: "#e53233", crest: "https://crests.football-data.org/351.svg" }],
  [["southampton"],          { tla: "SOU", color: "#d71920", crest: "https://crests.football-data.org/340.svg" }],
  [["sunderland"],           { tla: "SUN", color: "#eb0000", crest: "https://crests.football-data.org/394.svg" }],
  [["tottenham", "spurs", "tottenham hotspur"], { tla: "TOT", color: "#132257", crest: "https://crests.football-data.org/73.svg" }],
  [["west ham", "west ham united"], { tla: "WHU", color: "#7a263a", crest: "https://crests.football-data.org/563.svg" }],
  [["wolves", "wolverhampton", "wolverhampton wanderers"], { tla: "WOL", color: "#fdb913", crest: "https://crests.football-data.org/76.svg" }],

  // ── Champions League regulars (non-PL) ─────────────────────────────
  [["real madrid", "madrid"],       { tla: "RMA", color: "#febe10", crest: "https://crests.football-data.org/86.svg" }],
  [["barcelona", "barca"],          { tla: "BAR", color: "#a50044", crest: "https://crests.football-data.org/81.svg" }],
  [["atletico madrid", "atletico"], { tla: "ATM", color: "#cc0000", crest: "https://crests.football-data.org/78.svg" }],
  [["bayern munich", "bayern"],     { tla: "BAY", color: "#dc052d", crest: "https://crests.football-data.org/5.svg" }],
  [["borussia dortmund", "dortmund", "bvb"], { tla: "BVB", color: "#fde100", crest: "https://crests.football-data.org/4.svg" }],
  [["psg", "paris saint-germain", "paris"],  { tla: "PSG", color: "#004170", crest: "https://crests.football-data.org/524.svg" }],
  [["inter milan", "inter"],        { tla: "INT", color: "#010e80", crest: "https://crests.football-data.org/108.svg" }],
  [["ac milan", "milan"],           { tla: "ACM", color: "#fb090b", crest: "https://crests.football-data.org/98.svg" }],
  [["juventus", "juve"],            { tla: "JUV", color: "#000000", crest: "https://crests.football-data.org/109.svg" }],
  [["benfica"],                     { tla: "BEN", color: "#cc0000", crest: "https://crests.football-data.org/294.svg" }],
  [["porto"],                       { tla: "POR", color: "#003087", crest: "https://crests.football-data.org/297.svg" }],
  [["ajax"],                        { tla: "AJX", color: "#cc0000", crest: "https://crests.football-data.org/674.svg" }],
  [["celtic"],                      { tla: "CEL", color: "#16a34a", crest: "https://crests.football-data.org/264.svg" }],
  [["rangers"],                     { tla: "RAN", color: "#003087", crest: "https://crests.football-data.org/265.svg" }],
  [["feyenoord"],                   { tla: "FEY", color: "#cc0000", crest: "https://crests.football-data.org/675.svg" }],
  [["sporting cp", "sporting"],     { tla: "SCP", color: "#008000", crest: "https://crests.football-data.org/498.svg" }],

  // ── National teams ─────────────────────────────────────────────────
  [["england"],   { tla: "ENG", color: "#003090", crest: "https://crests.football-data.org/770.svg" }],
  [["france"],    { tla: "FRA", color: "#003189", crest: "https://crests.football-data.org/773.svg" }],
  [["germany"],   { tla: "GER", color: "#000000", crest: "https://crests.football-data.org/759.svg" }],
  [["spain"],     { tla: "ESP", color: "#c60b1e", crest: "https://crests.football-data.org/760.svg" }],
  [["brazil"],    { tla: "BRA", color: "#009c3b", crest: "https://crests.football-data.org/764.svg" }],
  [["argentina"], { tla: "ARG", color: "#74acdf", crest: "https://crests.football-data.org/762.svg" }],
  [["portugal"],  { tla: "POR", color: "#cc0000", crest: "https://crests.football-data.org/765.svg" }],
  [["netherlands", "holland"], { tla: "NED", color: "#ff6600", crest: "https://crests.football-data.org/774.svg" }],
  [["italy"],     { tla: "ITA", color: "#003189", crest: "https://crests.football-data.org/784.svg" }],
];

// Build flat lookup map: normalized alias → TeamEntry
const DB = new Map<string, TeamEntry>();
for (const [aliases, entry] of RAW) {
  for (const alias of aliases) {
    DB.set(alias.toLowerCase().trim(), entry);
  }
}

/** Normalize a team name string for lookup */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|afc|sc|cf|united|city|town|rovers|wanderers|athletic|albion|hotspur)\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look up a team by name. Tries:
 * 1. Direct match on normalised name
 * 2. Starts-with on normalised name
 * 3. Any alias that the input contains or that contains the input
 *
 * Returns undefined if no match.
 */
export function lookupTeam(name: string): TeamEntry | undefined {
  const norm = normalise(name);
  if (!norm) return undefined;

  // Direct hit
  if (DB.has(norm)) return DB.get(norm);

  // Starts-with
  for (const [key, entry] of DB) {
    if (norm.startsWith(key) || key.startsWith(norm)) return entry;
  }

  // Substring match (handles "Man City" matching "manchester city" after strip)
  for (const [key, entry] of DB) {
    if (norm.includes(key) || key.includes(norm)) return entry;
  }

  return undefined;
}

/** Fallback palette when team not in DB — cycles by first char code */
const FALLBACK_PALETTE = ["#1e3a5f", "#7f1d1d", "#064e3b", "#2d1b69", "#713f12", "#1c1917"];
export function fallbackColor(name: string): string {
  return FALLBACK_PALETTE[(name.charCodeAt(0) ?? 0) % FALLBACK_PALETTE.length];
}

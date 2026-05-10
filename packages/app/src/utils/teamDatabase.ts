// Crest PNGs: ESPN CDN — stable, no auth, works in React Native Image.
// Format: https://a.espncdn.com/i/teamlogos/soccer/500/{id}.png
// TheSportsDB is used as dynamic fallback via useTeamCrest for unlisted teams.

const ESPN = (id: number) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;

export interface TeamEntry {
  tla: string;          // 3-letter abbreviation
  color: string;        // primary kit hex
  crest?: string;       // optional static PNG — TheSportsDB fills gaps dynamically
}

// Key: lowercase normalised name (strip punctuation, "fc", "afc", "city"→ keep)
const RAW: Array<[string[], TeamEntry]> = [
  // ── Premier League ─────────────────────────────────────────────────
  [["arsenal"],              { tla: "ARS", color: "#ef0107", crest: ESPN(359)  }],
  [["aston villa", "villa"], { tla: "AVL", color: "#670e36", crest: ESPN(1281) }],
  [["bournemouth"],          { tla: "BOU", color: "#da291c", crest: ESPN(349)  }],
  [["brentford"],            { tla: "BRE", color: "#e30613", crest: ESPN(337)  }],
  [["brighton", "brighton & hove", "bha"], { tla: "BHA", color: "#0057b8", crest: ESPN(331) }],
  [["chelsea"],              { tla: "CHE", color: "#034694", crest: ESPN(363)  }],
  [["crystal palace", "palace"], { tla: "CRY", color: "#1b458f", crest: ESPN(384) }],
  [["everton"],              { tla: "EVE", color: "#003399", crest: ESPN(368)  }],
  [["fulham"],               { tla: "FUL", color: "#cc0000", crest: ESPN(387)  }],
  [["ipswich", "ipswich town"], { tla: "IPS", color: "#3a64a3", crest: ESPN(414) }],
  [["leicester", "leicester city"], { tla: "LEI", color: "#003090", crest: ESPN(375) }],
  [["liverpool"],            { tla: "LIV", color: "#c8102e", crest: ESPN(364)  }],
  [["manchester city", "man city"], { tla: "MCI", color: "#6cabdd", crest: ESPN(382) }],
  [["manchester united", "man united", "man utd"], { tla: "MUN", color: "#da291c", crest: ESPN(360) }],
  [["newcastle", "newcastle united"], { tla: "NEW", color: "#241f20", crest: ESPN(361) }],
  [["nottingham forest", "nottm forest", "forest"], { tla: "NFO", color: "#e53233", crest: ESPN(393) }],
  [["southampton"],          { tla: "SOU", color: "#d71920", crest: ESPN(376)  }],
  [["sunderland"],           { tla: "SUN", color: "#eb0000", crest: ESPN(388)  }],
  [["tottenham", "spurs", "tottenham hotspur"], { tla: "TOT", color: "#132257", crest: ESPN(367) }],
  [["west ham", "west ham united"], { tla: "WHU", color: "#7a263a", crest: ESPN(371) }],
  [["wolves", "wolverhampton", "wolverhampton wanderers"], { tla: "WOL", color: "#fdb913", crest: ESPN(380) }],

  // ── Champions League regulars (non-PL) ─────────────────────────────
  [["real madrid", "madrid"],       { tla: "RMA", color: "#febe10", crest: ESPN(86)   }],
  [["barcelona", "barca"],          { tla: "BAR", color: "#a50044", crest: ESPN(83)   }],
  [["atletico madrid", "atletico"], { tla: "ATM", color: "#cc0000", crest: ESPN(1068) }],
  [["bayern munich", "bayern"],     { tla: "BAY", color: "#dc052d", crest: ESPN(132)  }],
  [["borussia dortmund", "dortmund", "bvb"], { tla: "BVB", color: "#fde100", crest: ESPN(124) }],
  [["psg", "paris saint-germain", "paris"],  { tla: "PSG", color: "#004170", crest: ESPN(160) }],
  [["inter milan", "inter"],        { tla: "INT", color: "#010e80", crest: ESPN(110)  }],
  [["ac milan", "milan"],           { tla: "ACM", color: "#fb090b", crest: ESPN(103)  }],
  [["juventus", "juve"],            { tla: "JUV", color: "#000000", crest: ESPN(111)  }],
  [["benfica"],                     { tla: "BEN", color: "#cc0000", crest: ESPN(568)  }],
  [["porto"],                       { tla: "POR", color: "#003087", crest: ESPN(152)  }],
  [["ajax"],                        { tla: "AJX", color: "#cc0000", crest: ESPN(161)  }],
  [["celtic"],                      { tla: "CEL", color: "#16a34a", crest: ESPN(267)  }],
  [["rangers"],                     { tla: "RAN", color: "#003087", crest: ESPN(266)  }],
  [["feyenoord"],                   { tla: "FEY", color: "#cc0000", crest: ESPN(674)  }],
  [["sporting cp", "sporting"],     { tla: "SCP", color: "#008000", crest: ESPN(570)  }],

  // ── Championship (EFL) ─────────────────────────────────────────────
  [["leeds", "leeds united"],          { tla: "LEE", color: "#ffcd00", crest: ESPN(357)  }],
  [["sheffield united", "sheff utd"],  { tla: "SHU", color: "#ee2737", crest: ESPN(397)  }],
  [["burnley"],                        { tla: "BUR", color: "#6c1d45", crest: ESPN(379)  }],
  [["middlesbrough", "boro"],          { tla: "MID", color: "#e41b17", crest: ESPN(369)  }],
  [["coventry"],                       { tla: "COV", color: "#44b4e4", crest: ESPN(405)  }],
  [["norwich", "norwich city"],        { tla: "NOR", color: "#00a650", crest: ESPN(341)  }],
  [["west brom", "west bromwich"],     { tla: "WBA", color: "#122f67", crest: ESPN(383)  }],
  [["millwall"],                       { tla: "MIL", color: "#001d5e", crest: ESPN(370)  }],
  [["swansea"],                        { tla: "SWA", color: "#000000", crest: ESPN(395)  }],
  [["preston", "preston north end"],   { tla: "PNE", color: "#002f6c", crest: ESPN(385)  }],
  [["cardiff"],                        { tla: "CAR", color: "#0070b5", crest: ESPN(343)  }],
  [["derby", "derby county"],          { tla: "DER", color: "#000000", crest: ESPN(390)  }],
  [["blackburn", "blackburn rovers"],  { tla: "BBR", color: "#009ee0", crest: ESPN(309)  }],
  [["hull", "hull city"],              { tla: "HUL", color: "#f5a12d", crest: ESPN(1267) }],
  [["stoke", "stoke city"],            { tla: "STK", color: "#e03a3e", crest: ESPN(319)  }],
  [["sheffield wednesday", "sheff wed"], { tla: "SWE", color: "#003087", crest: ESPN(347) }],
  [["watford"],                        { tla: "WAT", color: "#fbee23", crest: ESPN(392)  }],
  [["luton", "luton town"],            { tla: "LUT", color: "#f78f1e", crest: ESPN(2018) }],
  [["oxford", "oxford united"],        { tla: "OXF", color: "#ffd100" }],
  [["qpr", "queens park rangers"],     { tla: "QPR", color: "#1d5ba4", crest: ESPN(340)  }],

  // ── More European clubs ─────────────────────────────────────────────
  [["sevilla"],                         { tla: "SEV", color: "#d91a21", crest: ESPN(243)  }],
  [["villarreal"],                      { tla: "VIL", color: "#ffdb00", crest: ESPN(245)  }],
  [["real sociedad", "sociedad"],       { tla: "RSO", color: "#0067b1", crest: ESPN(89)   }],
  [["athletic bilbao", "bilbao"],       { tla: "ATH", color: "#cc0000", crest: ESPN(77)   }],
  [["napoli"],                          { tla: "NAP", color: "#09afe0", crest: ESPN(120)  }],
  [["roma", "as roma"],                 { tla: "ROM", color: "#8b0000", crest: ESPN(100)  }],
  [["lazio"],                           { tla: "LAZ", color: "#87ceeb", crest: ESPN(116)  }],
  [["atalanta"],                        { tla: "ATA", color: "#1e3a8a", crest: ESPN(99)   }],
  [["fiorentina"],                      { tla: "FIO", color: "#6a0dad", crest: ESPN(104)  }],
  [["bayer leverkusen", "leverkusen"],  { tla: "B04", color: "#e32221", crest: ESPN(135)  }],
  [["rb leipzig", "leipzig"],           { tla: "RBL", color: "#cc0000", crest: ESPN(11420)}],
  [["eintracht frankfurt", "frankfurt"], { tla: "SGE", color: "#e1000f", crest: ESPN(119) }],
  [["monaco"],                          { tla: "MON", color: "#cc0000", crest: ESPN(162)  }],
  [["lyon", "olympique lyonnais"],      { tla: "OLY", color: "#0033a0", crest: ESPN(163)  }],
  [["marseille", "olympique marseille"], { tla: "OM",  color: "#009ac7", crest: ESPN(164) }],
  [["lille"],                           { tla: "LIL", color: "#c8102e", crest: ESPN(165)  }],
  [["galatasaray"],                     { tla: "GAL", color: "#f9a01b", crest: ESPN(427)  }],
  [["fenerbahce"],                      { tla: "FEN", color: "#004d98", crest: ESPN(428)  }],
  [["psv", "psv eindhoven"],            { tla: "PSV", color: "#cc0000", crest: ESPN(683)  }],
  [["shakhtar", "shakhtar donetsk"],    { tla: "SHA", color: "#f7a21b", crest: ESPN(430)  }],

  // ── National teams ─────────────────────────────────────────────────
  [["england"],   { tla: "ENG", color: "#003090" }],
  [["france"],    { tla: "FRA", color: "#003189" }],
  [["germany"],   { tla: "GER", color: "#000000" }],
  [["spain"],     { tla: "ESP", color: "#c60b1e" }],
  [["brazil"],    { tla: "BRA", color: "#009c3b" }],
  [["argentina"], { tla: "ARG", color: "#74acdf" }],
  [["portugal"],  { tla: "POR", color: "#cc0000" }],
  [["netherlands", "holland"], { tla: "NED", color: "#ff6600" }],
  [["italy"],     { tla: "ITA", color: "#003189" }],
  [["usa", "united states"],  { tla: "USA", color: "#002868" }],
  [["mexico"],    { tla: "MEX", color: "#006847" }],
  [["morocco"],   { tla: "MAR", color: "#c1272d" }],
];

// Build flat lookup map: normalized alias → TeamEntry
const DB = new Map<string, TeamEntry>();
// Build preferred search name map: raw alias (lowercase) → longest alias (for TheSportsDB)
const SEARCH_NAME_MAP = new Map<string, string>();
for (const [aliases, entry] of RAW) {
  const best = aliases.reduce((a, b) => (a.length >= b.length ? a : b));
  for (const alias of aliases) {
    DB.set(alias.toLowerCase().trim(), entry);
    SEARCH_NAME_MAP.set(alias.toLowerCase().trim(), best);
  }
}

/**
 * Return the best TheSportsDB search term for a team name.
 * Expands abbreviations: "PSG" → "paris saint-germain", "BVB" → "borussia dortmund".
 */
export function getSearchName(name: string): string {
  const lower = name.toLowerCase().trim().replace(/\s+(fc|afc)$/i, "");
  return SEARCH_NAME_MAP.get(lower) ?? name.replace(/\s+(FC|AFC)$/i, "").trim();
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

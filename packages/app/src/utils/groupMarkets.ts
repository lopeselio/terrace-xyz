import type { UnifiedMarket } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchOutcomes {
  home: UnifiedMarket | null;
  draw: UnifiedMarket | null;
  away: UnifiedMarket | null;
  /** Any markets within the event that aren't home/draw/away */
  other: UnifiedMarket[];
}

export interface GroupedMatch {
  type: "grouped";
  eventId: string;
  /** Parent event title, e.g. "Sunderland vs Brighton" */
  eventTitle: string;
  outcomes: MatchOutcomes;
  totalVolumeUsdc: number;
  expiry: Date | null;
  status: UnifiedMarket["status"];
}

export interface StandaloneMarket {
  type: "standalone";
  market: UnifiedMarket;
}

export type MarketListItem = GroupedMatch | StandaloneMarket;

// ---------------------------------------------------------------------------
// Outcome detection
// ---------------------------------------------------------------------------

const DRAW_KEYWORDS = ["draw", "tie", "drawn", "nivel", "empate"];

/**
 * Given an individual market's question (e.g. "Sunderland", "Draw", "Brighton")
 * and the parent event title (e.g. "Sunderland vs Brighton"), classify the
 * market as home win / draw / away win / other.
 *
 * Logic:
 * 1. Draw keywords → "draw"
 * 2. Extract team names from event title split on "vs" — fuzzy match the question
 * 3. Fallback to position-based ordering (first non-draw = home, second = away)
 */
export function detectOutcome(
  question: string,
  eventTitle: string,
  positionInEvent: number
): "home" | "draw" | "away" | "other" {
  const q = question.toLowerCase().trim();

  if (DRAW_KEYWORDS.some((k) => q === k || q.includes(k))) return "draw";

  // Try to match against team names from "TeamA vs TeamB"
  const vsParts = eventTitle.toLowerCase().split(/\s+vs\.?\s+/);
  if (vsParts.length === 2) {
    const home = vsParts[0].trim();
    const away = vsParts[1].trim();
    // Check if question contains or is contained by team name (handles short names)
    const matchesHome = q.includes(home) || home.includes(q) || home.startsWith(q);
    const matchesAway = q.includes(away) || away.includes(q) || away.startsWith(q);
    if (matchesHome && !matchesAway) return "home";
    if (matchesAway && !matchesHome) return "away";
  }

  // Positional fallback: first = home, second = away (skip draw which was caught above)
  if (positionInEvent === 0) return "home";
  if (positionInEvent === 1) return "away";
  return "other";
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups UnifiedMarket[] into match cards (for Jupiter events that have 3
 * outcome markets) and standalone rows (for native Terrace markets and
 * single-market Jupiter events).
 *
 * Result is sorted by total USDC volume descending.
 */
export function groupMarkets(markets: UnifiedMarket[]): MarketListItem[] {
  // Bucket Jupiter markets by eventId
  const eventBuckets = new Map<string, UnifiedMarket[]>();
  const standalones: UnifiedMarket[] = [];

  for (const m of markets) {
    if (m.source === "jupiter" && m.jupiterEventId) {
      const bucket = eventBuckets.get(m.jupiterEventId) ?? [];
      bucket.push(m);
      eventBuckets.set(m.jupiterEventId, bucket);
    } else {
      standalones.push(m);
    }
  }

  const result: MarketListItem[] = [];

  // Build GroupedMatch entries — only group events that have ≥ 2 markets
  for (const [eventId, bucket] of eventBuckets) {
    const eventTitle = bucket[0]?.jupiterEventTitle ?? bucket[0]?.question ?? "Match";

    if (bucket.length < 2) {
      // Single-market event → treat as standalone
      standalones.push(...bucket);
      continue;
    }

    let home: UnifiedMarket | null = null;
    let draw: UnifiedMarket | null = null;
    let away: UnifiedMarket | null = null;
    const other: UnifiedMarket[] = [];

    // Track positions for non-draw markets
    let nonDrawPos = 0;
    for (const m of bucket) {
      const outcome = detectOutcome(m.question, eventTitle, nonDrawPos);
      if (outcome !== "draw") nonDrawPos++;

      if (outcome === "draw" && !draw)  { draw = m; }
      else if (outcome === "home" && !home) { home = m; }
      else if (outcome === "away" && !away) { away = m; }
      else { other.push(m); }
    }

    const totalVolumeUsdc = bucket.reduce((s, m) => s + m.totalVolumeUsdc, 0);
    const expiry  = bucket.find((m) => m.expiry)?.expiry ?? null;
    const status  = bucket[0]?.status ?? "Open";

    result.push({
      type: "grouped",
      eventId,
      eventTitle,
      outcomes: { home, draw, away, other },
      totalVolumeUsdc,
      expiry,
      status,
    });
  }

  // Add standalone markets (native Terrace + ungrouped Jupiter)
  for (const m of standalones) {
    result.push({ type: "standalone", market: m });
  }

  // Sort by volume descending; native markets float up on equal volume
  return result.sort((a, b) => {
    const aVol = a.type === "grouped" ? a.totalVolumeUsdc : a.market.totalVolumeUsdc;
    const bVol = b.type === "grouped" ? b.totalVolumeUsdc : b.market.totalVolumeUsdc;
    return bVol - aVol;
  });
}

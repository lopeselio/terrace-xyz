import type { LiveFixture } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// Matching markets to live fixtures. Pure — no React, no react-native — so it
// can be exercised directly against real API payloads.
// ---------------------------------------------------------------------------

// Providers name the same club differently. On the live board we saw:
//
//   market  : "Kuopion PS" vs "Sabah FK"
//   fixture : "KuPS"       vs "Sabah FA"
//
// "Sabah" matches; "KuPS" is a contraction of Kuopion Palloseura, not a
// substring of "Kuopion PS". Requiring both sides therefore dropped a market we
// actually held, and the card showed a live score with no odds beside it —
// exactly what the carousel exists to prevent.
//
// Simply accepting a one-sided match is not safe: attaching a market to the
// wrong fixture would price real odds against the wrong scoreline, which is
// worse than showing nothing. So a single-sided match is accepted only when it
// is *unambiguous* — no other live fixture matches that same side. Within one
// moment's board a single club name is effectively unique, and where it isn't,
// we decline rather than guess.

/** How many sides of a fixture this pair matches: 0, 1, or 2. */
function sideScore(f: LiveFixture, h: string, a: string): 0 | 1 | 2 {
  const fh = norm(f.home.name);
  const fa = norm(f.away.name);
  // Providers sometimes list the pair the other way round, so score both
  // orientations and keep the better one.
  const straight = (contains(fh, h) ? 1 : 0) + (contains(fa, a) ? 1 : 0);
  const reversed = (contains(fh, a) ? 1 : 0) + (contains(fa, h) ? 1 : 0);
  return Math.max(straight, reversed) as 0 | 1 | 2;
}

/**
 * Map live fixtures to the market covering them, keyed by fixtureId.
 *
 * Built in one pass over the whole board rather than per-card, because the
 * ambiguity guard needs to see every fixture at once. Where several markets
 * describe the same tie the most liquid one wins — it's the one worth showing.
 */
export function matchMarketsToFixtures(
  fixtures: LiveFixture[],
  markets: Array<{ status: string; totalVolumeUsdc: number; sides: [string, string] }>,
): Map<number, number> {
  const byFixture = new Map<number, number>(); // fixtureId -> market index
  const claimedMarkets = new Set<number>();
  const partials: Array<{ marketIdx: number; fixtureId: number }> = [];

  // Most liquid first, so it gets first claim on a contested fixture.
  const order = markets
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status === "Open")
    .sort((x, y) => y.m.totalVolumeUsdc - x.m.totalVolumeUsdc);

  for (const { m, i } of order) {
    const h = norm(m.sides[0]);
    const a = norm(m.sides[1]);
    if (!h || !a) continue;

    const scored = fixtures.map((f) => ({ f, score: sideScore(f, h, a) }));

    const confident = scored.filter((s) => s.score === 2);
    if (confident.length === 1) {
      const id = confident[0].f.fixtureId;
      if (!byFixture.has(id)) {
        byFixture.set(id, i);
        claimedMarkets.add(i);
      }
      continue;
    }
    // Two fixtures both fully matching means the names are too generic to
    // separate them. Decline rather than pick one.
    if (confident.length > 1) continue;

    const single = scored.filter((s) => s.score === 1);
    if (single.length === 1) partials.push({ marketIdx: i, fixtureId: single[0].f.fixtureId });
  }

  // Single-sided matches fill only the gaps a confident match didn't claim.
  for (const p of partials) {
    if (byFixture.has(p.fixtureId)) continue;
    if (claimedMarkets.has(p.marketIdx)) continue;
    byFixture.set(p.fixtureId, p.marketIdx);
    claimedMarkets.add(p.marketIdx);
  }

  return byFixture;
}

function norm(name: string): string {
  return name
    .toLowerCase()
    // Fold accents to ASCII *before* stripping punctuation. Stripping first
    // deleted the letter outright — "Fenerbahçe" became "fenerbahe" and
    // "Omónoia" became "omnoia", so neither could match the unaccented spelling
    // the other provider uses.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|afc|sc|cf|ac|sa|sk)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the two normalised names share a token of 3+ characters. */
function contains(candidate: string, query: string): boolean {
  const tokens = query.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  return tokens.some((t) => candidate.includes(t));
}

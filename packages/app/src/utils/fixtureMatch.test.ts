import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { LiveFixture } from "@terrace/sdk";
import { matchMarketsToFixtures } from "./fixtureMatch.ts";

// ---------------------------------------------------------------------------
// Matching a live fixture to the market covering it is the kind of code where
// being wrong is expensive in both directions: miss a match and a live card
// shows a score with no odds beside it; invent one and we price real odds
// against the wrong scoreline. Both failure modes are covered below.
//
// Runs on Node's built-in test runner with native TypeScript stripping, so it
// needs no test framework and no build step: `pnpm --filter @terrace/app test`.
// ---------------------------------------------------------------------------

function fixture(id: number, home: string, away: string): LiveFixture {
  return {
    fixtureId: id,
    kickoff: "",
    statusShort: "1H",
    statusLong: "First Half",
    elapsed: 5,
    homeScore: 0,
    awayScore: 0,
    league: { id: 2, name: "UEFA Champions League", country: "World", logo: "" },
    home: { id: id * 10, name: home, logo: "" },
    away: { id: id * 10 + 1, name: away, logo: "" },
  };
}

function market(home: string, away: string, volume = 0, status = "Open") {
  return { status, totalVolumeUsdc: volume, sides: [home, away] as [string, string] };
}

/** Which market index each fixture resolved to, in fixture order. */
function resolve(
  fixtures: LiveFixture[],
  markets: ReturnType<typeof market>[],
): (number | null)[] {
  const index = matchMarketsToFixtures(fixtures, markets);
  return fixtures.map((f) => index.get(f.fixtureId) ?? null);
}

describe("matchMarketsToFixtures", () => {
  test("attaches when only one side matches, if that match is unambiguous", () => {
    // The regression this was written for. "Sabah" matches, but "KuPS" is a
    // contraction of Kuopion Palloseura — not a substring of "Kuopion PS" — so
    // requiring both sides dropped a market we actually held.
    const fixtures = [fixture(1, "KuPS", "Sabah FA")];
    const markets = [market("Kuopion PS", "Sabah FK")];
    assert.deepEqual(resolve(fixtures, markets), [0]);
  });

  test("declines when two fixtures match the same single side", () => {
    // Guessing here would price real odds against the wrong scoreline.
    const fixtures = [fixture(1, "KuPS", "Sabah FA"), fixture(2, "Sabah SC", "Neftchi")];
    const markets = [market("Kuopion PS", "Sabah FK")];
    assert.deepEqual(resolve(fixtures, markets), [null, null]);
  });

  test("declines when neither side matches", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea")];
    const markets = [market("Bayern", "Dortmund")];
    assert.deepEqual(resolve(fixtures, markets), [null]);
  });

  test("does not reuse a market already claimed by a confident match", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea"), fixture(2, "Arsenal U21", "Spurs U21")];
    const markets = [market("Arsenal", "Chelsea")];
    assert.deepEqual(resolve(fixtures, markets), [0, null]);
  });

  test("matches both sides exactly", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea")];
    const markets = [market("Arsenal", "Chelsea")];
    assert.deepEqual(resolve(fixtures, markets), [0]);
  });

  test("matches when the provider lists the pair in reverse order", () => {
    const fixtures = [fixture(1, "Chelsea", "Arsenal")];
    const markets = [market("Arsenal", "Chelsea")];
    assert.deepEqual(resolve(fixtures, markets), [0]);
  });

  test("ignores club-type suffixes", () => {
    const fixtures = [fixture(1, "Arsenal FC", "Chelsea FC")];
    const markets = [market("Arsenal", "Chelsea")];
    assert.deepEqual(resolve(fixtures, markets), [0]);
  });

  test("folds accents rather than deleting the letter", () => {
    // Stripping non-ASCII before folding turned "Fenerbahçe" into "fenerbahe",
    // which matches nothing the other provider writes.
    const fixtures = [fixture(1, "Gornik Zabrze", "Fenerbahce")];
    const markets = [market("Górnik Zabrze", "Fenerbahçe SK")];
    assert.deepEqual(resolve(fixtures, markets), [0]);
  });

  test("prefers the most liquid market for a contested fixture", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea")];
    const markets = [market("Arsenal", "Chelsea", 5), market("Arsenal", "Chelsea", 900)];
    assert.deepEqual(resolve(fixtures, markets), [1]);
  });

  test("ignores markets that are no longer open", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea")];
    const markets = [market("Arsenal", "Chelsea", 0, "Settled")];
    assert.deepEqual(resolve(fixtures, markets), [null]);
  });

  test("handles an empty board", () => {
    assert.deepEqual(resolve([], [market("Arsenal", "Chelsea")]), []);
  });

  test("handles a board with no markets at all", () => {
    const fixtures = [fixture(1, "Arsenal", "Chelsea")];
    assert.deepEqual(resolve(fixtures, []), [null]);
  });
});

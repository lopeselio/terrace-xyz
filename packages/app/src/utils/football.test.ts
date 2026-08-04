import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  COMPETITIONS,
  COMPETITION_API_ID,
  FEATURED_COMPETITIONS,
  SEEDABLE_COMPETITIONS,
  competitionOf,
  matchesCompetition,
} from "./football.ts";

// ---------------------------------------------------------------------------
// The competition registry is now load-bearing in two directions: it drives the
// chips a fan filters by, and it drives which leagues the fixture board asks
// api-football for. A competition listed without an id silently disappears from
// the board; an id pointing at the wrong league fills the board with the wrong
// sport. Neither failure is visible in a diff, so they're pinned here.
// ---------------------------------------------------------------------------

describe("competition registry", () => {
  test("every seedable competition has an api-football id", () => {
    for (const competition of SEEDABLE_COMPETITIONS) {
      assert.ok(
        COMPETITION_API_ID[competition] != null,
        `${competition} is seeded but has no api-football id`,
      );
    }
  });

  test("the featured competitions come first on the board", () => {
    assert.deepEqual(
      SEEDABLE_COMPETITIONS.slice(0, FEATURED_COMPETITIONS.length),
      [...FEATURED_COMPETITIONS],
    );
  });

  test("featured competitions are real competitions", () => {
    for (const competition of FEATURED_COMPETITIONS) {
      assert.ok(COMPETITIONS.includes(competition), `${competition} is not in COMPETITIONS`);
    }
  });

  test("the dead World Cup chip is gone", () => {
    // WC 2026 finished in July. A chip pointing at a finished tournament reads
    // as a broken app, so internationals carry the qualifier/friendly traffic.
    assert.ok(!COMPETITIONS.includes("World Cup" as never));
    assert.ok(COMPETITIONS.includes("Internationals"));
  });

  test("known api-football league ids", () => {
    // Pinned deliberately: a transposed id here would fill the Premier League
    // board with a different country's fixtures, and it would look plausible.
    assert.equal(COMPETITION_API_ID["Premier League"], 39);
    assert.equal(COMPETITION_API_ID["Champions League"], 2);
    assert.equal(COMPETITION_API_ID["La Liga"], 140);
    assert.equal(COMPETITION_API_ID["Serie A"], 135);
    assert.equal(COMPETITION_API_ID.Bundesliga, 78);
    assert.equal(COMPETITION_API_ID["Ligue 1"], 61);
    assert.equal(COMPETITION_API_ID["Europa League"], 3);
  });
});

describe("competitionOf", () => {
  test("classifies club fixtures by club name alone", () => {
    // Polymarket titles routinely omit the competition entirely.
    assert.equal(competitionOf("Arsenal vs Chelsea"), "Premier League");
    assert.equal(competitionOf("Real Madrid vs Barcelona"), "La Liga");
    assert.equal(competitionOf("Bayern vs Dortmund"), "Bundesliga");
  });

  test("internationals still classify after the World Cup rename", () => {
    assert.equal(competitionOf("World Cup 2030 winner"), "Internationals");
    assert.equal(competitionOf("ENG vs FRA"), "Internationals");
    assert.equal(competitionOf("Nations League final"), "Internationals");
  });

  test("returns null rather than guessing", () => {
    assert.equal(competitionOf("Some five-a-side in the park"), null);
  });
});

describe("matchesCompetition", () => {
  test("All matches everything", () => {
    assert.equal(matchesCompetition("literally anything", "All"), true);
  });

  test("a competition filter excludes other competitions", () => {
    assert.equal(matchesCompetition("Arsenal vs Chelsea", "Premier League"), true);
    assert.equal(matchesCompetition("Arsenal vs Chelsea", "Serie A"), false);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  marketStateOf,
  formatCountdown,
  formatAgo,
  tickPeriodFor,
  RESOLVING_WINDOW_MS,
  URGENT_MS,
} from "./marketState.ts";

// ---------------------------------------------------------------------------
// The state a card shows decides whether a fan tries to place a bet, so the
// boundaries matter more than the happy path: the second a deadline passes,
// the hour the settlement window closes, and the difference between "settled"
// and "nobody settled it". All of it is time-dependent, so `now` is injected
// and these tests never touch a clock.
//
// Runs on Node's built-in test runner: `pnpm --filter @terrace/app test`.
// ---------------------------------------------------------------------------

const NOW = 1_800_000_000_000; // fixed instant; any value works
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(offsetMs: number): Date {
  return new Date(NOW + offsetMs);
}

describe("marketStateOf", () => {
  test("an open market before its deadline counts down and is takeable", () => {
    const info = marketStateOf({ status: "Open", expiry: at(2 * DAY + 4 * HOUR) }, NOW);
    assert.equal(info.state, "counter");
    assert.equal(info.takeable, true);
    assert.equal(info.label, "2d 4h");
    assert.equal(info.urgent, false);
  });

  test("the last quarter-hour is urgent but still takeable", () => {
    const info = marketStateOf({ status: "Open", expiry: at(URGENT_MS - 1_000) }, NOW);
    assert.equal(info.state, "counter");
    assert.equal(info.urgent, true);
    assert.equal(info.takeable, true);
  });

  test("exactly on the deadline it stops being takeable", () => {
    // The boundary that matters: at msLeft === 0 the program refuses the bet,
    // so the card must not still be offering a price.
    const info = marketStateOf({ status: "Open", expiry: at(0) }, NOW);
    assert.equal(info.state, "resolving");
    assert.equal(info.takeable, false);
  });

  test("just past the deadline it is resolving, not expired", () => {
    const info = marketStateOf({ status: "Open", expiry: at(-12 * MIN) }, NOW);
    assert.equal(info.state, "resolving");
    assert.equal(info.label, "RESOLVING");
    assert.equal(info.detail, "closed 12m ago");
  });

  test("still resolving at the edge of the settlement window", () => {
    const info = marketStateOf({ status: "Open", expiry: at(-RESOLVING_WINDOW_MS) }, NOW);
    assert.equal(info.state, "resolving");
  });

  test("past the window with no result it is expired", () => {
    const info = marketStateOf({ status: "Open", expiry: at(-RESOLVING_WINDOW_MS - 1) }, NOW);
    assert.equal(info.state, "expired");
    assert.equal(info.label, "EXPIRED");
    assert.equal(info.takeable, false);
  });

  test("a chain-closed market is resolving even before its expiry", () => {
    // Status Closed means trading stopped early — private markets sit here
    // waiting on the Arcium reveal. The deadline being in the future doesn't
    // make it takeable again.
    const info = marketStateOf({ status: "Closed", expiry: at(3 * HOUR) }, NOW);
    assert.equal(info.state, "resolving");
    assert.equal(info.takeable, false);
  });

  test("settled reports the winning side", () => {
    const yes = marketStateOf({ status: "Settled", expiry: at(-3 * DAY), outcome: 0 }, NOW);
    assert.equal(yes.state, "settled");
    assert.equal(yes.winner, "YES");
    assert.equal(yes.detail, "ended 3d ago");

    const no = marketStateOf({ status: "Settled", expiry: at(-DAY), outcome: 1 }, NOW);
    assert.equal(no.winner, "NO");
  });

  test("settled without a recorded outcome has no winner rather than a wrong one", () => {
    // Jupiter markets settle off-platform and hand back no outcome. Defaulting
    // to YES would put a false result on the card.
    const info = marketStateOf({ status: "Settled", expiry: at(-DAY) }, NOW);
    assert.equal(info.state, "settled");
    assert.equal(info.winner, null);
  });

  test("settled wins over an expiry that has long passed", () => {
    const info = marketStateOf({ status: "Settled", expiry: at(-30 * DAY), outcome: 0 }, NOW);
    assert.equal(info.state, "settled");
  });

  test("an open market with no expiry stays takeable", () => {
    const info = marketStateOf({ status: "Open", expiry: null }, NOW);
    assert.equal(info.state, "counter");
    assert.equal(info.takeable, true);
    assert.equal(info.label, "OPEN");
  });
});

describe("formatCountdown", () => {
  test("days and hours above a day", () => {
    assert.equal(formatCountdown(3 * DAY + 7 * HOUR), "3d 7h");
  });

  test("hours and zero-padded minutes under a day", () => {
    assert.equal(formatCountdown(3 * HOUR + 5 * MIN), "3h 05m");
  });

  test("minutes and seconds under an hour", () => {
    assert.equal(formatCountdown(4 * MIN + 31_000), "4:31");
    assert.equal(formatCountdown(9_000), "0:09");
  });

  test("never renders negative time", () => {
    assert.equal(formatCountdown(-5_000), "0:00");
  });
});

describe("formatAgo", () => {
  test("coarsens as it ages", () => {
    assert.equal(formatAgo(30_000), "just now");
    assert.equal(formatAgo(12 * MIN), "12m ago");
    assert.equal(formatAgo(3 * HOUR), "3h ago");
    assert.equal(formatAgo(2 * DAY), "2d ago");
  });
});

describe("tickPeriodFor", () => {
  test("a seconds countdown ticks every second, an hours one does not", () => {
    const secs = marketStateOf({ status: "Open", expiry: at(4 * MIN) }, NOW);
    assert.equal(tickPeriodFor(secs), 1_000);

    const hours = marketStateOf({ status: "Open", expiry: at(5 * HOUR) }, NOW);
    assert.equal(tickPeriodFor(hours), 30_000);
  });

  test("a settled card needs no timer at all", () => {
    const info = marketStateOf({ status: "Settled", expiry: at(-DAY), outcome: 0 }, NOW);
    assert.equal(tickPeriodFor(info), 0);
  });
});

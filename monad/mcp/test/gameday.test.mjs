// Game day logic against hand-made positions: npm test (builds first, then runs on dist/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { RESOLVE_GRACE, buildGroups, effectiveAnswer, renderGameDay, takesToRead } from "../dist/gameday.js";

const NOW = 1_800_000_000;
const ME = "0xme";
const $ = (n) => String(n * 1e6);

const fx = (id, kickoff, state = 0, homeGoals = 0, awayGoals = 0) => ({ id: String(id), kickoff: String(kickoff), state, homeGoals, awayGoals });
const q = (id, kind, fixture, extra = {}) => ({ id: String(id), text: `take ${id}`, kind, line: 2, answer: 0, closeTime: fixture.kickoff, spec: null, fixture, ...extra });
const bet = (id, side, stake, question, pools = { yes: 10, no: 10 }, extra = {}) => ({
  id: String(id), side, stake: $(stake), result: null, payout: null,
  market: { id: String(id), feeBps: 0, yesPool: $(pools.yes), noPool: $(pools.no), isFlash: false, question }, ...extra,
});
const duel = (id, side, stake, question, extra = {}) => ({ id: String(id), challenger: ME, opponent: "0xmate", challengerSide: side, stake: $(stake), status: 1, winner: null, question, ...extra });
const match = (id, status, home, away, kickoff = NOW - 3600, elapsed = 60) => ({ id, kickoff, status, elapsed, home: { name: "Arsenal" }, away: { name: "Chelsea" }, goals: { home, away } });

test("a live match reads each position against the score", () => {
  const f = fx(1, NOW - 3600);
  const matches = new Map([[1, match(1, "2H", 2, 1)]]);
  const groups = buildGroups([bet(1, 1, 5, q(1, 1, f)), bet(2, 1, 5, q(2, 3, f))], [], ME, matches, {}, NOW);
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.equal(g.phase, "live");
  assert.deepEqual(g.score, { home: 2, away: 1 });
  assert.deepEqual(g.positions.map((p) => [p.title, p.standing]), [["Arsenal win", "winning"], ["Chelsea win", "losing"]]);
  // $5 of a $20 pool on a $10 side pays $10: +$5 on one, -$5 on the other
  assert.equal(g.ifEndsNow, 0);
  assert.equal(g.staked, 10e6);
});

test("custom takes use the live reading, and stay In play without one", () => {
  const f = fx(1, NOW - 3600);
  const matches = new Map([[1, match(1, "1H", 0, 0)]]);
  const a = q(1, 0, f, { spec: "rule" }), b = q(2, 0, f, { spec: "rule" });
  const groups = buildGroups([bet(1, 2, 4, a), bet(2, 1, 4, b)], [], ME, matches, { 1: "NO" }, NOW);
  assert.deepEqual(groups[0].positions.map((p) => p.standing), ["winning", "live"]);
  assert.deepEqual(takesToRead([bet(1, 2, 4, a)], [], matches, NOW), [{ id: "1", fixture: 1, spec: "rule" }]);
});

test("matches come live first, then full time, then upcoming", () => {
  const matches = new Map([
    [1, match(1, "NS", null, null, NOW + 7200)],
    [2, match(2, "FT", 1, 1, NOW - 7200)],
    [3, match(3, "HT", 0, 1)],
  ]);
  const bets = [1, 2, 3].map((id) => bet(id, 1, 1, q(id, 2, fx(id, matches.get(id).kickoff))));
  const groups = buildGroups(bets, [], ME, matches, {}, NOW);
  assert.deepEqual(groups.map((g) => [g.fixture, g.phase]), [[3, "live"], [2, "fulltime"], [1, "upcoming"]]);
  assert.deepEqual(groups.map((g) => g.positions[0].standing), ["losing", "winning", "upcoming"]);
  assert.equal(groups[2].ifEndsNow, null);
});

test("a match off the schedule reads its score from the indexer once it's over", () => {
  const f = fx(9, NOW - 9 * 3600, 1, 1, 0);
  const groups = buildGroups([bet(1, 1, 2, q(1, 5, f)), bet(2, 1, 2, q(2, 0, f))], [], ME, new Map(), {}, NOW);
  assert.equal(groups[0].phase, "fulltime");
  assert.deepEqual(groups[0].score, { home: 1, away: 0 });
  // both teams score: settled off the final score; a fan's own take waits on Chainlink
  assert.deepEqual(groups[0].positions.map((p) => [p.standing, p.collectible]), [["lost", false], ["due", false]]);
});

test("settled bets: paid out, to collect, and timed out into a refund", () => {
  const old = fx(1, NOW - 3600);
  const won = bet(1, 1, 5, q(1, 1, old, { answer: 1 }), { yes: 5, no: 15 });
  const paid = bet(2, 1, 5, q(2, 1, old, { answer: 1 }), undefined, { result: 1, payout: $(9) });
  const stale = bet(3, 1, 5, q(3, 0, fx(1, NOW - RESOLVE_GRACE - 7200), { closeTime: String(NOW - RESOLVE_GRACE - 3600) }));
  const ps = buildGroups([won, paid, stale], [], ME, new Map(), {}, NOW).flatMap((g) => g.positions);
  assert.deepEqual(ps.map((p) => [p.standing, p.collectible, p.returns]), [["won", true, 20e6], ["won", false, 9e6], ["refund", true, 5e6]]);
});

test("effectiveAnswer voids a called-off match and one past the grace", () => {
  assert.equal(effectiveAnswer({ answer: 0, kind: 1, fixture: { state: 2, kickoff: "0" } }, NOW), 3);
  assert.equal(effectiveAnswer({ answer: 0, kind: 1, fixture: { state: 0, kickoff: String(NOW - RESOLVE_GRACE - 1) } }, NOW), 3);
  assert.equal(effectiveAnswer({ answer: 0, kind: 1, fixture: { state: 0, kickoff: String(NOW - 60) } }, NOW), 0);
  assert.equal(effectiveAnswer({ answer: 2, kind: 1, fixture: null }, NOW), 2);
});

test("effectiveAnswer reads a standard question off the final score", () => {
  const ft = { state: 1, kickoff: String(NOW - 7200), homeGoals: 2, awayGoals: 2 };
  assert.equal(effectiveAnswer({ answer: 0, kind: 2, fixture: ft }, NOW), 1); // draw
  assert.equal(effectiveAnswer({ answer: 0, kind: 4, line: 3, fixture: ft }, NOW), 1); // over 3.5
  assert.equal(effectiveAnswer({ answer: 0, kind: 4, line: 4, fixture: ft }, NOW), 2);
  assert.equal(effectiveAnswer({ answer: 0, kind: 0, closeTime: String(NOW - 60), fixture: ft }, NOW), 0); // a take still waits
});

test("1v1s: waiting for a mate, not taken, and won but not yet settled", () => {
  const soon = fx(1, NOW + 3600), gone = fx(2, NOW - 3 * 86400 + 3600), done = fx(3, NOW - 7200, 1, 2, 0);
  const matches = new Map([[1, match(1, "NS", null, null, NOW + 3600)], [3, match(3, "FT", 2, 0, NOW - 7200)]]);
  const duels = [
    duel(1, 1, 3, q(1, 1, soon), { status: 0 }),
    duel(2, 1, 3, q(2, 1, gone), { status: 0 }),
    duel(3, 2, 3, q(3, 3, done, { answer: 2 })),
    duel(4, 1, 3, q(4, 1, done)), // no stored answer: Arsenal won 2-0 at full time
    duel(5, 1, 3, q(5, 1, gone), { status: 0, challenger: "0xmate", opponent: ME }), // a mate's old untaken offer
  ];
  const ps = buildGroups([], duels, ME, matches, {}, NOW).flatMap((g) => g.positions);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p]));
  assert.equal(byId[1].standing, "waiting");
  assert.equal(byId[2].standing, "expired");
  assert.equal(byId[2].collectible, true);
  assert.equal(byId[3].standing, "won");
  assert.equal(byId[3].collectible, true);
  assert.equal(byId[3].returns, 6e6);
  assert.equal(byId[3].pick, "No, 1v1");
  assert.equal(byId[4].standing, "won");
  assert.equal(byId[4].collectible, true);
  assert.equal(byId[5], undefined);
});

test("the board ends with what's on the line, if it all ends now, and what to collect", () => {
  const f = fx(1, NOW - 3600);
  const matches = new Map([[1, match(1, "2H", 1, 0)]]);
  const groups = buildGroups([bet(1, 1, 5, q(1, 1, f)), bet(2, 1, 5, q(2, 1, fx(2, NOW - 7200), { answer: 1 }))], [], ME, matches, {}, NOW);
  const text = renderGameDay(groups, [{ id: "1", legs: 3, liveLegs: 3, stake: $(2), status: 0, payout: null }]);
  assert.match(text, /^LIVE 60' {2}Arsenal 1-0 Chelsea/);
  assert.match(text, /Arsenal win: Yes, \$5\.00 staked\. Winning, \+\$5\.00/);
  assert.match(text, /On the line: \$7\.00 across 1 game and 1 parlay\./);
  assert.match(text, /If it all ends now: \+\$5\.00 \(1 winning, 0 losing\)\./);
  assert.match(text, /Ready to collect: \$10\.00\. Run terrace_collect/);
  assert.doesNotMatch(text, /wallet|gas|transaction|token/i);
});

test("an empty game day points at where to find a bet", () => {
  assert.match(renderGameDay([], []), /No open bets right now/);
});

test("parlay legs sit on their own matches, without a stake, outside if-it-ends-now", () => {
  const f = fx(1, NOW - 3600);
  const matches = new Map([[1, match(1, "2H", 1, 0)]]);
  const legs = [
    { acca: "7", index: 0, of: 2, side: 1, question: q(10, 1, f) },
    { acca: "7", index: 1, of: 2, side: 1, question: q(11, 3, fx(2, NOW - 7200, 1, 0, 0)) },
  ];
  const groups = buildGroups([bet(1, 2, 5, q(1, 1, f))], [], ME, matches, {}, NOW, legs);
  const live = groups.find((g) => g.fixture === 1);
  assert.deepEqual(live.positions.map((p) => [p.kind, p.standing, p.stake]), [["bet", "losing", 5e6], ["leg", "winning", 0]]);
  assert.equal(live.ifEndsNow, -5e6);
  assert.equal(groups.find((g) => g.fixture === 2).positions[0].standing, "lost"); // 0-0, the away side didn't win
  const text = renderGameDay(groups, [{ id: "7", legs: 2, liveLegs: 1, stake: $(2), status: 0, payout: null }]);
  assert.match(text, /Arsenal win: Yes, parlay leg 1 of 2\. Winning\n/);
  assert.match(text, /Parlay #7, \$2\.00 staked: 1 leg down, 1 of 2 landing\./);
  assert.match(text, /If it all ends now: -\$5\.00 \(1 winning, 1 losing\)\./);
});

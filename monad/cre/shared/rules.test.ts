import { describe, expect, test } from "bun:test";
import sample from "./fixtures-data/sample.json";
import { evaluate, evidence, parseRule, type FixtureDetail, type Rule } from "./rules";

// Man United 1-0 Fulham (API-Football fixture 1208021): Zirkzee 87', five yellow cards, corners 7-8.
const full = sample.response[0] as unknown as FixtureDetail;
const rule = (r: object) => parseRule(JSON.stringify({ v: 1, ...r })) as Rule;
const at = (short: string, elapsed: number): FixtureDetail => ({
  ...full,
  fixture: { ...full.fixture, status: { short, elapsed } },
  events: (full.events ?? []).filter((e) => e.time.elapsed <= elapsed),
});

describe("rules settle from match data", () => {
  test("player goal in a window: YES the moment it happens", () => {
    const r = rule({ left: { events: { type: "Goal", player: 70100, minute: [80, 90] } }, op: ">=", value: 1 });
    expect(evaluate(r, at("2H", 85))).toBe("PENDING");
    expect(evaluate(r, at("2H", 88))).toBe("YES");
  });

  test("player goal in a window that passed: NO once it's over", () => {
    const r = rule({ left: { events: { type: "Goal", player: 70100, minute: [0, 60] } }, op: ">=", value: 1 });
    expect(evaluate(r, at("2H", 55))).toBe("PENDING");
    expect(evaluate(r, at("2H", 61))).toBe("NO");
  });

  test("first-half windows close at half time", () => {
    const r = rule({ left: { events: { type: "Goal", minute: [0, 45] } }, op: ">=", value: 1 });
    expect(evaluate(r, at("1H", 44))).toBe("PENDING");
    expect(evaluate(r, at("HT", 45))).toBe("NO");
  });

  test("card counts and 'no more than' takes wait for full time", () => {
    expect(evaluate(rule({ left: { events: { type: "Card", detail: "Yellow Card" } }, op: ">=", value: 5 }), full)).toBe("YES");
    expect(evaluate(rule({ left: { events: { type: "Card", detail: "Red Card" } }, op: ">=", value: 1 }), full)).toBe("NO");
    const atMostOneFulhamCard = rule({ left: { events: { type: "Card", team: 36 } }, op: "<=", value: 1 });
    expect(evaluate(atMostOneFulhamCard, at("2H", 30))).toBe("PENDING");
    expect(evaluate(atMostOneFulhamCard, full)).toBe("NO");
  });

  test("starting XI", () => {
    expect(evaluate(rule({ left: { lineup: { player: 2935 } }, op: "==", value: 1 }), full)).toBe("YES");
    expect(evaluate(rule({ left: { lineup: { player: 70100 } }, op: "==", value: 1 }), full)).toBe("NO");
  });

  test("team stats, compared head to head and as percentages", () => {
    const fulhamMoreCorners = rule({ left: { stat: { team: 36, type: "Corner Kicks" } }, op: ">", right: { stat: { team: 33, type: "Corner Kicks" } } });
    expect(evaluate(fulhamMoreCorners, full)).toBe("YES");
    expect(evaluate(fulhamMoreCorners, at("2H", 70))).toBe("PENDING");
    expect(evaluate(rule({ left: { stat: { team: 33, type: "Ball Possession" } }, op: ">=", value: 55 }), full)).toBe("YES");
  });

  test("player stats by path", () => {
    expect(evaluate(rule({ left: { player: { player: 526, field: "goals.saves" } }, op: ">=", value: 2 }), full)).toBe("YES");
    expect(evaluate(rule({ left: { player: { player: 526, field: "goals.saves" } }, op: ">=", value: 3 }), full)).toBe("NO");
  });

  test("scores, including half time", () => {
    expect(evaluate(rule({ left: { score: { side: "total" } }, op: "<=", value: 1 }), full)).toBe("YES");
    expect(evaluate(rule({ left: { score: { side: "home", period: "halftime" } }, op: ">=", value: 1 }), full)).toBe("NO");
  });

  test("called-off matches void, unplayed ones wait", () => {
    const r = rule({ left: { events: { type: "Goal" } }, op: ">=", value: 1 });
    expect(evaluate(r, at("PST", 0))).toBe("VOID");
    expect(evaluate(r, { ...at("NS", 0), events: [] })).toBe("PENDING");
  });

  test("malformed rules are rejected", () => {
    expect(parseRule("not json")).toBeNull();
    expect(parseRule(JSON.stringify({ v: 2, left: { score: { side: "home" } }, op: ">=", value: 1 }))).toBeNull();
    expect(parseRule(JSON.stringify({ v: 1, left: { weather: {} }, op: ">=", value: 1 }))).toBeNull();
    expect(parseRule(JSON.stringify({ v: 1, left: { score: { side: "home" } }, op: "~", value: 1 }))).toBeNull();
  });

  test("evidence summarises the match for the AI judge", () => {
    const text = evidence(full as never);
    expect(text).toContain("Score: Manchester United 1-0 Fulham");
    expect(text).toContain("87' Goal (Normal Goal)");
  });
});

import { describeRule } from "./rules";

describe("plain-English readings", () => {
  const names = { teams: { 33: "Man United", 36: "Fulham" }, players: { 70100: "Zirkzee", 2935: "Maguire", 526: "Onana" } };
  test("reads like the take", () => {
    expect(describeRule(rule({ left: { events: { type: "Goal", player: 70100, minute: [60, 90] } }, op: ">=", value: 1 }), names)).toBe(
      "Settles YES if there is a goal by Zirkzee between minute 60 and 90.",
    );
    expect(describeRule(rule({ left: { events: { type: "Card", detail: "Red Card" } }, op: ">=", value: 2 }), names)).toBe(
      "Settles YES if the number of red cards is at least 2.",
    );
    expect(describeRule(rule({ left: { lineup: { player: 2935 } }, op: "==", value: 1 }), names)).toBe("Settles YES if Maguire is in the starting XI.");
    expect(
      describeRule(rule({ left: { stat: { team: 36, type: "Corner Kicks" } }, op: ">", right: { stat: { team: 33, type: "Corner Kicks" } } }), names),
    ).toBe("Settles YES if Fulham's corner kicks total is higher than Man United's corner kicks total at full time.");
    expect(describeRule(rule({ left: { player: { player: 526, field: "goals.saves" } }, op: ">=", value: 5 }), names)).toBe(
      "Settles YES if Onana's saves is at least 5 at full time.",
    );
  });
});

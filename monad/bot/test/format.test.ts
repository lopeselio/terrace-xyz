import { describe, expect, test } from "bun:test";
import { disputeReply, settlementCard, takeCard } from "../src/format";
import { settledNames } from "../src/watch";
import { fanName } from "../src/names";
import { FIXTURES } from "./fixtures";

const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222", C = "0x3333333333333333333333333333333333333333";
const bets = [
  { bettor: A, side: 1, stake: "5000000", result: null, market: { id: "1" } },
  { bettor: B, side: 2, stake: "5000000", result: null, market: { id: "1" } },
  { bettor: C, side: 1, stake: "10000000", result: null, market: { id: "1" } },
];
const NO_CRYPTO = /0x[0-9a-f]{6,}|wallet|gas|transaction|token|onchain|hash/i;

describe("settlement formatting", () => {
  test("winners by name, linked Telegram names first", () => {
    const { winners, refunded } = settledNames(bets, 1, new Map([[A, "Dave"]]));
    expect(winners).toEqual(["Dave", fanName(C)]);
    expect(refunded).toEqual([]);
    const card = settlementCard({ text: "Arsenal win", answer: 1, ruled: true, match: "Arsenal v Chelsea", score: "2-1", winners, refunded });
    expect(card).toContain("It came in");
    expect(card).toContain("Arsenal v Chelsea · 2-1");
    expect(card).toContain("Chainlink, from the official match data");
    expect(card).toContain("Winners: Dave, ");
    expect(card).not.toMatch(NO_CRYPTO);
  });
  test("a fade wins when it didn't happen", () => {
    const { winners } = settledNames(bets, 2, new Map());
    expect(winners).toEqual([fanName(B)]);
    expect(settlementCard({ text: "x", answer: 2, ruled: false, match: "m", winners, refunded: [] })).toContain("AI judge");
  });
  test("void is described as refunded, with everyone's stake back", () => {
    const { winners, refunded } = settledNames(bets, 3, new Map());
    const card = settlementCard({ text: "Saka scores", answer: 3, ruled: false, match: "Arsenal v Chelsea", winners, refunded });
    expect(card).toContain("Refunded");
    expect(card).not.toContain("Winners");
    expect(refunded.length).toBe(3);
  });
  test("user text is escaped", () => {
    expect(settlementCard({ text: "<b>x</b>", answer: 2, ruled: true, match: "m", winners: [], refunded: [] })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
  test("dispute reply keeps the house voice", () => expect(disputeReply()).toStartWith("I don't referee the referee"));
});

test("take card has the rule, match, kick-off and lock time in plain words", () => {
  const f = FIXTURES[0];
  const card = takeCard({ author: "Dave", text: "Arsenal beat Chelsea", reading: "Arsenal win the match.", fixture: f, closeTime: f.kickoff, stake: 10, ruled: true, tz: "Europe/London" });
  expect(card).toContain("Arsenal win the match.");
  expect(card).toContain("Arsenal v Chelsea · Premier League");
  expect(card).toContain("Sun 22 Nov, 16:30");
  expect(card).toContain("at kick-off (16:30)");
  expect(card).toContain("$10");
  expect(card).not.toMatch(NO_CRYPTO);
});

import { describe, expect, test } from "bun:test";
import { Store } from "../src/store";

const take = (token: string, chatId: number, fixtureId: number, createdAt = 1000) => ({
  token, chatId, authorTg: 7, authorName: "Dave", text: "Arsenal win", fixtureId, stake: 5, closeTime: 9999999999, reading: "Arsenal win the match.", ruled: true, createdAt,
});

describe("chat ↔ market mapping", () => {
  test("a claimed take maps its market to the chat, once", () => {
    const s = new Store();
    s.addPending(take("a", -100, 1));
    expect(s.claim("a", "42", "7", 2000)).toBe(true);
    expect(s.claim("a", "43", "8", 2001)).toBe(false);
    expect(s.pending("a")!.marketId).toBe("42");
    expect(s.pending("a")!.takeId).toBe("7");
    expect(s.marketsOfChat(-100).map((m) => m.marketId)).toEqual(["42"]);
    expect(s.chatsOfMarket("42")).toEqual([-100]);
    expect(s.isClaimed("42")).toBe(true);
    expect(s.unclaimed(0)).toEqual([]);
  });
  test("fixtures fan out to every chat with an open market, and drop out once settled", () => {
    const s = new Store();
    s.addPending(take("a", -1, 9));
    s.addPending(take("b", -2, 9));
    s.addPending(take("c", -3, 10));
    s.claim("a", "1", null, 1);
    s.claim("b", "2", null, 1);
    s.claim("c", "3", null, 1);
    s.mapMarket(-4, "1", 9, "a", 1);
    expect(s.liveFixtures().sort((a, b) => a - b)).toEqual([9, 10]);
    expect(s.chatsOfFixture(9).sort((a, b) => a - b)).toEqual([-4, -2, -1]);
    s.markSettled("1", 1, 5);
    expect(s.chatsOfFixture(9)).toEqual([-2]);
    s.markSettled("2", 3, 5);
    expect(s.liveFixtures()).toEqual([10]);
    expect(s.marketsOfChat(-1, true)).toEqual([]);
  });
  test("link codes work once and expire", () => {
    const s = new Store();
    s.newLinkCode("x", 7, "Dave", 100);
    expect(s.useLinkCode("x", 50)).toEqual({ tgUser: 7, name: "Dave" });
    expect(s.useLinkCode("x", 50)).toBeNull();
    s.newLinkCode("y", 7, "Dave", 100);
    expect(s.useLinkCode("y", 101)).toBeNull();
  });
  test("linked names and chat tables", () => {
    const s = new Store();
    s.link(7, "0xABC", "Dave", 1);
    s.seen(-1, 7);
    s.seen(-1, 8);
    expect(s.namesOf(["0xabc", "0xdef"])).toEqual(new Map([["0xabc", "Dave"]]));
    expect(s.chatAccounts(-1)).toEqual([{ tgUser: 7, address: "0xabc", name: "Dave" }]);
  });
});

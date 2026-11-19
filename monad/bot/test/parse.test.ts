import { describe, expect, test } from "bun:test";
import { isDispute, parseTake, resolveFixture } from "../src/parse";
import { FIXTURES, NOW } from "./fixtures";

const TZ = "Europe/London";

describe("parseTake", () => {
  test("strips the mention and reads a trailing stake", () => {
    expect(parseTake("@TerraceBot Arsenal beat Chelsea Sunday, 10", "TerraceBot")).toEqual({ text: "Arsenal beat Chelsea Sunday", stake: 10 });
    expect(parseTake("Saka scores first @TerraceBot £20", "TerraceBot")).toEqual({ text: "Saka scores first", stake: 20 });
    expect(parseTake("@terracebot Palmer scores for 5 quid", "TerraceBot")).toEqual({ text: "Palmer scores", stake: 5 });
  });
  test("reads /take, with or without the bot's name", () => {
    expect(parseTake("/take Spurs win Sunday", "TerraceBot")).toEqual({ text: "Spurs win Sunday", stake: null });
    expect(parseTake("/take@TerraceBot Spurs win, $15", "TerraceBot")).toEqual({ text: "Spurs win", stake: 15 });
  });
  test("keeps numbers that are part of the take", () => {
    expect(parseTake("/take Haaland scores 2", "TerraceBot")).toEqual({ text: "Haaland scores 2", stake: null });
    expect(parseTake("/take over 3.5 goals at Anfield", "TerraceBot")!.text).toBe("over 3.5 goals at Anfield");
  });
  test("ignores out-of-range stakes and empty takes", () => {
    expect(parseTake("/take Arsenal win, 5000", "TerraceBot")).toEqual({ text: "Arsenal win, 5000", stake: null });
    expect(parseTake("@TerraceBot", "TerraceBot")).toBeNull();
    expect(parseTake("/take hi", "TerraceBot")).toBeNull();
  });
});

describe("resolveFixture", () => {
  const ids = (text: string) => resolveFixture(text, FIXTURES, NOW, TZ).map((f) => f.id);
  test("both teams named picks the match", () => expect(ids("Arsenal beat Chelsea")).toEqual([101]));
  test("nicknames work", () => {
    expect(ids("Spurs batter United")).toEqual([103]);
    expect(ids("Pool v City goes to penalties")).toEqual([102]);
  });
  test("one team and no day means their next match", () => expect(ids("Saka scores, Arsenal win")).toEqual([101]));
  test("a day narrows it", () => expect(ids("Arsenal win on Wednesday")).toEqual([104]));
  test("finished matches and unknown teams return nothing", () => {
    expect(ids("Everton nick a point")).toEqual([]);
    expect(ids("Wrexham win the league")).toEqual([]);
  });
});

test("isDispute spots referee complaints", () => {
  expect(isDispute("we were robbed, VAR is bent")).toBe(true);
  expect(isDispute("Saka scores Sunday")).toBe(false);
});

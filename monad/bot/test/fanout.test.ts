import { describe, expect, test } from "bun:test";
import { FixtureHub, type Snapshot } from "../src/fanout";

const snap = (id: number, status: string, h: number | null, a: number | null, elapsed: number | null = null): Snapshot => ({ id, status, elapsed, home: "Arsenal", away: "Chelsea", goals: { home: h, away: a } });

function rig(chats: Record<number, number[]>) {
  let t = 0;
  const sent: { chatId: number; text: string; key: string }[] = [];
  let feed = new Map<number, Snapshot>();
  const reads: number[][] = [];
  const hub = new FixtureHub({
    read: async (ids) => (reads.push(ids), ids.map((i) => feed.get(i)!).filter(Boolean)),
    fixtures: () => Object.keys(chats).map(Number),
    chats: (id) => chats[id] ?? [],
    publish: (chatId, text, key) => sent.push({ chatId, text, key }),
    now: () => t,
    debounceMs: 20_000,
    maxHoldMs: 60_000,
  });
  return { hub, sent, reads, set: (s: Snapshot) => feed.set(s.id, s), tick: (ms: number) => (t += ms) };
}

describe("fixture fan-out", () => {
  test("one read per fixture per round, however many chats", async () => {
    const r = rig({ 1: [-1, -2, -3], 2: [-4] });
    r.set(snap(1, "NS", null, null));
    r.set(snap(2, "NS", null, null));
    await r.hub.poll();
    expect(r.reads).toEqual([[1, 2]]);
    r.set(snap(1, "1H", 1, 0, 12));
    await r.hub.poll();
    r.tick(25_000);
    await r.hub.poll();
    expect(r.sent.map((s) => s.chatId).sort((a, b) => a - b)).toEqual([-3, -2, -1]);
    expect(r.sent[0].text).toContain("Goal");
    expect(r.sent[0].text).toContain("1-0");
    expect(r.sent[0].key).toBe("live-1");
  });
  test("first sight doesn't replay the match so far", async () => {
    const r = rig({ 1: [-1] });
    r.set(snap(1, "2H", 2, 1, 70));
    await r.hub.poll();
    r.tick(60_000);
    r.hub.flush();
    expect(r.sent).toEqual([]);
  });
});

describe("debounce", () => {
  test("goals close together go out as one message", async () => {
    const r = rig({ 1: [-1] });
    r.set(snap(1, "1H", 0, 0, 10));
    await r.hub.poll();
    r.set(snap(1, "1H", 1, 0, 30));
    await r.hub.poll();
    r.tick(10_000);
    r.set(snap(1, "1H", 1, 1, 31));
    await r.hub.poll();
    expect(r.sent).toEqual([]);
    r.tick(21_000);
    r.hub.flush();
    expect(r.sent.length).toBe(1);
    expect(r.sent[0].text.match(/Goal/g)!.length).toBe(2);
    expect(r.sent[0].text).toContain("1-1");
  });
  test("a long burst still goes out after the max hold", async () => {
    const r = rig({ 1: [-1] });
    r.set(snap(1, "1H", 0, 0));
    await r.hub.poll();
    for (let i = 1; i <= 5; i++) {
      r.set(snap(1, "1H", i, 0));
      await r.hub.poll();
      r.tick(15_000);
      r.hub.flush();
    }
    expect(r.sent.length).toBe(1);
  });
  test("full-time goes straight out", async () => {
    const r = rig({ 1: [-1] });
    r.set(snap(1, "2H", 1, 0, 88));
    await r.hub.poll();
    r.set(snap(1, "FT", 1, 0, 90));
    await r.hub.poll();
    expect(r.sent.length).toBe(1);
    expect(r.sent[0].text).toContain("Full-time");
  });
  test("cards from an events feed are announced", async () => {
    const r = rig({ 1: [-1] });
    r.set({ ...snap(1, "1H", 0, 0), events: [] });
    await r.hub.poll();
    r.set({ ...snap(1, "1H", 0, 0), events: [{ kind: "red", minute: 40, team: "Chelsea", player: "Cucurella" }] });
    await r.hub.poll();
    r.hub.flush(true);
    expect(r.sent[0].text).toContain("Red card · Cucurella (Chelsea)");
  });
});

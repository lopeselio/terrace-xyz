import { expect, test } from "bun:test";
import { MAX_TEXT, SendQueue, type Job } from "../src/ratelimit";

function rig() {
  let t = 1_000_000;
  const sent: Job[] = [];
  const q = new SendQueue(async (j) => void sent.push(j), { globalPerSec: 3, chatGapMs: 1000, groupPerMin: 2 }, () => t);
  return { q, sent, tick: (ms: number) => (t += ms) };
}

test("one message a second per chat, global cap per second", async () => {
  const r = rig();
  for (const c of [-1, -1, -2, -3, -4]) r.q.push({ chatId: c, text: "x" });
  await r.q.tick();
  expect(r.sent.map((j) => j.chatId)).toEqual([-1, -2, -3]);
  r.tick(1000);
  await r.q.tick();
  expect(r.sent.map((j) => j.chatId)).toEqual([-1, -2, -3, -1, -4]);
  r.q.stop();
});

test("groups cap per minute; queued updates for the same key are batched", async () => {
  const r = rig();
  r.q.push({ chatId: -1, text: "a", key: "live-1" });
  r.q.push({ chatId: -1, text: "b", key: "live-1" });
  r.q.push({ chatId: -1, text: "c" });
  r.q.push({ chatId: -1, text: "d" });
  expect(r.q.size).toBe(3);
  for (let i = 0; i < 3; i++) {
    await r.q.tick();
    r.tick(1000);
  }
  expect(r.sent.map((j) => j.text)).toEqual(["a\n\nb", "c"]);
  r.tick(60_000);
  await r.q.tick();
  expect(r.sent.length).toBe(3);
  r.q.stop();
});

test("retry_after pauses the queue and keeps the message", async () => {
  let t = 0, fail = true;
  const sent: string[] = [];
  const q = new SendQueue(async (j) => {
    if (fail) {
      fail = false;
      throw Object.assign(new Error("Too Many Requests"), { parameters: { retry_after: 5 } });
    }
    sent.push(j.text);
  }, undefined, () => t);
  q.push({ chatId: -1, text: "hi" });
  await q.tick();
  t += 2000;
  await q.tick();
  expect(sent).toEqual([]);
  t += 4000;
  await q.tick();
  expect(sent).toEqual(["hi"]);
  q.stop();
});

test("merges stop short of Telegram's 4096 characters; one long text is cut", async () => {
  const r = rig();
  const chunk = "g".repeat(3000);
  r.q.push({ chatId: -1, text: chunk, key: "ft-1" });
  r.q.push({ chatId: -1, text: chunk, key: "ft-1" });
  r.q.push({ chatId: -2, text: "x".repeat(5000) });
  expect(r.q.size).toBe(3);
  await r.q.tick();
  expect(r.sent.every((j) => j.text.length <= MAX_TEXT)).toBe(true);
  r.q.stop();
});

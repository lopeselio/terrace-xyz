import { describe, expect, test } from "bun:test";
import { createBot } from "../src/bot";
import { FixtureHub } from "../src/fanout";
import { SendQueue } from "../src/ratelimit";
import { Store } from "../src/store";
import { Watcher } from "../src/watch";
import { BOT_INFO, capture, fakeTerrace, groupText } from "./helpers";
import { FIXTURES, NOW } from "./fixtures";

const cfg = { token: "123:test", botUrl: "https://bot.example", terraceUrl: "https://play.terrace.social", tz: "Europe/London", defaultStake: 5, botInfo: BOT_INFO };

function rig(state: Parameters<typeof fakeTerrace>[0] = {}) {
  const store = new Store();
  const terrace = fakeTerrace(state);
  const sent: { chatId: number; text: string }[] = [];
  const queue = new SendQueue(async (j) => void sent.push(j));
  const bot = createBot(cfg, { store, terrace, queue, now: () => NOW * 1000 });
  const calls = capture(bot);
  const hub = new FixtureHub({ read: (ids) => terrace.snapshots(ids), fixtures: () => store.liveFixtures(), chats: (id) => store.chatsOfFixture(id), publish: (c, t, k) => queue.push({ chatId: c, text: t, key: k }) });
  const watcher = new Watcher({ botUrl: cfg.botUrl, terraceUrl: cfg.terraceUrl, store, terrace, queue, hub, api: bot.api, tz: cfg.tz, fixtures: () => terrace.matches(), now: () => NOW * 1000 + 60_000 });
  return { store, bot, calls, sent, queue, watcher, state, terrace };
}

describe("group flow (mocked Telegram)", () => {
  test("@mention take → rule card with Back/Fade deep links", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("@TerraceBot Arsenal beat Chelsea Sunday, 10"));
    const reply = r.calls.find((c) => c.method === "sendMessage")!;
    expect(reply.payload.text).toContain("Dave's take");
    expect(reply.payload.text).toContain("Arsenal beat Chelsea Sunday: settles on the official result.");
    expect(reply.payload.text).toContain("Arsenal v Chelsea");
    const kb = (reply.payload.reply_markup as { inline_keyboard: { text: string; url: string }[][] }).inline_keyboard;
    expect(kb[0].map((b) => b.text)).toEqual(["Back it", "Fade it"]);
    expect(kb[0][0].url).toMatch(/^https:\/\/bot\.example\/go\/[\w-]+\?side=yes$/);
    const [p] = r.store.unclaimed(0);
    expect(p).toMatchObject({ chatId: -100, fixtureId: 101, stake: 10, text: "Arsenal beat Chelsea Sunday", messageId: 501 });
    r.queue.stop();
  });

  test("/take with an ambiguous team asks which match", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("/take Arsenal keep a clean sheet this week"));
    // One team named, no day: their next match (Sunday) is picked, no question needed.
    expect(r.store.unclaimed(0)[0].fixtureId).toBe(101);
    await r.bot.handleUpdate(groupText("/take City or United win this weekend"));
    const ask = r.calls.filter((c) => c.method === "sendMessage").at(-1)!;
    expect(ask.payload.text).toBe("Which match?");
    r.queue.stop();
  });

  test("only the take's author picks the match; the card stays theirs", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("/take City or United win this weekend"));
    const ask = r.calls.filter((c) => c.method === "sendMessage").at(-1)!;
    const data = (ask.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0][0].callback_data;
    const tap = (from: { id: number; first_name: string }, n: number) =>
      r.bot.handleUpdate({ update_id: 900 + n, callback_query: { id: `cb${n}`, from: { ...from, is_bot: false }, chat_instance: "ci", data, message: { message_id: 50, date: NOW, chat: { id: -100, type: "group", title: "G" } } } } as never);
    await tap({ id: 8, first_name: "Bob" }, 1);
    expect(r.calls.find((c) => c.method === "answerCallbackQuery")!.payload.text).toBe("That's Dave's take to place.");
    expect(r.store.unclaimed(0)).toEqual([]);
    await tap({ id: 7, first_name: "Dave" }, 2);
    expect(r.store.unclaimed(0)[0].authorName).toBe("Dave");
    expect(r.store.unclaimed(0)[0].authorTg).toBe(7);
    r.queue.stop();
  });

  test("an unreachable compiler still gets a plain reply", async () => {
    const r = rig();
    r.terrace.compile = async () => {
      throw new Error("fetch failed");
    };
    await r.bot.handleUpdate(groupText("/take Arsenal beat Chelsea"));
    expect(r.calls.at(-1)!.payload.text).toContain("couldn't read that one");
    r.queue.stop();
  });

  test("compiler stoppage is explained in plain words", async () => {
    const r = rig({ compileError: "match_data" });
    await r.bot.handleUpdate(groupText("/take Arsenal beat Chelsea"));
    expect(r.calls.at(-1)!.payload.text).toContain("match data");
    expect(r.store.unclaimed(0)).toEqual([]);
    r.queue.stop();
  });

  test("dispute gets the house line", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("that's rigged, the ref was bent", { id: 8, first_name: "Sam" }, -100, { from: BOT_INFO }));
    expect(r.calls.at(-1)!.payload.text).toStartWith("I don't referee the referee");
    r.queue.stop();
  });

  test("market opens → chat mapping, then full-time result posts winners by name", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("@TerraceBot Arsenal beat Chelsea, 10"));
    const market = { id: "77", createdAt: String(NOW + 30), creator: "0x1", yesPool: "10000000", noPool: "5000000", bettors: 2, take: { id: "12" }, question: { id: "q", text: "Arsenal beat Chelsea", spec: "0xabc", answer: 0, closeTime: String(FIXTURES[0].kickoff), fixture: { id: "101" } } };
    r.state.markets = [market];
    expect(await r.watcher.claimRound()).toBe(1);
    expect(r.store.marketsOfChat(-100).map((m) => m.marketId)).toEqual(["77"]);
    const edit = r.calls.find((c) => c.method === "editMessageText")!;
    expect(String(edit.payload.text)).toContain("2 in, $15");
    // Back it / Fade it stay on the card after the market opens.
    expect(JSON.stringify(edit.payload.reply_markup)).toContain("Fade it");
    r.store.link(7, "0x00000000000000000000000000000000000000aa", "Dave", 1);
    r.state.markets = [{ ...market, question: { ...market.question, answer: 1 } }];
    r.state.bets = [
      { bettor: "0x00000000000000000000000000000000000000aa", side: 1, stake: "10000000", result: 1, market: { id: "77" } },
      { bettor: "0x00000000000000000000000000000000000000bb", side: 2, stake: "5000000", result: 2, market: { id: "77" } },
    ];
    expect(await r.watcher.settleRound()).toBe(1);
    await r.queue.tick();
    expect(r.sent[0].chatId).toBe(-100);
    expect(r.sent[0].text).toContain("It came in");
    expect(r.sent[0].text).toContain("Winners: Dave");
    expect(r.sent[0].text).not.toMatch(/0x/);
    expect(r.store.liveFixtures()).toEqual([]);
    r.queue.stop();
  });

  test("/mylink in a group sends people to a private chat; in private it issues a one-time link", async () => {
    const r = rig();
    await r.bot.handleUpdate(groupText("/mylink"));
    expect(JSON.stringify(r.calls.at(-1)!.payload.reply_markup)).toContain("t.me/TerraceBot?start=link");
    const dm = groupText("/start link", { id: 7, first_name: "Dave" }, 7);
    (dm.message.chat as { type: string }).type = "private";
    await r.bot.handleUpdate(dm);
    expect(JSON.stringify(r.calls.at(-1)!.payload.reply_markup)).toMatch(/link\/telegram\?code=[\w-]+"/);
    r.queue.stop();
  });
});

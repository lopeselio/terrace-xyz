/* Entry point: bun src/main.ts (webhook mode). Configuration comes from the environment; see .env.example. */
import { Api } from "grammy";
import { createBot } from "./bot";
import { FixtureHub } from "./fanout";
import { SendQueue } from "./ratelimit";
import { createHandler, viemVerify } from "./server";
import { Store } from "./store";
import { Terrace } from "./terrace";
import { Watcher } from "./watch";
import type { Fixture } from "./parse";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Set ${k} (see .env.example)`);
  return v;
};

const token = env("TELEGRAM_BOT_TOKEN");
const botUrl = env("BOT_PUBLIC_URL");
const terraceUrl = env("TERRACE_URL", "https://play.terrace.social");
const tz = env("BOT_TZ", "Europe/London");
const port = Number(env("PORT", "8787"));

const store = new Store(env("BOT_DB", "./bot.sqlite"));
const terrace = new Terrace(terraceUrl);
const api = new Api(token);
const queue = new SendQueue((j) => api.sendMessage(j.chatId, j.text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(j.extra ?? {}) }));
const hub = new FixtureHub({
  read: (ids) => terrace.snapshots(ids),
  fixtures: () => store.liveFixtures(),
  chats: (id) => store.chatsOfFixture(id),
  publish: (chatId, text, key) => queue.push({ chatId, text, key }),
});
const fixtures = (): Promise<Fixture[]> => terrace.cachedMatches();
const bot = createBot({ token, botUrl, terraceUrl, tz, defaultStake: Number(env("BOT_DEFAULT_STAKE", "5")) }, { store, terrace, queue });
await bot.init();
const watcher = new Watcher({ botUrl, terraceUrl, store, terrace, queue, hub, api, tz, fixtures });

const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      console.warn(`${name}: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  }, ms);
};
every(10_000, "claim", () => watcher.claimRound());
every(30_000, "live", () => hub.poll());
every(5_000, "flush", async () => hub.flush());
every(60_000, "settle", () => watcher.settleRound());

const handler = createHandler({ terraceUrl, webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET, rpcUrl: env("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz"), claim: (p) => watcher.claimOne(p) }, store, bot, viemVerify(env("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz")));
Bun.serve({ port, fetch: handler });
console.log(`Terrace bot @${bot.botInfo.username} on :${port}, webhook ${botUrl}/telegram`);

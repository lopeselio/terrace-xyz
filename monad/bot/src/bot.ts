/*
 * The Telegram side: reads takes out of group messages, answers with the rule and two link buttons,
 * and handles /markets, /table and /mylink. Webhook mode; see server.ts.
 */
import { Bot, InlineKeyboard, type Context } from "grammy";
import { isDispute, parseTake, resolveFixture, type Fixture } from "./parse";
import { disputeReply, esc, helpText, marketsCard, matchLabel, tableCard, takeCard, when, type OpenMarket } from "./format";
import { goLink, linkPage, newToken } from "./links";
import type { Store } from "./store";
import type { Terrace } from "./terrace";
import type { SendQueue } from "./ratelimit";
import { fanName } from "./names";

export type BotConfig = { token: string; botUrl: string; terraceUrl: string; tz: string; defaultStake: number; username?: string; botInfo?: Bot["botInfo"] };
export type BotDeps = { store: Store; terrace: Terrace; queue: SendQueue; now?: () => number };

const STOPPAGE: Record<string, string> = {
  match_data: "The match data is having a lie-down. Try again in a minute.",
  server: "Terrace couldn't read that one just now. Try again in a minute.",
  bad_input: "Keep the take under 200 characters and name a team.",
};

export function takeKeyboard(botUrl: string, token: string, fixtureId: number, terraceUrl: string) {
  return new InlineKeyboard().url("Back it", goLink(botUrl, token, "yes")).url("Fade it", goLink(botUrl, token, "no")).row().url("Match room", `${terraceUrl.replace(/\/+$/, "")}/m/${fixtureId}`);
}

const displayName = (u: { first_name: string; last_name?: string; username?: string }) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "A fan";

export function createBot(cfg: BotConfig, d: BotDeps) {
  const bot = new Bot(cfg.token, cfg.botInfo ? { botInfo: cfg.botInfo } : undefined);
  const now = () => Math.floor((d.now ?? Date.now)() / 1000);
  const username = () => cfg.username ?? bot.botInfo.username;
  const choices = new Map<string, { raw: string; at: number; author: { id: number; name: string } }>();

  const fixtures = (): Promise<Fixture[]> => d.terrace.cachedMatches();

  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.from && !ctx.from.is_bot) d.store.seen(ctx.chat.id, ctx.from.id);
    await next();
  });

  bot.command(["start", "help"], async (ctx) => {
    if (ctx.match === "link") return sendLink(ctx);
    await ctx.reply(helpText(username()), { parse_mode: "HTML" });
  });

  bot.command("take", async (ctx) => handleTake(ctx, ctx.message?.text ?? ""));
  bot.command("markets", async (ctx) => {
    const list = d.store.marketsOfChat(ctx.chat.id, true);
    const pending = d.store.unclaimed(now()).filter((p) => p.chatId === ctx.chat.id);
    const indexed = await d.terrace.marketsByIds(list.map((m) => m.marketId)).catch(() => []);
    const fx = await fixtures().catch(() => [] as Fixture[]);
    const name = (id: number) => {
      const f = fx.find((x) => x.id === id);
      return f ? matchLabel(f) : `Match ${id}`;
    };
    const rows: OpenMarket[] = [
      ...indexed.map((m) => ({ text: m.question.text, match: name(Number(m.question.fixture?.id ?? 0)), closeTime: Number(m.question.closeTime), backers: m.bettors, pot: (Number(m.yesPool) + Number(m.noPool)) / 1e6, open: true })),
      ...pending.map((p) => ({ text: p.text, match: name(p.fixtureId), closeTime: p.closeTime, backers: 0, pot: 0, open: false })),
    ];
    await ctx.reply(marketsCard(rows, cfg.tz), { parse_mode: "HTML" });
  });

  bot.command("table", async (ctx) => {
    const accounts = d.store.chatAccounts(ctx.chat.id);
    const players = await d.terrace.players(accounts.map((a) => a.address)).catch(() => []);
    const rows = accounts.map((a) => {
      const p = players.find((x) => x.id === a.address);
      return { name: a.name, points: Number(p?.points ?? 0), won: p?.wins ?? 0, lost: (p?.results ?? 0) - (p?.wins ?? 0) };
    });
    await ctx.reply(tableCard(rows), { parse_mode: "HTML" });
  });

  bot.command("mylink", async (ctx) => {
    if (ctx.chat.type === "private") return sendLink(ctx);
    // The one-time link goes to a private chat so nobody else in the group can tap it.
    await ctx.reply("I'll send your link in a private chat.", { reply_markup: new InlineKeyboard().url("Get my link", `https://t.me/${username()}?start=link`) });
  });

  async function sendLink(ctx: Context) {
    if (!ctx.from) return;
    const code = newToken(12);
    d.store.newLinkCode(code, ctx.from.id, displayName(ctx.from), now() + 600);
    await ctx.reply(
      "Tap to put your Terrace record on your groups' tables. It opens Terrace and asks you to confirm with your passkey or email. Nothing is shared but your name and record. The link works once, for 10 minutes.",
      { reply_markup: new InlineKeyboard().url("Link my Terrace", linkPage(cfg.terraceUrl, code)) },
    );
  }

  // "Which match?" choices when a take could be about more than one fixture.
  bot.callbackQuery(/^fx:([\w-]+):(\d+)$/, async (ctx) => {
    const [, key, id] = ctx.match;
    const c = choices.get(key);
    if (c && ctx.from?.id !== c.author.id) return void (await ctx.answerCallbackQuery({ text: `That's ${c.author.name}'s take to place.` }));
    await ctx.answerCallbackQuery();
    if (!c) return;
    choices.delete(key);
    const f = (await fixtures().catch(() => [] as Fixture[])).find((x) => x.id === Number(id));
    if (f) await publishTake(ctx, c.raw, f, c.author);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const mentioned = new RegExp(`@${username()}\\b`, "i").test(text);
    const repliedToMe = ctx.message.reply_to_message?.from?.username === username();
    if (!mentioned && !repliedToMe) return;
    if (isDispute(text) && (repliedToMe || !(await looksLikeTake(text)))) return void (await ctx.reply(disputeReply(), { reply_parameters: { message_id: ctx.message.message_id } }));
    if (mentioned) await handleTake(ctx, text);
  });

  async function looksLikeTake(text: string) {
    const parsed = parseTake(text, username());
    return !!parsed && resolveFixture(parsed.text, await fixtures().catch(() => []), now(), cfg.tz).length > 0;
  }

  async function handleTake(ctx: Context, raw: string) {
    const parsed = parseTake(raw, username());
    if (!parsed) return void (await ctx.reply(`Give me a take with a team in it, like <code>/take Saka scores Sunday, 10</code>`, { parse_mode: "HTML" }));
    let list: Fixture[];
    try {
      list = await fixtures();
    } catch {
      return void (await ctx.reply(STOPPAGE.match_data));
    }
    const found = resolveFixture(parsed.text, list, now(), cfg.tz);
    if (!found.length) return void (await ctx.reply("I can't see that match on Terrace yet. Name a team playing in the next few days."));
    if (found.length > 1) {
      const key = newToken(6);
      if (!ctx.from) return;
      choices.set(key, { raw, at: Date.now(), author: { id: ctx.from.id, name: displayName(ctx.from) } });
      for (const [k, v] of choices) if (Date.now() - v.at > 15 * 60_000) choices.delete(k);
      const kb = new InlineKeyboard();
      for (const f of found) kb.text(`${matchLabel(f)} · ${when(f.kickoff, cfg.tz)}`, `fx:${key}:${f.id}`).row();
      return void (await ctx.reply("Which match?", { reply_markup: kb }));
    }
    if (ctx.from) await publishTake(ctx, raw, found[0], { id: ctx.from.id, name: displayName(ctx.from) });
  }

  async function publishTake(ctx: Context, raw: string, f: Fixture, by: { id: number; name: string }) {
    const parsed = parseTake(raw, username())!;
    if (!ctx.chat) return;
    const c = await d.terrace.compile(parsed.text, f.id).catch(() => ({ error: "server" }));
    if ("error" in c) return void (await ctx.reply(STOPPAGE[c.error] ?? STOPPAGE.server));
    if (c.closeTime <= now()) return void (await ctx.reply("That one's already locked. Try a take on a match that hasn't kicked off."));
    const token = newToken();
    const stake = parsed.stake ?? cfg.defaultStake;
    const author = by.name;
    d.store.addPending({ token, chatId: ctx.chat.id, authorTg: by.id, authorName: author, text: parsed.text, fixtureId: f.id, stake, closeTime: c.closeTime, reading: c.reading, ruled: !!c.spec, createdAt: now() });
    const msg = await ctx.reply(takeCard({ author, text: parsed.text, reading: c.reading, fixture: f, closeTime: c.closeTime, stake, ruled: !!c.spec, tz: cfg.tz }), {
      parse_mode: "HTML",
      reply_markup: takeKeyboard(cfg.botUrl, token, f.id, cfg.terraceUrl),
      link_preview_options: { is_disabled: true },
    });
    d.store.setPendingMessage(token, msg.message_id);
  }

  bot.catch((e) => console.warn(`bot: ${e.message}`));
  return bot;
}

export { esc, fanName };

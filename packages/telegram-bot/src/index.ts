import { Bot, InlineKeyboard } from "grammy";
import { JupiterMarketsClient } from "@terrace/sdk";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY ?? "";
const APP_DEEP_LINK = process.env.TERRACE_APP_DEEP_LINK ?? "https://terrace.app";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

const bot = new Bot(BOT_TOKEN);
const jupiter = new JupiterMarketsClient(JUPITER_API_KEY);

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------

bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard()
    .url("Open Terrace", APP_DEEP_LINK)
    .row()
    .text("Browse markets", "markets");

  await ctx.reply(
    "⚽ *Terrace* — on-chain football prediction markets on Solana\\.\n\n" +
    "Back your team\\. Bet your take\\. Build your rep\\.",
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /markets — list open markets
// ---------------------------------------------------------------------------

bot.command("markets", async (ctx) => {
  try {
    const markets = await jupiter.getMarkets({ status: "open", limit: 5 });
    if (!markets.length) {
      return ctx.reply("No open markets right now. Check back soon!");
    }

    const lines = markets.map((m, i) => {
      const yesOdds = m.yesPrice != null ? `${Math.round(m.yesPrice * 100)}¢` : "—";
      const noOdds  = m.noPrice  != null ? `${Math.round(m.noPrice  * 100)}¢` : "—";
      return `${i + 1}. ${m.question}\n   YES ${yesOdds} · NO ${noOdds}`;
    });

    await ctx.reply(
      "📋 *Open markets*\n\n" + lines.join("\n\n"),
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Couldn't fetch markets. Try again shortly.");
  }
});

bot.callbackQuery("markets", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation?.enter?.("markets");
  bot.command("markets")(ctx as any);
});

// ---------------------------------------------------------------------------
// /odds <market_id> — show YES/NO odds for a market
// ---------------------------------------------------------------------------

bot.command("odds", async (ctx) => {
  const marketId = ctx.match?.trim();
  if (!marketId) {
    return ctx.reply("Usage: /odds <market_id>");
  }

  try {
    const market = await jupiter.getMarket(marketId);
    const yes = market.yesPrice != null ? `${Math.round(market.yesPrice * 100)}¢` : "N/A";
    const no  = market.noPrice  != null ? `${Math.round(market.noPrice  * 100)}¢` : "N/A";
    const vol = market.volume   != null ? `$${(parseFloat(market.volume) / 1e6).toFixed(0)} USDC` : "N/A";

    const kb = new InlineKeyboard().url("Bet in app", `${APP_DEEP_LINK}/market/${marketId}`);

    await ctx.reply(
      `📊 *${market.question}*\n\nYES ${yes} · NO ${no}\nVolume: ${vol}`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  } catch {
    await ctx.reply("Market not found. Check the ID and try again.");
  }
});

// ---------------------------------------------------------------------------
// /leaderboard — top 10 Sharps (weekly)
// ---------------------------------------------------------------------------

bot.command("leaderboard", async (ctx) => {
  try {
    const entries = await jupiter.getLeaderboard("weekly");
    const top = entries.slice(0, 10);
    const lines = top.map((e) => {
      const wr = e.winRate != null ? `${(e.winRate * 100).toFixed(0)}%` : "—";
      const pnl = e.pnlUsd != null ? `$${parseFloat(e.pnlUsd).toFixed(0)}` : "—";
      const badge = (e.winRate ?? 0) >= 0.65 ? "👑" : (e.winRate ?? 0) >= 0.55 ? "⚡" : "🎯";
      return `${e.rank}. ${badge} \`${e.ownerPubkey.slice(0, 8)}…\` — WR ${wr} · PnL ${pnl}`;
    });

    await ctx.reply(
      "🏆 *Weekly Sharps Leaderboard*\n\n" + lines.join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Couldn't fetch leaderboard. Try again shortly.");
  }
});

// ---------------------------------------------------------------------------
// /sharp <pubkey> — show wallet reputation
// ---------------------------------------------------------------------------

bot.command("sharp", async (ctx) => {
  const pubkey = ctx.match?.trim();
  if (!pubkey) {
    return ctx.reply("Usage: /sharp <wallet_pubkey>");
  }

  try {
    const profile = await jupiter.getProfile(pubkey);
    const wr = profile.winRate != null ? `${(profile.winRate * 100).toFixed(1)}%` : "N/A";
    const bets = profile.totalBets ?? "N/A";
    const badge = (profile.winRate ?? 0) >= 0.65 ? "👑 Legend" : (profile.winRate ?? 0) >= 0.55 ? "⚡ Sharp" : "🎯 Casual";

    await ctx.reply(
      `*${pubkey.slice(0, 8)}…${pubkey.slice(-4)}*\n\n` +
      `Badge: ${badge}\nWin rate: ${wr}\nTotal bets: ${bets}`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Wallet not found or no bet history.");
  }
});

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

bot.command("help", (ctx) =>
  ctx.reply(
    "Terrace Bot commands:\n\n" +
    "/markets — browse open prediction markets\n" +
    "/odds <id> — YES/NO odds for a market\n" +
    "/leaderboard — weekly top Sharps\n" +
    "/sharp <pubkey> — lookup a wallet's reputation\n" +
    "/start — welcome & app link"
  )
);

bot.start({ onStart: () => console.log("Terrace Telegram bot started") });

import { Bot, InlineKeyboard } from "grammy";
// @ts-ignore — workspace package resolved at runtime via tsx/node
import { JupiterMarketsClient, getReputationPda, deserializeReputationAccount } from "@terrace/sdk";
// @ts-ignore
import type { JupiterEventMarket, Reputation } from "@terrace/sdk";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY ?? "";
const APP_DEEP_LINK = process.env.TERRACE_APP_DEEP_LINK ?? "https://terrace.app";
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL ?? "";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

const bot = new Bot(BOT_TOKEN);
const jupiter = new JupiterMarketsClient(JUPITER_API_KEY);

// ---------------------------------------------------------------------------
// On-chain reputation fetch via Helius RPC
// ---------------------------------------------------------------------------
async function fetchOnChainReputation(pubkey: string) {
  if (!HELIUS_RPC_URL) return null;
  try {
    const [repAddress] = await getReputationPda(pubkey);
    const res = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getAccountInfo",
        params: [repAddress, { encoding: "base64" }],
      }),
    });
    const json = await res.json() as Record<string, any>;
    const value = json.result?.value;
    if (!value) return null;
    const raw = Uint8Array.from(Buffer.from(value.data[0], "base64"));
    return deserializeReputationAccount(raw, repAddress) as Reputation;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------

bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard()
    .url("Open Terrace", APP_DEEP_LINK)
    .row()
    .text("Browse markets", "markets");

  await ctx.reply(
    "⚽ *Terrace* — on\\-chain football prediction markets on Solana\\.\n\n" +
    "Back your team\\. Bet your take\\. Build your rep\\.",
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// Shared markets fetch helper
// ---------------------------------------------------------------------------
async function replyWithMarkets(reply: (text: string, opts?: any) => Promise<any>) {
  try {
    const events = await jupiter.getSportsEvents();
    const markets: JupiterEventMarket[] = events
      .flatMap((e: any) => (e.markets ?? []) as JupiterEventMarket[])
      .filter((m: JupiterEventMarket) => m.status === "active")
      .slice(0, 5);

    if (!markets.length) {
      return reply("No open markets right now. Check back soon!");
    }

    const lines = markets.map((m, i) => {
      const yes = `${Math.round(parseFloat(m.pricing.buyYesPriceUsd) * 100)}¢`;
      const no  = `${Math.round(parseFloat(m.pricing.buyNoPriceUsd)  * 100)}¢`;
      return `${i + 1}. ${m.metadata.title}\n   YES ${yes} · NO ${no}`;
    });

    await reply("📋 *Open markets*\n\n" + lines.join("\n\n"), { parse_mode: "Markdown" });
  } catch {
    await reply("Couldn't fetch markets. Try again shortly.");
  }
}

// ---------------------------------------------------------------------------
// /markets — list open markets
// ---------------------------------------------------------------------------

bot.command("markets", (ctx) => replyWithMarkets(ctx.reply.bind(ctx)));

bot.callbackQuery("markets", async (ctx) => {
  await ctx.answerCallbackQuery();
  await replyWithMarkets(ctx.reply.bind(ctx));
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
    const yes = `${Math.round(parseFloat(market.pricing.buyYesPriceUsd) * 100)}¢`;
    const no  = `${Math.round(parseFloat(market.pricing.buyNoPriceUsd)  * 100)}¢`;
    const vol = market.totalVolume
      ? `$${(parseFloat(market.totalVolume) / 1e6).toFixed(0)} USDC`
      : "N/A";

    const kb = new InlineKeyboard().url("Bet in app", `${APP_DEEP_LINK}/market/${marketId}`);

    await ctx.reply(
      `📊 *${market.metadata.title}*\n\nYES ${yes} · NO ${no}\nVolume: ${vol}`,
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
    const lines = top.map((e: any) => {
      const wr  = e.winRate != null ? `${(e.winRate * 100).toFixed(0)}%` : "—";
      const pnl = e.pnlUsd  != null ? `$${parseFloat(e.pnlUsd).toFixed(0)}` : "—";
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
// /sharp <pubkey> — wallet reputation (on-chain first, Jupiter fallback)
// ---------------------------------------------------------------------------

bot.command("sharp", async (ctx) => {
  const pubkey = ctx.match?.trim();
  if (!pubkey) return ctx.reply("Usage: /sharp <wallet_pubkey>");

  // On-chain Reputation PDA via Helius
  try {
    const rep = await fetchOnChainReputation(pubkey);
    if (rep) {
      const wr  = `${(rep.winRateBps / 100).toFixed(1)}%`;
      const badge = rep.badgeTier === "Legend" ? "👑 Legend"
        : rep.badgeTier === "Sharp" ? "⚡ Sharp" : "🎯 Casual";
      const streak = rep.currentStreak > 0 ? `🔥 ${rep.currentStreak}W`
        : rep.currentStreak < 0 ? `❄️ ${Math.abs(rep.currentStreak)}L` : "—";

      await ctx.reply(
        `*${pubkey.slice(0, 8)}…${pubkey.slice(-4)}* [on-chain]\n\n` +
        `Badge: ${badge}\nWin rate: ${wr}\nTotal bets: ${rep.totalBets}\n` +
        `Wins: ${rep.winningBets}\nStreak: ${streak}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
  } catch {}

  // Jupiter fallback
  try {
    const profile = await jupiter.getUserProfile(pubkey);
    const wr  = profile.winRate != null ? `${(profile.winRate * 100).toFixed(1)}%` : "N/A";
    const bets = profile.totalTrades ?? "N/A";
    const badge = (profile.winRate ?? 0) >= 0.65 ? "👑 Legend"
      : (profile.winRate ?? 0) >= 0.55 ? "⚡ Sharp" : "🎯 Casual";

    await ctx.reply(
      `*${pubkey.slice(0, 8)}…${pubkey.slice(-4)}*\n\n` +
      `Badge: ${badge}\nWin rate: ${wr}\nTotal trades: ${bets}`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Wallet not found or no bet history.");
  }
});

// ---------------------------------------------------------------------------
// /parlay — explain parlays + link to app builder
// ---------------------------------------------------------------------------

bot.command("parlay", async (ctx) => {
  const kb = new InlineKeyboard().url("Build a parlay", APP_DEEP_LINK);

  await ctx.reply(
    "🃏 *Parlays on Terrace*\n\n" +
    "Chain 2–8 markets into a single bet. Every leg must win for the parlay to pay out.\n\n" +
    "• *Multiplier* = 1 / (YES or NO price) per leg\n" +
    "• *Max legs:* 8\n" +
    "• *Settlement:* all legs must be settled on-chain before you can claim\n\n" +
    "Open the app to pick markets and submit your parlay on Solana.",
    { parse_mode: "Markdown", reply_markup: kb }
  );
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
    "/sharp <pubkey> — lookup a wallet's on-chain reputation\n" +
    "/parlay — learn about parlays & open the builder\n" +
    "/start — welcome & app link"
  )
);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  console.log(`Received ${signal} — stopping bot…`);
  await bot.stop();
  process.exit(0);
}

process.once("SIGINT",  () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

bot.start({ onStart: () => console.log("Terrace Telegram bot started") });

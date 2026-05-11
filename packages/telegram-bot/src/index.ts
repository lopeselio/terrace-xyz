import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
// @ts-ignore — workspace package resolved at runtime via tsx/node
import {
  JupiterMarketsClient,
  getReputationPda,
  getMarketPda,
  deserializeReputationAccount,
  buildCreateMarketInstruction,
  TERRACE_PROGRAM_ID,
  USDC_DEVNET_MINT,
} from "@terrace/sdk";
// @ts-ignore
import type { JupiterEventMarket, Reputation, Address } from "@terrace/sdk";
import { Buffer } from "buffer";

const BOT_TOKEN          = process.env.TELEGRAM_BOT_TOKEN;
const JUPITER_API_KEY    = process.env.JUPITER_API_KEY ?? "";
const WORKER_BASE_URL    = process.env.TERRACE_APP_DEEP_LINK ?? "https://terrace-notifications.terrace-xyz.workers.dev";
const HELIUS_RPC_URL     = process.env.HELIUS_RPC_URL ?? "";
const ADMIN_KEYPAIR_B64  = process.env.SOLANA_ADMIN_KEYPAIR_B64 ?? "";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

const bot     = new Bot(BOT_TOKEN);
const jupiter = new JupiterMarketsClient(JUPITER_API_KEY);

// ---------------------------------------------------------------------------
// In-memory sentiment votes for flash markets
// key: marketAddress  value: { yes, no, voters: Set<userId> }
// ---------------------------------------------------------------------------
const marketVotes = new Map<string, { yes: number; no: number; voters: Set<string> }>();

// ---------------------------------------------------------------------------
// Admin keypair
// ---------------------------------------------------------------------------
function loadAdminKeypair(): Keypair | null {
  if (!ADMIN_KEYPAIR_B64) return null;
  try {
    const bytes = JSON.parse(Buffer.from(ADMIN_KEYPAIR_B64, "base64").toString("utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------
async function rpcPost(body: object): Promise<any> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchOnChainReputation(pubkey: string) {
  if (!HELIUS_RPC_URL) return null;
  try {
    const [repAddress] = await getReputationPda(pubkey as Address);
    const res = await rpcPost({ jsonrpc: "2.0", id: 1, method: "getAccountInfo",
      params: [repAddress, { encoding: "base64" }] });
    const value = res.result?.value;
    if (!value) return null;
    const raw = Uint8Array.from(Buffer.from(value.data[0], "base64"));
    return deserializeReputationAccount(raw, repAddress) as Reputation;
  } catch { return null; }
}

function toWeb3Ix(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a: any) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortAddr(addr: string) { return `${addr.slice(0, 5)}…${addr.slice(-4)}`; }

function voteBar(yes: number, no: number): string {
  const total = yes + no;
  if (total === 0) return "";
  const yesPct = Math.round((yes / total) * 100);
  const noPct  = 100 - yesPct;
  const filledY = Math.round(yes / total * 8);
  const filledN = Math.round(no  / total * 8);
  return (
    `\n✅ YES ${"█".repeat(filledY)}${"░".repeat(8 - filledY)} ${yesPct}% (${yes})\n` +
    `❌ NO  ${"█".repeat(filledN)}${"░".repeat(8 - filledN)} ${noPct}% (${no})`
  );
}

function flashMarketText(question: string, durationMin: number, expiryStr: string, marketAddr: string, votes?: { yes: number; no: number }) {
  const bar = votes ? voteBar(votes.yes, votes.no) : "";
  return (
    `⚡ *Flash Market — Live Now!*\n\n` +
    `*${question}*\n\n` +
    `⏱ Closes at ${expiryStr} \\(${durationMin} min\\)\n` +
    `📍 \`${marketAddr.slice(0, 8)}…\`` +
    (bar ? `\n\n*Community read:*${bar}` : "")
  );
}

function flashMarketKeyboard(marketAddr: string) {
  return new InlineKeyboard()
    .text("✅ YES", `vote:yes:${marketAddr}`)
    .text("❌ NO",  `vote:no:${marketAddr}`)
    .row()
    .url("📱 Bet in app", `${WORKER_BASE_URL}/m/${marketAddr}`)
    .url("🔍 Tx explorer", `https://explorer.solana.com/address/${marketAddr}?cluster=devnet`);
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard()
    .url("📱 Open Terrace", WORKER_BASE_URL)
    .row()
    .text("Browse markets", "markets");

  await ctx.reply(
    "⚽ *Terrace* — on\\-chain football prediction markets on Solana\\.\n\n" +
    "Back your team\\. Bet your take\\. Build your rep\\.\n\n" +
    "Commands:\n" +
    "/flash — create an in\\-match market ⚡\n" +
    "/live — active flash markets 🔴\n" +
    "/markets — browse open markets 📋\n" +
    "/challenge — send a 1v1 challenge 🥊\n" +
    "/leaderboard — weekly Sharps 🏆\n" +
    "/sharp \\<pubkey\\> — wallet reputation\n" +
    "/wallet — link your Solana wallet",
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /live — active flash markets (closes in < 2h), sorted soonest-first
// ---------------------------------------------------------------------------
bot.command("live", async (ctx) => {
  try {
    const events = await jupiter.getSportsEvents();
    const now    = Date.now();
    const markets: JupiterEventMarket[] = events
      .flatMap((e: any) => (e.markets ?? []) as JupiterEventMarket[])
      .filter((m: JupiterEventMarket) => {
        if (m.status !== "open") return false;
        const expMs = (m.closeTime ?? 0) * 1000;
        return expMs > now && expMs - now < 2 * 3_600_000;
      })
      .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))
      .slice(0, 6);

    if (!markets.length) {
      const kb = new InlineKeyboard().text("⚡ Create one", "create_flash");
      return ctx.reply(
        "🔴 No flash markets live right now.\n\nUse /flash to create an in-match market!",
        { reply_markup: kb }
      );
    }

    const lines = markets.map((m, i) => {
      const expMs   = (m.closeTime ?? 0) * 1000;
      const minLeft = Math.ceil((expMs - now) / 60_000);
      const yes     = Math.round(m.pricing.buyYesPriceUsd * 100);
      const no      = Math.round(m.pricing.buyNoPriceUsd  * 100);
      const urgency = minLeft <= 5 ? "🔥" : minLeft <= 15 ? "⚡" : "⏱";
      return `${i + 1}. ${urgency} *${m.title}*\n   ${minLeft}m left · YES ${yes}¢ · NO ${no}¢`;
    });

    const kb = new InlineKeyboard().url("📱 Bet in app", WORKER_BASE_URL);

    await ctx.reply(
      "🔴 *Flash Markets — Live Now*\n\n" + lines.join("\n\n") +
      "\n\nTap a market in the app to place your bet before time runs out.",
      { parse_mode: "Markdown", reply_markup: kb }
    );
  } catch {
    await ctx.reply("Couldn't fetch live markets. Try again shortly.");
  }
});

bot.callbackQuery("create_flash", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Use: /flash <question> [duration_min]\n\nExample:\n/flash Will Arsenal score in the next 15 min? 15");
});

// ---------------------------------------------------------------------------
// /markets — list open markets
// ---------------------------------------------------------------------------
async function replyWithMarkets(reply: (text: string, opts?: any) => Promise<any>) {
  try {
    const events = await jupiter.getSportsEvents();
    const markets: JupiterEventMarket[] = events
      .flatMap((e: any) => (e.markets ?? []) as JupiterEventMarket[])
      .filter((m: JupiterEventMarket) => m.status === "open")
      .slice(0, 5);

    if (!markets.length) return reply("No open markets right now. Check back soon!");

    const lines = markets.map((m, i) => {
      const yes = `${Math.round(m.pricing.buyYesPriceUsd * 100)}¢`;
      const no  = `${Math.round(m.pricing.buyNoPriceUsd  * 100)}¢`;
      return `${i + 1}. *${m.title}*\n   YES ${yes} · NO ${no}`;
    });

    const kb = new InlineKeyboard().url("📱 Bet in app", WORKER_BASE_URL);
    await reply("📋 *Open Markets*\n\n" + lines.join("\n\n"), { parse_mode: "Markdown", reply_markup: kb });
  } catch {
    await reply("Couldn't fetch markets. Try again shortly.");
  }
}

bot.command("markets", (ctx) => replyWithMarkets(ctx.reply.bind(ctx)));
bot.callbackQuery("markets", async (ctx) => {
  await ctx.answerCallbackQuery();
  await replyWithMarkets(ctx.reply.bind(ctx));
});

// ---------------------------------------------------------------------------
// /odds <market_id>
// ---------------------------------------------------------------------------
bot.command("odds", async (ctx) => {
  const marketId = ctx.match?.trim();
  if (!marketId) return ctx.reply("Usage: /odds <market_id>");
  try {
    const market = await jupiter.getMarket(marketId);
    const yes = `${Math.round(market.pricing.buyYesPriceUsd * 100)}¢`;
    const no  = `${Math.round(market.pricing.buyNoPriceUsd  * 100)}¢`;
    const vol = market.pricing.volume ? `$${(market.pricing.volume / 1e6).toFixed(0)} USDC` : "N/A";
    const kb = new InlineKeyboard().url("Bet in app", `${WORKER_BASE_URL}/m/${marketId}`);
    await ctx.reply(
      `📊 *${market.title}*\n\nYES ${yes} · NO ${no}\nVolume: ${vol}`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  } catch {
    await ctx.reply("Market not found. Check the ID and try again.");
  }
});

// ---------------------------------------------------------------------------
// /challenge — generate a 1v1 matchup invitation
// ---------------------------------------------------------------------------
bot.command("challenge", async (ctx) => {
  const from     = ctx.from;
  const username = from?.username ? `@${from.username}` : shortAddr(from?.id?.toString() ?? "anon");
  const link     = WORKER_BASE_URL; // opens app → Matchups screen

  const kb = new InlineKeyboard()
    .url("⚔️ Accept on Terrace", link);

  await ctx.reply(
    `⚔️ *${username} wants a 1v1 matchup!*\n\n` +
    `Pick a market, stake your USDC, and put your read on the line.\n\n` +
    `Open Terrace, go to *Matchups → Create*, and challenge back!`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /wallet — wallet linking instructions
// ---------------------------------------------------------------------------
bot.command("wallet", async (ctx) => {
  const kb = new InlineKeyboard().url("📱 Open Terrace", WORKER_BASE_URL);
  await ctx.reply(
    "🔗 *Link your Solana wallet*\n\n" +
    "Open the Terrace app and connect your wallet (Phantom, Solflare, or email login).\n\n" +
    "Once connected, your on-chain reputation and bet history will be visible here via /sharp <your_pubkey>.\n\n" +
    "Telegram wallet linking (sign with your key → link Telegram ID) is coming soon!",
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /leaderboard
// ---------------------------------------------------------------------------
bot.command("leaderboard", async (ctx) => {
  try {
    const entries = await jupiter.getLeaderboard("weekly");
    const top     = entries.slice(0, 10);
    const lines   = top.map((e: any) => {
      const wr    = e.winRate != null ? `${(e.winRate * 100).toFixed(0)}%` : "—";
      const pnl   = e.pnlUsd  != null ? `$${parseFloat(e.pnlUsd).toFixed(0)}` : "—";
      const badge = (e.winRate ?? 0) >= 0.65 ? "👑" : (e.winRate ?? 0) >= 0.55 ? "⚡" : "🎯";
      return `${e.rank}. ${badge} \`${e.ownerPubkey.slice(0, 8)}…\` — ${wr} WR · ${pnl} PnL`;
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
// /sharp <pubkey>
// ---------------------------------------------------------------------------
bot.command("sharp", async (ctx) => {
  const pubkey = ctx.match?.trim();
  if (!pubkey) return ctx.reply("Usage: /sharp <wallet_pubkey>");

  try {
    const rep = await fetchOnChainReputation(pubkey);
    if (rep) {
      const wr     = `${(rep.winRateBps / 100).toFixed(1)}%`;
      const badge  = rep.badgeTier === "Legend" ? "👑 Legend" : rep.badgeTier === "Sharp" ? "⚡ Sharp" : "🎯 Casual";
      const streak = rep.currentStreak > 0 ? `🔥 ${rep.currentStreak}W` : rep.currentStreak < 0 ? `❄️ ${Math.abs(rep.currentStreak)}L` : "—";
      await ctx.reply(
        `*${pubkey.slice(0, 8)}…${pubkey.slice(-4)}* [on\\-chain]\n\n` +
        `Badge: ${badge}\nWin rate: ${wr}\nBets: ${rep.totalBets} · Wins: ${rep.winningBets}\nStreak: ${streak}`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }
  } catch {}

  try {
    const profile = await jupiter.getUserProfile(pubkey);
    const wr    = profile.winRate != null ? `${(profile.winRate * 100).toFixed(1)}%` : "N/A";
    const badge = (profile.winRate ?? 0) >= 0.65 ? "👑 Legend" : (profile.winRate ?? 0) >= 0.55 ? "⚡ Sharp" : "🎯 Casual";
    await ctx.reply(
      `*${pubkey.slice(0, 8)}…${pubkey.slice(-4)}*\n\nBadge: ${badge}\nWin rate: ${wr}\nTotal trades: ${profile.totalTrades ?? "N/A"}`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Wallet not found or no bet history.");
  }
});

// ---------------------------------------------------------------------------
// /parlay
// ---------------------------------------------------------------------------
bot.command("parlay", async (ctx) => {
  const kb = new InlineKeyboard().url("Build a parlay", WORKER_BASE_URL);
  await ctx.reply(
    "🃏 *Parlays on Terrace*\n\n" +
    "Chain 2–8 markets into a single bet\\. Every leg must win for the parlay to pay out\\.\n\n" +
    "• *Multiplier* = 1 / \\(YES or NO price\\) per leg\n" +
    "• *Max legs:* 8\n" +
    "• *Settlement:* all legs must be settled on\\-chain before claiming\n\n" +
    "Open the app to build your parlay on Solana\\.",
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /flash <question> [duration_min] — create a flash market on-chain
// ---------------------------------------------------------------------------
bot.command("flash", async (ctx) => {
  const input = ctx.match?.trim() ?? "";
  if (!input) {
    return ctx.reply(
      "Usage: /flash <question> [duration_min]\n\n" +
      "Examples:\n" +
      "  /flash Will Arsenal score in the next 15 min?\n" +
      "  /flash Next goal Chelsea? 30"
    );
  }

  const keypair = loadAdminKeypair();
  if (!keypair) return ctx.reply("Flash markets unavailable — admin keypair not configured.");
  if (!HELIUS_RPC_URL) return ctx.reply("Flash markets unavailable — RPC not configured.");

  const parts     = input.split(/\s+/);
  const lastToken = parts[parts.length - 1];
  let durationMin = 30;
  let question    = input;
  if (/^\d+$/.test(lastToken)) {
    durationMin = Math.min(Math.max(parseInt(lastToken, 10), 5), 90);
    question    = parts.slice(0, -1).join(" ");
  }
  if (!question.trim()) return ctx.reply("Please provide a question, e.g. /flash Next goal? 15");

  const creating = await ctx.reply(`⚡ Creating flash market (${durationMin} min)…`);

  try {
    const creator   = keypair.publicKey.toBase58() as Address;
    const nonce     = BigInt(Date.now());
    const expiryTs  = BigInt(Math.floor(Date.now() / 1000) + durationMin * 60);
    const [marketAddress] = await getMarketPda(creator, nonce, TERRACE_PROGRAM_ID);
    const marketAddr = marketAddress as string;

    const ix = await buildCreateMarketInstruction({
      question: question.trim(), expiry: expiryTs, creatorFeeBps: 0,
      nonce, oracle: null, isPrivate: false, isFlash: true,
      usdcMint: USDC_DEVNET_MINT, marketAddress, creator, programId: TERRACE_PROGRAM_ID,
    });

    const bh = await rpcPost({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }] });
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.result.value.blockhash,
      instructions: [toWeb3Ix(ix)],
    }).compileToV0Message();
    const vt = new VersionedTransaction(message);
    vt.sign([keypair]);

    const sendResult = await rpcPost({ jsonrpc: "2.0", id: 2, method: "sendTransaction",
      params: [Buffer.from(vt.serialize()).toString("base64"), { encoding: "base64", preflightCommitment: "confirmed" }] });

    if (sendResult.error) throw new Error(sendResult.error.message ?? "sendTransaction failed");

    const expiryStr = new Date(Number(expiryTs) * 1000)
      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    // Initialise vote entry
    marketVotes.set(marketAddr, { yes: 0, no: 0, voters: new Set() });

    // Delete the "creating…" message then post the market card
    try { await bot.api.deleteMessage(creating.chat.id, creating.message_id); } catch {}

    await ctx.reply(
      flashMarketText(question.trim(), durationMin, expiryStr, marketAddr),
      {
        parse_mode: "MarkdownV2",
        reply_markup: flashMarketKeyboard(marketAddr),
      }
    );
  } catch (e: any) {
    await ctx.reply(`❌ Failed to create market: ${(e?.message ?? String(e)).slice(0, 200)}`);
  }
});

// ---------------------------------------------------------------------------
// YES / NO sentiment votes on flash markets
// ---------------------------------------------------------------------------
bot.callbackQuery(/^vote:(yes|no):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Vote recorded!" });

  const match = ctx.callbackQuery.data.match(/^vote:(yes|no):(.+)$/);
  if (!match) return;
  const [, side, addr] = match;
  const userId = String(ctx.callbackQuery.from.id);

  let votes = marketVotes.get(addr) ?? { yes: 0, no: 0, voters: new Set<string>() };
  if (votes.voters.has(userId)) {
    await ctx.answerCallbackQuery({ text: "You already voted on this market." });
    return;
  }
  if (side === "yes") votes.yes++;
  else votes.no++;
  votes.voters.add(userId);
  marketVotes.set(addr, votes);

  // Try to update the message — safe to ignore if it's unchanged or too old
  try {
    const msg     = ctx.callbackQuery.message;
    const lines   = msg?.text?.split("\n") ?? [];
    const question = lines[2] ?? "Market"; // line index after header
    const expLine  = lines.find((l) => l.startsWith("⏱")) ?? "";
    const durationMatch = expLine.match(/\((\d+) min\)/);
    const durationMin   = durationMatch ? parseInt(durationMatch[1]) : 30;
    const expiryStr     = expLine.match(/Closes at (.+) \(/)
      ? expLine.match(/Closes at (.+) \(/)![1] : "";

    await ctx.editMessageText(
      flashMarketText(question, durationMin, expiryStr, addr, votes),
      { parse_mode: "MarkdownV2", reply_markup: flashMarketKeyboard(addr) }
    );
  } catch {}
});

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------
bot.command("help", (ctx) =>
  ctx.reply(
    "⚽ *Terrace Bot Commands*\n\n" +
    "📋 /markets — browse open markets\n" +
    "🔴 /live — active flash markets with countdowns\n" +
    "⚡ /flash <question> [min] — create a flash market (5–90 min)\n" +
    "⚔️ /challenge — send a 1v1 matchup invitation\n" +
    "🔗 /wallet — how to link your Solana wallet\n" +
    "📊 /odds <id> — YES/NO odds for a market\n" +
    "🏆 /leaderboard — weekly top Sharps\n" +
    "🎯 /sharp <pubkey> — lookup wallet reputation\n" +
    "🃏 /parlay — learn about parlays\n" +
    "/start — welcome & app link",
    { parse_mode: "Markdown" }
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

bot.start({ onStart: (info) => console.log(`Terrace bot @${info.username} started`) });

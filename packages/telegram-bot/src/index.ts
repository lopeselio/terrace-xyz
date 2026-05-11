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
const WORKER_SECRET      = process.env.WORKER_SECRET ?? "terrace-link-dev-2026";
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY ?? process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

const bot     = new Bot(BOT_TOKEN);
const jupiter = new JupiterMarketsClient(JUPITER_API_KEY);

// ---------------------------------------------------------------------------
// In-memory sentiment votes for flash markets
// key: marketAddress  value: { yes, no, voters: Set<userId> }
// ---------------------------------------------------------------------------
const marketVotes = new Map<string, { yes: number; no: number; voters: Set<string> }>();

// ---------------------------------------------------------------------------
// Worker KV helpers — bot talks to the worker's internal API
// ---------------------------------------------------------------------------

const workerHeaders = () => ({
  "Content-Type": "application/json",
  "X-Worker-Secret": WORKER_SECRET,
});

async function createLinkToken(tgUserId: string, tgUsername: string): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/link-token`, {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({ tgUserId, tgUsername }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    return data.token ?? null;
  } catch { return null; }
}

async function getWalletByTgId(tgUserId: string): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/wallet/tg/${tgUserId}`, {
      headers: workerHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { pubkey?: string };
    return data.pubkey ?? null;
  } catch { return null; }
}

async function getTgByPubkey(pubkey: string): Promise<{ tgUserId: string; username: string } | null> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/wallet/pubkey/${pubkey}`, {
      headers: workerHeaders(),
    });
    if (!res.ok) return null;
    return await res.json() as { tgUserId: string; username: string };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Gemini — conversational reputation narrative
// ---------------------------------------------------------------------------

async function reputationNarrative(stats: {
  pubkey: string;
  winRate: number;
  totalBets: number;
  wins: number;
  streak: number;
  badge: string;
}): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const streakDesc = stats.streak > 0
    ? `${stats.streak} wins in a row 🔥`
    : stats.streak < 0
    ? `${Math.abs(stats.streak)} losses in a row ❄️`
    : "no active streak";
  const prompt =
    `You are a cheeky football betting community bot for Terrace (on-chain prediction markets on Solana). ` +
    `Write a punchy 2–3 sentence Telegram message about this bettor. Use football/betting slang, plain text only (no markdown asterisks). Keep it under 80 words.\n\n` +
    `Wallet: ${stats.pubkey.slice(0, 8)}…\n` +
    `Win rate: ${(stats.winRate * 100).toFixed(1)}%\n` +
    `Total bets: ${stats.totalBets}  |  Wins: ${stats.wins}\n` +
    `Current streak: ${streakDesc}\n` +
    `Badge: ${stats.badge}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
        }),
      }
    );
    const data = await res.json() as any;
    return (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined)?.trim() ?? null;
  } catch { return null; }
}

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
    "/link — connect your Solana wallet 🔗\n" +
    "/me — your reputation & stats 🎯\n" +
    "/flash — create an in\\-match market ⚡\n" +
    "/live — active flash markets 🔴\n" +
    "/markets — browse open markets 📋\n" +
    "/challenge — send a 1v1 challenge 🥊\n" +
    "/leaderboard — weekly Sharps 🏆\n" +
    "/sharp \\<pubkey\\> — look up any wallet",
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
// /challenge [@username] — generate a 1v1 matchup invitation
// ---------------------------------------------------------------------------
bot.command("challenge", async (ctx) => {
  const from        = ctx.from;
  const challUserId = String(from?.id ?? "");
  const challenger  = from?.username ? `@${from.username}` : `Fan ${shortAddr(challUserId)}`;
  const target      = ctx.match?.trim();

  // Look up challenger's linked wallet
  const challPubkey = await getWalletByTgId(challUserId);
  const walletLine  = challPubkey
    ? `\n💳 Wallet: \`${challPubkey.slice(0, 8)}…${challPubkey.slice(-4)}\``
    : "\n_(Link your wallet with /link to enable on-chain challenges)_";

  const targetLine = target
    ? `Hey ${target.startsWith("@") ? target : `@${target}`} — you've been called out! 👀\n\n`
    : "";

  const kb = new InlineKeyboard().url("⚔️ Open Matchups", WORKER_BASE_URL);

  await ctx.reply(
    `⚔️ *${challenger} wants a 1v1 matchup!*\n\n` +
    targetLine +
    `Pick a market, stake your USDC, and put your read on the line.` +
    walletLine +
    `\n\nOpen Terrace → *Matchups → Create* to issue or accept.`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

// ---------------------------------------------------------------------------
// /wallet — alias for /link
// ---------------------------------------------------------------------------
bot.command("wallet", async (ctx) => ctx.reply("/wallet is now /link — use that to connect your Solana wallet 🔗"));

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
// Shared reputation reply — used by /sharp and /me
// ---------------------------------------------------------------------------

async function replyWithReputation(
  reply: (text: string, opts?: any) => Promise<any>,
  pubkey: string,
  displayName?: string
) {
  const label = displayName ?? `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;

  try {
    const rep = await fetchOnChainReputation(pubkey);
    if (rep) {
      const wr     = rep.winRateBps / 10000;
      const badge  = rep.badgeTier === "Legend" ? "👑 Legend" : rep.badgeTier === "Sharp" ? "⚡ Sharp" : "🎯 Casual";
      const streak = rep.currentStreak;

      const narrative = await reputationNarrative({
        pubkey, winRate: wr, totalBets: rep.totalBets,
        wins: rep.winningBets, streak, badge,
      });

      const statsBlock =
        `*${label}* — ${badge}\n\n` +
        `Win rate: ${(wr * 100).toFixed(1)}%  ·  ${rep.totalBets} bets  ·  ${rep.winningBets} wins\n` +
        `Streak: ${streak > 0 ? `🔥 ${streak}W` : streak < 0 ? `❄️ ${Math.abs(streak)}L` : "—"}`;

      await reply(
        narrative ? `${narrative}\n\n${statsBlock}` : statsBlock,
        { parse_mode: "Markdown" }
      );
      return;
    }
  } catch {}

  try {
    const profile = await jupiter.getUserProfile(pubkey);
    const wr    = profile.winRate ?? 0;
    const badge = wr >= 0.65 ? "👑 Legend" : wr >= 0.55 ? "⚡ Sharp" : "🎯 Casual";
    const narrative = await reputationNarrative({
      pubkey, winRate: wr, totalBets: profile.totalTrades ?? 0,
      wins: Math.round((profile.totalTrades ?? 0) * wr), streak: 0, badge,
    });
    const statsBlock =
      `*${label}* — ${badge}\n\n` +
      `Win rate: ${(wr * 100).toFixed(1)}%  ·  ${profile.totalTrades ?? "N/A"} trades`;

    await reply(
      narrative ? `${narrative}\n\n${statsBlock}` : statsBlock,
      { parse_mode: "Markdown" }
    );
  } catch {
    await reply("Wallet not found or no bet history yet.");
  }
}

// ---------------------------------------------------------------------------
// /sharp <pubkey|@username>
// ---------------------------------------------------------------------------
bot.command("sharp", async (ctx) => {
  const input = ctx.match?.trim();
  if (!input) return ctx.reply("Usage: /sharp <wallet_pubkey> or /sharp @username");

  let pubkey  = input;
  let displayName: string | undefined;

  // Resolve @username → pubkey via worker KV if the user is linked
  if (input.startsWith("@")) {
    const username = input.slice(1).toLowerCase();
    // We can't do username→userId lookup from the bot side without seeing a message from them,
    // so look up by iterating — instead, ask the user to use their pubkey or /me
    await ctx.reply(
      `Looking up @${username}…\n\nIf they haven't linked their wallet yet, ask them to run /link in the bot first.`
    );
    return;
  }

  displayName = `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;

  // Check if there's a linked Telegram account
  const tgInfo = await getTgByPubkey(pubkey);
  if (tgInfo?.username) displayName = `@${tgInfo.username}`;

  await replyWithReputation(ctx.reply.bind(ctx), pubkey, displayName);
});

// ---------------------------------------------------------------------------
// /link [pubkey] — link wallet. Two modes:
//   /link             → deep-link flow (native build required)
//   /link <pubkey>    → direct linking (works with Expo Go — paste from Profile)
// ---------------------------------------------------------------------------
bot.command("link", async (ctx) => {
  const from       = ctx.from;
  const tgUserId   = String(from?.id ?? "");
  const tgUsername = from?.username ?? "";
  const arg        = ctx.match?.trim() ?? "";

  if (!tgUserId) return ctx.reply("Could not identify your Telegram account.");

  // --- Direct pubkey mode (Expo Go friendly) ---
  if (arg.length >= 32 && arg.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(arg)) {
    try {
      const res = await fetch(`${WORKER_BASE_URL}/api/link-wallet`, {
        method: "POST",
        headers: workerHeaders(),
        body: JSON.stringify({ tgUserId, tgUsername, pubkey: arg }),
      });
      if (!res.ok) throw new Error("worker error");
      await ctx.reply(
        `✅ *Wallet linked!*\n\n` +
        `\`${arg.slice(0, 8)}…${arg.slice(-4)}\` is now connected to your Telegram account.\n\n` +
        `Use /me to see your reputation.`,
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("Failed to link wallet. Check the address and try again.");
    }
    return;
  }

  if (arg && arg.length > 0) {
    return ctx.reply(
      "That doesn't look like a valid Solana address.\n\n" +
      "Copy your full wallet address from the Profile tab in the Terrace app and try:\n`/link YOUR_WALLET_ADDRESS`",
      { parse_mode: "Markdown" }
    );
  }

  // --- Deep-link flow (native/dev build) ---
  const token   = await createLinkToken(tgUserId, tgUsername);
  if (!token) return ctx.reply("Link service unavailable. Try again shortly.");

  const linkUrl = `${WORKER_BASE_URL}/link/${token}`;
  const kb      = new InlineKeyboard().url("🔗 Open in Terrace", linkUrl);

  const text =
    "🔗 *Link your Solana wallet*\n\n" +
    "*Option A — native build:* Tap the button below.\n\n" +
    "*Option B — Expo Go:* Copy your wallet address from the Profile tab, then send:\n" +
    "`/link YOUR_WALLET_ADDRESS`\n\n" +
    "⏱ Deep-link expires in 15 minutes.";

  const isGroup = ctx.chat?.type !== "private";
  if (isGroup) {
    try {
      await bot.api.sendMessage(tgUserId, text, { parse_mode: "Markdown", reply_markup: kb });
      await ctx.reply(`${tgUsername ? `@${tgUsername}` : "You"} — check your DMs 📬`);
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

// ---------------------------------------------------------------------------
// /me — show your own reputation (requires linked wallet)
// ---------------------------------------------------------------------------
bot.command("me", async (ctx) => {
  const tgUserId  = String(ctx.from?.id ?? "");
  const username  = ctx.from?.username ? `@${ctx.from.username}` : `Fan ${shortAddr(tgUserId)}`;

  const pubkey = await getWalletByTgId(tgUserId);
  if (!pubkey) {
    const kb = new InlineKeyboard().text("🔗 Link wallet", "link_wallet");
    return ctx.reply(
      "No wallet linked yet.\n\nRun /link to connect your Solana wallet and unlock your reputation stats.",
      { reply_markup: kb }
    );
  }

  await replyWithReputation(ctx.reply.bind(ctx), pubkey, username);
});

bot.callbackQuery("link_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "🔗 *Link your wallet*\n\n" +
    "Copy your wallet address from the *Profile* tab in the Terrace app, then send:\n\n" +
    "`/link YOUR_WALLET_ADDRESS`",
    { parse_mode: "Markdown" }
  );
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
    "🔗 /link — connect your Solana wallet\n" +
    "🎯 /me — your reputation & stats (requires /link)\n" +
    "📋 /markets — browse open markets\n" +
    "🔴 /live — active flash markets with countdowns\n" +
    "⚡ /flash <question> [min] — create a flash market (5–90 min)\n" +
    "⚔️ /challenge [@user] — send a 1v1 matchup invitation\n" +
    "📊 /odds <id> — YES/NO odds for a market\n" +
    "🏆 /leaderboard — weekly top Sharps\n" +
    "🔍 /sharp <pubkey> — look up any wallet's reputation\n" +
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

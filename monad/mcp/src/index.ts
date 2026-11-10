#!/usr/bin/env node
/**
 * terrace-mcp: Terrace for Claude (and any MCP client).
 *
 * Your Claude turns a take into a 1v1 bet and hands back a link; your mate's Claude reads it and
 * accepts; Chainlink CRE settles it from match data (or the AI judge, for takes no data rule fits)
 * and the winner collects. Everything runs on Terrace's live contracts on Monad testnet with test
 * dollars, from a capped local account (see terrace.ts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { decodeEventLog, formatEther, stringToHex, zeroAddress, type Address, type TransactionReceipt } from "viem";
import { z } from "zod";
import {
  ABI, ADDR, ANSWER, API, MATCHUP_STATUS, MAX_STAKE, SIDE, account, approve, chain, challengeId, challengeLink, checkStake, compileTake,
  dollars, ensureFunds, fixtureName, gql, matchLink, matches, send,
} from "./terrace.js";
import { effectiveAnswer, loadGameDay, renderGameDay } from "./gameday.js";

// The published package.json sits next to dist/, so the server reports the version actually installed.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const server = new McpServer(
  { name: "terrace", version },
  {
    instructions:
      "Terrace is a social prediction game for football on Monad testnet, played with free test dollars. " +
      "To bet a friend: find the match with terrace_matches, preview the take with terrace_preview_take, then terrace_challenge, and give the user the link and invite text it returns to send to their friend. " +
      "When the user pastes a Terrace challenge link (play.terrace.social/c/<n>), show it with terrace_challenge_details before terrace_accept_challenge. " +
      "Always show the plain-English rule and the stake to the user and get a clear yes before any tool that stakes money. " +
      "When the user asks how their bets are doing, use terrace_game_day. After full time, terrace_collect pays out.",
  },
);

const ok = (text: string, data?: unknown) => ({ content: [{ type: "text" as const, text: data === undefined ? text : `${text}\n\n${JSON.stringify(data, null, 2)}` }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (e as Error).message ?? String(e) }] });
const tool = <T,>(fn: (args: T) => Promise<ReturnType<typeof ok>>) => async (args: T) => {
  try {
    return await fn(args);
  } catch (e) {
    return fail(e);
  }
};

function events<A extends readonly unknown[]>(receipt: TransactionReceipt, abi: A) {
  const out: { eventName: string; args: Record<string, unknown> }[] = [];
  for (const log of receipt.logs) {
    try {
      out.push(decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics }) as never);
    } catch {}
  }
  return out;
}

const when = (unix: number | bigint) => new Date(Number(unix) * 1000).toUTCString().replace(":00 GMT", " UTC");
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);

// ---------------------------------------------------------------- reads

server.registerTool(
  "terrace_account",
  { title: "Terrace account", description: "This Claude's Terrace account on Monad testnet: address, test-dollar and gas balances, and the per-bet cap.", annotations: { readOnlyHint: true } },
  tool(async () => {
    const [gas, usd] = await Promise.all([chain.getBalance({ address: account.address }), chain.readContract({ address: ADDR.usd, abi: ABI.erc20, functionName: "balanceOf", args: [account.address] })]);
    return ok("Your Terrace account (Monad testnet, test money only).", {
      address: account.address,
      testDollars: dollars(usd),
      gasMON: Number(formatEther(gas)).toFixed(3),
      capPerBet: `$${MAX_STAKE}`,
      note: usd === 0n ? "New account: it's topped up with $100 in test dollars and gas on its first bet." : undefined,
      explorer: `https://testnet.monadexplorer.com/address/${account.address}`,
    });
  }),
);

server.registerTool(
  "terrace_matches",
  { title: "Football matches on Terrace", description: "Upcoming and live football matches you can bet on, with their match ids.", annotations: { readOnlyHint: true } },
  tool(async () => {
    const rows = (await matches())
      .filter((m) => !["FT", "AET", "PEN", "PST", "CANC"].includes(m.status))
      .sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) || a.kickoff - b.kickoff)
      .slice(0, 40)
      .map((m) => ({ match: m.id, fixture: `${m.home.name} v ${m.away.name}`, when: LIVE.has(m.status) ? `LIVE ${m.elapsed ?? ""}'` : when(m.kickoff), score: m.goals.home === null ? undefined : `${m.goals.home}-${m.goals.away}` }));
    return ok(rows.length ? `${rows.length} matches open for takes.` : "No upcoming matches right now.", rows);
  }),
);

server.registerTool(
  "terrace_preview_take",
  {
    title: "Preview a take",
    description: "Turn a football take into the rule Terrace will settle it by, without betting. Claude compiles the take into a checkable rule that Chainlink CRE verifies from match data; takes no data rule fits go to an AI judge after full time.",
    inputSchema: { take: z.string().min(3).max(200).describe('The take in plain words, e.g. "Haaland scores before the hour"'), match: z.number().int().describe("Match id from terrace_matches") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ take, match }: { take: string; match: number }) => {
    const c = await compileTake(take, match);
    return ok(`Rule: ${c.reading}`, { match: await fixtureName(match), settledBy: c.spec ? "Chainlink CRE, from official match data" : "Chainlink CRE's AI judge, after full time", bettingCloses: when(c.closeTime) });
  }),
);

server.registerTool(
  "terrace_challenge_details",
  {
    title: "Look at a 1v1 challenge",
    description: "Show a Terrace 1v1 challenge from its link or number: the take, the rule, who's on which side, the stake and its status. Use before accepting.",
    inputSchema: { challenge: z.string().describe("A play.terrace.social/c/<n> link, or the challenge number") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ challenge }: { challenge: string }) => {
    const id = challengeId(challenge);
    const m = await chain.readContract({ address: ADDR.matchups, abi: ABI.matchups, functionName: "getMatchup", args: [id] }).catch(() => {
      throw new Error(`There's no Terrace challenge #${id}.`);
    });
    const { Question } = await gql<{ Question: { text: string; spec: string | null; closeTime: string; answer: number; fixture: { id: string } | null }[] }>(
      `query Q($id: String!) { Question(where: { id: { _eq: $id } }) { text spec closeTime answer fixture { id } } }`,
      { id: String(m.questionId) },
    );
    const q = Question[0];
    const mine = (a: Address) => a.toLowerCase() === account.address.toLowerCase();
    const theirSide = SIDE[m.challengerSide === 1 ? 2 : 1];
    return ok(`Challenge #${id}: "${q?.text ?? `question ${m.questionId}`}"`, {
      link: challengeLink(id),
      match: q?.fixture ? await fixtureName(q.fixture.id) : undefined,
      challenger: mine(m.challenger) ? "you" : m.challenger,
      challengerBacks: SIDE[m.challengerSide],
      takerBacks: theirSide,
      openTo: m.opponent === zeroAddress ? "anyone with the link" : mine(m.opponent) ? "you" : m.opponent,
      stakeEach: dollars(m.stake),
      winnerGets: dollars(m.stake * 2n),
      status: MATCHUP_STATUS[m.status],
      settledBy: q?.spec ? "Chainlink CRE, from official match data" : "Chainlink CRE's AI judge, after full time",
      bettingCloses: q ? when(Number(q.closeTime)) : undefined,
      result: q && q.answer ? ANSWER[q.answer] : undefined,
      winner: m.status === 4 ? (mine(m.winner) ? "you" : m.winner) : undefined,
    });
  }),
);

server.registerTool(
  "terrace_my_bets",
  { title: "My Terrace bets", description: "This account's 1v1 challenges and market bets, and which can be collected.", annotations: { readOnlyHint: true } },
  tool(async () => {
    const me = account.address.toLowerCase();
    const d = await gql<{
      sent: Mu[]; received: Mu[];
      Bet: { stake: string; side: number; result: number | null; payout: string | null; market: { id: string; question: Qa } }[];
    }>(
      `query M($me: String!) {
        sent: Matchup(where: { challenger: { _eq: $me } }, order_by: { createdAt: desc }) { ${MU} }
        received: Matchup(where: { opponent: { _eq: $me } }, order_by: { createdAt: desc }) { ${MU} }
        Bet(where: { bettor: { _eq: $me } }) { stake side result payout market { id question { ${QA} } } }
      }`,
      { me },
    );
    const challenges = [...d.sent, ...d.received].map((m) => ({
      challenge: Number(m.id),
      link: challengeLink(m.id),
      take: m.question.text,
      youBack: SIDE[m.challenger === me ? m.challengerSide : 3 - m.challengerSide],
      stakeEach: dollars(m.stake),
      status: m.status === 4 ? (m.winner === me ? `won ${dollars(BigInt(m.stake) * 2n)}` : "lost") : m.status === 1 && effectiveAnswer(m.question) ? "ready to collect" : MATCHUP_STATUS[m.status],
    }));
    const bets = d.Bet.map((b) => ({
      market: Number(b.market.id),
      take: b.market.question.text,
      side: SIDE[b.side] || "sealed",
      stake: dollars(b.stake),
      status: b.result === null ? (effectiveAnswer(b.market.question) === 0 ? "open" : "ready to collect") : b.result === 1 ? `won ${dollars(b.payout ?? 0)}` : b.result === 0 ? "refunded" : "lost",
    }));
    const ready = [...challenges, ...bets].filter((x) => x.status === "ready to collect").length;
    return ok(`${challenges.length} challenges, ${bets.length} market bets${ready ? `, ${ready} ready to collect (terrace_collect)` : ""}.`, { challenges, bets });
  }),
);

server.registerTool(
  "terrace_game_day",
  {
    title: "Game day",
    description:
      "How this Claude's bets stand right now: every open position grouped by match, beside the live score, winning or losing as it stands, and what it comes to if the games ended now. " +
      "Live matches first, then full time awaiting a result, then upcoming; ends with what's ready for terrace_collect.",
    annotations: { readOnlyHint: true },
  },
  tool(async () => {
    const { groups, accas } = await loadGameDay(API, account.address);
    return ok(renderGameDay(groups, accas));
  }),
);

// Enough of a question to work out the answer the contracts act on (effectiveAnswer), not just the stored one
type Qa = { text: string; answer: number; kind: number; line: number; closeTime: string; fixture: { state: number; kickoff: string; homeGoals: number; awayGoals: number } | null };
const QA = "text answer kind line closeTime fixture { state kickoff homeGoals awayGoals }";
type Mu = { id: string; challenger: string; opponent: string | null; challengerSide: number; stake: string; status: number; winner: string | null; question: Qa };
const MU = `id challenger opponent challengerSide stake status winner question { ${QA} }`;

server.registerTool(
  "terrace_open_takes",
  { title: "Open takes", description: "The hottest open take markets fans have posted, with their pools, so you can back or fade one.", annotations: { readOnlyHint: true } },
  tool(async () => {
    const { Message } = await gql<{ Message: { text: string; room_id: string; market: { id: string; yesPool: string; noPool: string; bettors: number; question: { answer: number; closeTime: string } } }[] }>(
      `{ Message(where: { market_id: { _is_null: false } }, order_by: { heat: desc }, limit: 60) { text room_id market { id yesPool noPool bettors question { answer closeTime } } } }`,
    );
    const now = Date.now() / 1000;
    const rows = Message.filter((m) => m.market.question.answer === 0 && Number(m.market.question.closeTime) > now)
      .slice(0, 20)
      .map((m) => ({ market: Number(m.market.id), take: m.text, backing: dollars(m.market.yesPool), fading: dollars(m.market.noPool), fans: m.market.bettors, closes: when(Number(m.market.question.closeTime)), match: matchLink(m.room_id.replace(/^match-/, "")) }));
    return ok(rows.length ? `${rows.length} open takes.` : "No open takes right now: post one with terrace_challenge.", rows);
  }),
);

// ---------------------------------------------------------------- writes

server.registerTool(
  "terrace_challenge",
  {
    title: "Challenge someone to a 1v1 on a take",
    description:
      `Bet a friend 1v1 on a football take. Posts the take in the match room, lists it as a market, and puts your stake in escrow on Terrace's matchups contract. Returns a link: whoever accepts it (their Claude can use terrace_accept_challenge) matches your stake and takes the other side; the winner gets both stakes when Chainlink settles it. Test dollars only, at most $${MAX_STAKE} a bet. Confirm the rule (terrace_preview_take) and the stake with the user first. ` +
      "Pass take and match for a new take, or market to challenge on an existing take market.",
    inputSchema: {
      take: z.string().min(3).max(200).optional().describe("The take in plain words"),
      match: z.number().int().optional().describe("Match id from terrace_matches (with take)"),
      market: z.number().int().optional().describe("An existing take market to challenge on, instead of take + match"),
      stake: z.number().positive().describe("Your stake in test dollars; the taker matches it"),
      side: z.enum(["yes", "no"]).default("yes").describe("yes = you say the take happens; no = you say it won't"),
      opponent: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Only this address may accept. Leave out for anyone with the link"),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  tool(async (a: { take?: string; match?: number; market?: number; stake: number; side: "yes" | "no"; opponent?: string }) => {
    const stake = checkStake(a.stake);
    const side = a.side === "no" ? 2 : 1;
    let questionId: bigint;
    let text: string;
    let reading: string | undefined;
    let fixture: number | undefined;

    if (a.market !== undefined) {
      questionId = await chain.readContract({ address: ADDR.markets, abi: ABI.markets, functionName: "questionOf", args: [BigInt(a.market)] });
      const { Question } = await gql<{ Question: { text: string; fixture: { id: string } | null }[] }>(`query Q($id: String!) { Question(where: { id: { _eq: $id } }) { text fixture { id } } }`, { id: String(questionId) });
      text = Question[0]?.text ?? `market ${a.market}`;
      fixture = Question[0]?.fixture ? Number(Question[0].fixture.id) : undefined;
      await ensureFunds(stake);
    } else {
      if (!a.take || a.match === undefined) throw new Error("Give either take and match, or market.");
      const c = await compileTake(a.take, a.match);
      if (c.closeTime <= Date.now() / 1000 + 30) throw new Error("Betting on that take closes in under 30 seconds: too late for a 1v1.");
      await ensureFunds(stake);
      text = a.take;
      reading = c.reading;
      fixture = a.match;
      // The take goes in the match room like any fan's, so it shows up in the app too
      const posted = await send({ address: ADDR.chat, abi: ABI.chat, functionName: "post", args: [0, BigInt(a.match), a.take, 0n] });
      const messageId = events(posted, ABI.chat).find((e) => e.eventName === "MessagePosted")?.args.messageId as bigint | undefined;
      if (messageId === undefined) throw new Error("Posted the take but couldn't read its message id.");
      const listed = await send({
        address: ADDR.markets,
        abi: ABI.markets,
        functionName: "createTakeMarket",
        args: [messageId, BigInt(a.match), BigInt(c.closeTime), a.take, c.spec ? stringToHex(c.spec) : "0x", ADDR.usd, 300, 1, 0n],
      });
      const q = events(listed, ABI.markets).find((e) => e.eventName === "TakeListed")?.args.questionId as bigint | undefined;
      if (q === undefined) throw new Error("Listed the take but couldn't read its question id.");
      questionId = q;
    }

    await approve(ADDR.matchups, stake);
    const sent = await send({ address: ADDR.matchups, abi: ABI.matchups, functionName: "challenge", args: [(a.opponent ?? zeroAddress) as Address, questionId, side, ADDR.usd, stake] });
    const id = events(sent, ABI.matchups).find((e) => e.eventName === "MatchupCreated")?.args.matchupId as bigint | undefined;
    if (id === undefined) throw new Error("The challenge went through but its number couldn't be read; check terrace_my_bets.");
    const link = challengeLink(id);
    const theirs = side === 1 ? "it won't" : "it will";
    return ok(
      `Challenge #${id} is live: ${link}\n\nSend your friend this:\n"I bet you ${dollars(stake)} that ${side === 1 ? "" : "NOT: "}${text}. You say ${theirs}? Open ${link}, or paste the link into your Claude (with terrace-mcp) and say accept. Winner takes ${dollars(stake * 2n)}, settled by Chainlink."`,
      { challenge: Number(id), link, take: text, rule: reading, match: fixture ? await fixtureName(fixture) : undefined, youBack: SIDE[side], stakeEach: dollars(stake), tx: sent.transactionHash },
    );
  }),
);

server.registerTool(
  "terrace_accept_challenge",
  {
    title: "Accept a 1v1 challenge",
    description: "Take the other side of a Terrace 1v1 challenge by matching its stake (test dollars). Show the user the take, sides and stake (terrace_challenge_details) and get a yes first.",
    inputSchema: { challenge: z.string().describe("A play.terrace.social/c/<n> link, or the challenge number") },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  tool(async ({ challenge }: { challenge: string }) => {
    const id = challengeId(challenge);
    const m = await chain.readContract({ address: ADDR.matchups, abi: ABI.matchups, functionName: "getMatchup", args: [id] });
    if (m.status !== 0) throw new Error(`Challenge #${id} is ${MATCHUP_STATUS[m.status]}, so it can't be accepted.`);
    if (m.challenger.toLowerCase() === account.address.toLowerCase()) throw new Error("That's your own challenge: send the link to someone else.");
    checkStake(Number(m.stake) / 1e6);
    await ensureFunds(m.stake);
    await approve(ADDR.matchups, m.stake);
    const r = await send({ address: ADDR.matchups, abi: ABI.matchups, functionName: "accept", args: [id] });
    return ok(`You're on: challenge #${id}, you back ${SIDE[3 - m.challengerSide]} with ${dollars(m.stake)}. Winner takes ${dollars(m.stake * 2n)} once Chainlink settles it; then run terrace_collect.`, { link: challengeLink(id), tx: r.transactionHash });
  }),
);

server.registerTool(
  "terrace_call_off",
  {
    title: "Call off a challenge",
    description: "Call off a 1v1 challenge nobody has accepted yet; your stake comes back.",
    inputSchema: { challenge: z.string().describe("A play.terrace.social/c/<n> link, or the challenge number") },
    annotations: { destructiveHint: true },
  },
  tool(async ({ challenge }: { challenge: string }) => {
    const id = challengeId(challenge);
    const r = await send({ address: ADDR.matchups, abi: ABI.matchups, functionName: "decline", args: [id] });
    return ok(`Challenge #${id} is called off and the stake is back.`, { tx: r.transactionHash });
  }),
);

server.registerTool(
  "terrace_back",
  {
    title: "Back or fade a take market",
    description: "Put test dollars on yes (back) or no (fade) in an open take market from terrace_open_takes. Pari-mutuel: winners split the pool.",
    inputSchema: { market: z.number().int(), side: z.enum(["yes", "no"]), stake: z.number().positive() },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  tool(async ({ market, side, stake }: { market: number; side: "yes" | "no"; stake: number }) => {
    const amount = checkStake(stake);
    await ensureFunds(amount);
    await approve(ADDR.markets, amount);
    const r = await send({ address: ADDR.markets, abi: ABI.markets, functionName: "placeBet", args: [BigInt(market), side === "yes" ? 1 : 2, amount] });
    return ok(`${side === "yes" ? "Backed" : "Faded"} market ${market} with ${dollars(amount)}.`, { tx: r.transactionHash });
  }),
);

server.registerTool(
  "terrace_collect",
  {
    title: "Collect winnings",
    description: "Pay out everything this account can collect: settled 1v1s, finished market bets, and refunds for challenges nobody took before betting closed.",
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  tool(async () => {
    const me = account.address.toLowerCase();
    const d = await gql<{ sent: Mu[]; received: Mu[]; Bet: { stake: string; market: { id: string; question: Qa } }[] }>(
      `query C($me: String!) {
        sent: Matchup(where: { challenger: { _eq: $me }, status: { _in: [0, 1] } }) { ${MU} }
        received: Matchup(where: { opponent: { _eq: $me }, status: { _eq: 1 } }) { ${MU} }
        Bet(where: { bettor: { _eq: $me }, result: { _is_null: true } }) { stake market { id question { ${QA} } } }
      }`,
      { me },
    );
    const now = Date.now() / 1000;
    const done: string[] = [];
    const skipped: string[] = [];
    const run = async (label: string, call: Parameters<typeof send>[0]) => {
      try {
        await send(call);
        done.push(label);
      } catch (e) {
        skipped.push(`${label}: ${(e as Error).message}`);
      }
    };
    for (const m of [...d.sent, ...d.received]) {
      if (m.status === 1 && effectiveAnswer(m.question, now)) await run(`1v1 #${m.id} "${m.question.text}"`, { address: ADDR.matchups, abi: ABI.matchups, functionName: "settle", args: [BigInt(m.id)] });
      if (m.status === 0 && Number(m.question.closeTime) <= now) await run(`refund for untaken 1v1 #${m.id}`, { address: ADDR.matchups, abi: ABI.matchups, functionName: "expire", args: [BigInt(m.id)] });
    }
    for (const b of d.Bet.filter((x) => effectiveAnswer(x.market.question, now) !== 0)) {
      await run(`"${b.market.question.text}" (${dollars(b.stake)})`, { address: ADDR.markets, abi: ABI.markets, functionName: "settleBet", args: [BigInt(b.market.id), account.address] });
    }
    const usd = await chain.readContract({ address: ADDR.usd, abi: ABI.erc20, functionName: "balanceOf", args: [account.address] });
    if (!done.length && !skipped.length) return ok(`Nothing to collect yet. Balance: ${dollars(usd)}.`);
    return ok(`Collected ${done.length}${skipped.length ? `, ${skipped.length} not ready` : ""}. Balance: ${dollars(usd)}.`, { collected: done, notReady: skipped.length ? skipped : undefined });
  }),
);

await server.connect(new StdioServerTransport());
console.error(`terrace-mcp ready · ${account.address} · ${API}`);

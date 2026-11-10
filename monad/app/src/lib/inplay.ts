"use client";
import { decodeEventLog, stringToHex, type Address } from "viem";
import type { useAccount } from "./account";
import { publicClient } from "./chain";
import { ADDR, marketsAbi, oracleAbi } from "./contracts";
import { FanError } from "./errors";
import { bet } from "./play";
import { shortTeam } from "./labels";
import type { MatchLite } from "./useMatches";

type Send = ReturnType<typeof useAccount>["send"];

/*
 * In-play calls for a match you're on: a goal (or a card) in the next stretch of the game. Betting
 * closes in five minutes and the window starts after that, so nobody backs a goal they've just seen.
 * The rule is plain match data, so CRE settles it like any take; flash markets lock at the whistle.
 */
export type InPlayCall = { key: string; text: string; spec: string; closeTime: number };

const BETTING = 5 * 60;

export function inPlayCalls(m: MatchLite, now = Math.floor(Date.now() / 1000)): InPlayCall[] {
  const minute = m.status === "HT" ? 45 : m.elapsed ?? 0;
  if (!["1H", "2H", "HT"].includes(m.status) || minute >= 80) return [];
  const from = minute + 6; // after betting closes (five minutes from now)
  const to = Math.min(90, Math.ceil((from + 10) / 5) * 5);
  const game = `${shortTeam(m.home.name)} v ${shortTeam(m.away.name)}`;
  const close = now + BETTING;
  return [
    { key: `goal-${m.id}-${from}`, text: `A goal between ${from}' and ${to}' in ${game}`, spec: JSON.stringify({ v: 1, left: { events: { type: "Goal", minute: [from, to] } }, op: ">=", value: 1 }), closeTime: close },
    { key: `card-${m.id}-${from}`, text: `A card between ${from}' and ${to}' in ${game}`, spec: JSON.stringify({ v: 1, left: { events: { type: "Card", minute: [from, to] } }, op: ">=", value: 1 }), closeTime: close },
  ];
}

/** Open the call as a flash market and back it in one go (the creator's first bet opens the pool). */
export async function backInPlay(send: Send, owner: Address, m: MatchLite, call: InPlayCall, side: 1 | 2, dollars: number) {
  const qHash = await send({ address: ADDR.oracle, abi: oracleAbi, functionName: "customQuestion", args: [BigInt(m.id), BigInt(call.closeTime), call.text, stringToHex(call.spec)] });
  let questionId: bigint | null = null;
  for (const log of (await publicClient.getTransactionReceipt({ hash: qHash })).logs) {
    try {
      const ev = decodeEventLog({ abi: oracleAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "QuestionCreated") questionId = ev.args.questionId;
    } catch {}
  }
  if (questionId === null) throw new FanError("That call didn't open. Try again in a moment.");
  const mHash = await send({ address: ADDR.markets, abi: marketsAbi, functionName: "createMarket", args: [questionId, ADDR.usd, 0, false, true] });
  let marketId: bigint | null = null;
  for (const log of (await publicClient.getTransactionReceipt({ hash: mHash })).logs) {
    try {
      const ev = decodeEventLog({ abi: marketsAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "MarketCreated") marketId = ev.args.marketId;
    } catch {}
  }
  if (marketId === null) throw new FanError("Your call is up. Refresh to back it.");
  return bet(send, owner, marketId, ADDR.usd, side, dollars);
}

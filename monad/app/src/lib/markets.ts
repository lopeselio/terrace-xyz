"use client";
import { decodeEventLog, type Address } from "viem";
import type { useAccount } from "./account";
import { publicClient } from "./chain";
import { ADDR, marketsAbi } from "./contracts";
import { query } from "./indexer";
import { bet } from "./play";
import { KIND, standardQuestion } from "./social";
import { FanError } from "./errors";

type Send = ReturnType<typeof useAccount>["send"];

/** A pool on one of a match's standard questions (result, goals, both teams to score). */
export type StdMarket = { id: string; yesPool: string; noPool: string; feeBps: number; question: { id: string; kind: number; line: number; answer: number } };

/** The open dollar pools for these matches' standard questions, keyed `${fixtureId}-${kind}`. */
export async function standardMarkets(fixtureIds: number[]): Promise<Map<string, StdMarket>> {
  if (!fixtureIds.length) return new Map();
  const d = await query<{ Market: (StdMarket & { question: StdMarket["question"] & { fixture: { id: string } | null } })[] }>(
    `query S($ids: [String!], $usd: String!) {
      Market(where: { question: { fixture_id: { _in: $ids }, kind: { _gt: 0 } }, token: { _eq: $usd }, isSealed: { _eq: false }, isFlash: { _eq: false } }, order_by: { id: asc }) {
        id yesPool noPool feeBps question { id kind line answer fixture { id } }
      }
    }`,
    { ids: fixtureIds.map(String), usd: ADDR.usd.toLowerCase() },
  );
  const out = new Map<string, StdMarket>();
  for (const m of d.Market) {
    const key = `${m.question.fixture?.id}-${m.question.kind}`;
    if (!out.has(key)) out.set(key, m); // the first pool on a question is the main one
  }
  return out;
}

/** Back a side of a standard question: opens its pool the first time anyone bets on it. */
export async function backStandard(send: Send, owner: Address, fixtureId: number, kind: number, side: 1 | 2, dollars: number, existing?: StdMarket) {
  let marketId = existing ? BigInt(existing.id) : null;
  if (marketId === null) {
    const questionId = await standardQuestion(send, fixtureId, kind, kind === KIND.OVER ? 2 : 0);
    const hash = await send({ address: ADDR.markets, abi: marketsAbi, functionName: "createMarket", args: [questionId, ADDR.usd, 0, false, false] });
    const receipt = await publicClient.getTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: marketsAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "MarketCreated") marketId = ev.args.marketId;
      } catch {}
    }
    if (marketId === null) throw new FanError("Your market is up. Refresh to see it on the board.");
  }
  return bet(send, owner, marketId, ADDR.usd, side, dollars);
}

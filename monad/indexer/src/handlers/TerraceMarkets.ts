import { indexer, type EvmOnEventContext } from "envio";
import { feed, heat, id, player, type EventMeta } from "../lib";
import { award, invited, stakeBonus } from "../points";

/** Top bit of TakeListed.chatRef: the take came from a group chat through the Terrace bot (app/src/lib/play.ts GROUP_REF). */
export const GROUP_REF = 1n << 255n;

indexer.onEvent({ contract: "TerraceMarkets", event: "MarketCreated" }, async ({ event, context }) => {
  const p = event.params;
  context.Market.set({
    id: id(p.marketId),
    question_id: id(p.questionId),
    token: id(p.token),
    creator: id(p.creator),
    feeBps: Number(p.feeBps),
    isSealed: p.sealed_,
    isFlash: p.flash,
    yesPool: 0n,
    noPool: 0n,
    sealedPool: 0n,
    volume: 0n,
    bettors: 0,
    take_id: undefined,
    fromGroup: false,
    createdAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "TerraceMarkets", event: "TakeListed" }, async ({ event, context }) => {
  const p = event.params;
  const market = await context.Market.get(id(p.marketId));
  const fromGroup = p.chatRef >= GROUP_REF;
  const message = await context.Message.get(id(fromGroup ? p.chatRef - GROUP_REF : p.chatRef));
  // Only link the take if the person listing it wrote it.
  if (!market || !message || message.author !== id(p.author)) return;
  context.Market.set({ ...market, take_id: message.id, fromGroup });
  context.Message.set({ ...message, market_id: market.id });
  const author = await player(context, p.author);
  context.Player.set({ ...author, takesListed: author.takesListed + 1 });
  feed(context, event, { kind: "TAKE_LISTED", actor: p.author, room_id: message.room_id, message_id: message.id, market_id: market.id, text: message.text });
  await award(context, event, p.author, "TAKE_LISTED");
  if (fromGroup) await award(context, event, p.author, "CHAT_MARKET");
});

async function addStake(context: EvmOnEventContext, marketId: string, bettor: string, side: number, stake: bigint, sealed: boolean) {
  const market = await context.Market.get(marketId);
  if (!market) return;
  const betId = `${marketId}-${id(bettor)}`;
  const bet = await context.Bet.get(betId);
  const newBettor = !bet;
  context.Bet.set({
    id: betId,
    market_id: marketId,
    bettor: id(bettor),
    side: bet?.side || side,
    stake: (bet?.stake ?? 0n) + stake,
    isSealed: sealed,
    result: undefined,
    payout: undefined,
  });
  const updated = {
    ...market,
    yesPool: market.yesPool + (side === 1 ? stake : 0n),
    noPool: market.noPool + (side === 2 ? stake : 0n),
    sealedPool: market.sealedPool + (sealed ? stake : 0n),
    volume: market.volume + stake,
    bettors: market.bettors + (newBettor ? 1 : 0),
  };
  context.Market.set(updated);

  if (market.take_id) {
    const message = await context.Message.get(market.take_id);
    if (message) {
      const author = await player(context, message.author);
      const next = { ...message, bettors: updated.bettors, volume: updated.volume };
      context.Message.set({ ...next, heat: heat(next, author) });
    }
  }
  return updated;
}

indexer.onEvent({ contract: "TerraceMarkets", event: "BetPlaced" }, async ({ event, context }) => {
  const p = event.params;
  const m = await addStake(context, id(p.marketId), p.bettor, Number(p.side), p.stake, false);
  if (m) feed(context, event, { kind: "BET", actor: p.bettor, market_id: m.id, message_id: m.take_id, amount: p.stake });
  if (m) await betPoints(context, event, m, p.bettor, p.stake);
});

indexer.onEvent({ contract: "TerraceMarkets", event: "SealedBetPlaced" }, async ({ event, context }) => {
  const p = event.params;
  const m = await addStake(context, id(p.marketId), p.bettor, 0, p.stake, true);
  if (m) feed(context, event, { kind: "BET", actor: p.bettor, market_id: m.id, message_id: m.take_id, amount: p.stake });
  if (m) await betPoints(context, event, m, p.bettor, p.stake);
});

/**
 * Points for a bet, and for the take's author when someone else backs their call with money. A brand-new
 * fan whose first bet is on a group chat's take counts as brought in by whoever listed it.
 */
async function betPoints(context: EvmOnEventContext, event: EventMeta, m: { take_id?: string; fromGroup: boolean; creator: string }, bettor: string, stake: bigint) {
  const isNew = await award(context, event, bettor, "BET", stakeBonus(stake));
  if (isNew && m.fromGroup && m.creator !== id(bettor)) await invited(context, event, m.creator);
  const takeId = m.take_id;
  const take = takeId ? await context.Message.get(takeId) : undefined;
  if (take && take.author !== id(bettor)) await award(context, event, take.author, "BET_ON_YOUR_TAKE");
}

indexer.onEvent({ contract: "TerraceMarkets", event: "BetRevealed" }, async ({ event, context }) => {
  const p = event.params;
  const marketId = id(p.marketId);
  const bet = await context.Bet.get(`${marketId}-${id(p.bettor)}`);
  const market = await context.Market.get(marketId);
  if (!bet || !market) return;
  const side = p.valid ? Number(p.side) : 0;
  context.Bet.set({ ...bet, side });
  context.Market.set({
    ...market,
    sealedPool: market.sealedPool - bet.stake,
    yesPool: market.yesPool + (side === 1 ? bet.stake : 0n),
    noPool: market.noPool + (side === 2 ? bet.stake : 0n),
  });
});

indexer.onEvent({ contract: "TerraceMarkets", event: "BetSettled" }, async ({ event, context }) => {
  const p = event.params;
  const marketId = id(p.marketId);
  const bet = await context.Bet.get(`${marketId}-${id(p.bettor)}`);
  if (bet) context.Bet.set({ ...bet, result: Number(p.result), payout: p.payout });
  const market = await context.Market.get(marketId);

  // The take's author: count how their takes turn out (feeds the ranking's record bonus).
  if (market?.take_id && Number(p.result) !== 0) {
    const message = await context.Message.get(market.take_id);
    if (message && message.author === id(p.bettor)) {
      const author = await player(context, message.author);
      context.Player.set({
        ...author,
        takesSettled: author.takesSettled + 1,
        takesWon: author.takesWon + (Number(p.result) === 1 ? 1 : 0),
      });
    }
  }
  if (Number(p.result) === 1) {
    feed(context, event, { kind: "WIN", actor: p.bettor, market_id: marketId, message_id: market?.take_id, amount: p.payout });
    await award(context, event, p.bettor, "WIN");
  }
});

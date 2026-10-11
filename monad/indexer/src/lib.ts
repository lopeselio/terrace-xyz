import { BigDecimal, type EvmOnEventContext, type FeedItem, type Message, type Player } from "envio";

export type Ctx = EvmOnEventContext;

export type EventMeta = { block: { number: number; timestamp: number }; logIndex: number };

export const id = (x: string | bigint | number) => String(x).toLowerCase();
export const roomKey = (kind: number | bigint, roomId: bigint) => `${Number(kind) === 0 ? "match" : "league"}-${roomId}`;

export function newPlayer(address: string): Player {
  return {
    id: id(address),
    isAgent: false,
    operator: undefined,
    metadataURI: undefined,
    points: 0n,
    results: 0,
    wins: 0,
    winRateBps: 0,
    streak: 0,
    badge: 0,
    predictions: 0,
    correctResults: 0,
    exactScores: 0,
    titles: 0,
    messages: 0,
    takesListed: 0,
    takesWon: 0,
    takesSettled: 0,
    backersReceived: 0,
    terracePoints: 0n,
    firstSeen: undefined,
    lastActiveDay: -1,
    dayStreak: 0,
    dayMessages: 0,
    invitesLanded: 0,
  };
}

export async function player(context: Ctx, address: string): Promise<Player> {
  return (await context.Player.get(id(address))) ?? newPlayer(address);
}

/**
 * Feed ranking, part 1 (time-independent): how much a take is moving the room.
 *   backers x2   people who publicly back it
 *   bettors x3   people who put money on it
 *   log10(volume in dollars + 1) x4
 *   author's take record: up to +3 for a strong history of winning takes
 * The app divides by (age in hours + 2)^1.5 when it ranks, so fresh takes can still break through.
 */
export function heat(m: Pick<Message, "backers" | "bettors" | "volume">, author: Player): BigDecimal {
  const dollars = Number(m.volume) / 1e6;
  const record = author.takesSettled > 0 ? (3 * author.takesWon) / author.takesSettled : 0;
  const score = m.backers * 2 + m.bettors * 3 + Math.log10(dollars + 1) * 4 + record;
  return new BigDecimal(score.toFixed(4));
}

type FeedInput = Pick<FeedItem, "kind" | "actor"> & Partial<Omit<FeedItem, "id" | "timestamp" | "kind" | "actor">>;

export function feed(context: Ctx, event: EventMeta, item: FeedInput) {
  context.FeedItem.set({
    room_id: undefined,
    message_id: undefined,
    market_id: undefined,
    league_id: undefined,
    amount: undefined,
    text: undefined,
    ...item,
    actor: id(item.actor),
    id: `${event.block.number}-${event.logIndex}`,
    timestamp: BigInt(event.block.timestamp),
  });
}

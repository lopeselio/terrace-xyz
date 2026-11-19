/*
 * Terrace Points: rewards for early fans, for playing — not for winning (skill points live on chain in
 * TerraceReputation). Computed by the indexer from on-chain actions, so every point traces to a
 * transaction. Season 0 ("founding fans") doubles everything until SEASON0_END. AI agents don't earn.
 */
import { id, player, type Ctx, type EventMeta } from "./lib";

/** Founding-fan window: everything earned before this counts double (1 Dec 2026, 00:00 UTC, so all of 30 Nov counts). */
export const SEASON0_END = 1796083200;
export const FOUNDING_MULTIPLIER = 2;

export const POINTS = {
  WELCOME: 100n, // first time you do anything on Terrace
  DAILY: 10n, // first action of each day
  STREAK_3: 30n, // three days running
  STREAK_7: 100n, // a week running
  TAKE: 5n, // post a take in a match or league chat (first 10 a day)
  TAKE_BACKED: 5n, // someone backs your take
  BACKED_A_TAKE: 2n, // you back someone's take
  TAKE_LISTED: 25n, // your take becomes a market
  BET: 10n, // place a bet (+1 per dollar staked, up to 25)
  BET_ON_YOUR_TAKE: 5n, // someone else bets on your take
  WIN: 20n, // a bet comes in
  CHALLENGE: 15n, // throw down a 1v1
  CHALLENGE_ACCEPTED: 15n, // take on a mate's 1v1
  CHALLENGE_TAKEN: 25n, // your 1v1 gets taken on
  PARLAY: 5n, // per leg
  LEAGUE_CREATED: 50n,
  LEAGUE_JOINED: 25n,
  LEAGUE_MEMBER: 10n, // someone joins your league
  PICKS: 15n, // submit gameweek picks
  VOTE: 5n,
  PROPOSAL: 10n,
  INVITE: 100n, // a brand-new fan joins through your 1v1 or league
} as const;

export type Reason = keyof typeof POINTS;
const DAILY_TAKE_CAP = 10;

/**
 * Award points to a fan for one action. Call it after the handler's own Player.set, so nothing
 * overwrites the balance. Returns true if this was the fan's first rewarded action (a new fan).
 */
export async function award(context: Ctx, event: EventMeta, address: string, reason: Reason, extra = 0n): Promise<boolean> {
  const p = await player(context, address);
  if (p.isAgent) return false;
  const ts = event.block.timestamp;
  const day = Math.floor(ts / 86_400);
  const lines: [Reason, bigint][] = [];
  const isNew = p.firstSeen === undefined;
  let { lastActiveDay, dayStreak, dayMessages } = p;

  if (isNew) lines.push(["WELCOME", POINTS.WELCOME]);
  if (day !== lastActiveDay) {
    dayStreak = day === lastActiveDay + 1 ? dayStreak + 1 : 1;
    lastActiveDay = day;
    dayMessages = 0;
    lines.push(["DAILY", POINTS.DAILY]);
    if (dayStreak === 3) lines.push(["STREAK_3", POINTS.STREAK_3]);
    if (dayStreak === 7) lines.push(["STREAK_7", POINTS.STREAK_7]);
  }
  if (reason === "TAKE") {
    if (dayMessages < DAILY_TAKE_CAP) lines.push(["TAKE", POINTS.TAKE]);
    dayMessages += 1;
  } else {
    lines.push([reason, POINTS[reason] + extra]);
  }

  const multiplier = ts < SEASON0_END ? FOUNDING_MULTIPLIER : 1;
  let total = 0n;
  for (const [why, base] of lines) {
    const amount = base * BigInt(multiplier);
    total += amount;
    context.PointsEvent.set({
      id: `${event.block.number}-${event.logIndex}-${why}-${id(address)}`,
      player: id(address),
      reason: why,
      base,
      multiplier,
      amount,
      timestamp: BigInt(ts),
    });
  }
  context.Player.set({
    ...p,
    terracePoints: p.terracePoints + total,
    firstSeen: p.firstSeen ?? BigInt(ts),
    lastActiveDay,
    dayStreak,
    dayMessages,
  });
  return isNew;
}

/** A new fan arrived through someone's 1v1 or league: thank the person who brought them. */
export async function invited(context: Ctx, event: EventMeta, inviter: string) {
  await award(context, event, inviter, "INVITE");
  const p = await player(context, inviter);
  context.Player.set({ ...p, invitesLanded: p.invitesLanded + 1 });
}

/** Stake bonus for a bet: one point per whole dollar, up to 25. */
export const stakeBonus = (stake: bigint) => {
  const dollars = stake / 1_000_000n;
  return dollars > 25n ? 25n : dollars;
};

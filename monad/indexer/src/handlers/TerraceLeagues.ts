import { indexer } from "envio";
import { feed, id, type Ctx } from "../lib";

indexer.onEvent({ contract: "TerraceLeagues", event: "LeagueCreated" }, async ({ event, context }) => {
  const p = event.params;
  context.League.set({
    id: id(p.leagueId),
    creator: id(p.creator),
    name: p.name,
    season: Number(p.season),
    gameweeks: Number(p.gameweeks),
    entryFee: p.entryFee,
    isPrivate: p.isPrivate,
    memberCount: 0,
    ended: false,
  });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "LeagueJoined" }, async ({ event, context }) => {
  const p = event.params;
  const league = await context.League.get(id(p.leagueId));
  if (!league) return;
  context.League.set({ ...league, memberCount: league.memberCount + 1 });
  context.LeagueMember.set({
    id: `${league.id}-${id(p.member)}`,
    league_id: league.id,
    member: id(p.member),
    seasonScore: 0,
    joinedAt: BigInt(event.block.timestamp),
  });
  feed(context, event, { kind: "LEAGUE_JOIN", actor: p.member, league_id: league.id, text: league.name });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "ContestCreated" }, async ({ event, context }) => {
  const p = event.params;
  context.Contest.set({
    id: id(p.contestId),
    league_id: p.leagueId === 0n ? undefined : id(p.leagueId),
    gameweek: undefined,
    creator: id(p.creator),
    token: undefined,
    prizePool: p.prizePool,
    entryFee: p.entryFee,
    lockTime: p.lockTime,
    isSealed: p.sealed_,
    entrants: 0,
    finalized: false,
    topScore: undefined,
    winners: undefined,
  });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "GameweekAdded" }, async ({ event, context }) => {
  const c = await context.Contest.get(id(event.params.contestId));
  if (c) context.Contest.set({ ...c, gameweek: Number(event.params.gameweek) });
});

async function enter(context: Ctx, contestId: bigint, playerAddr: string, sealed: boolean, at: number) {
  const entryId = `${id(contestId)}-${id(playerAddr)}`;
  if (await context.Entry.get(entryId)) return; // re-submissions don't count twice
  context.Entry.set({ id: entryId, contest_id: id(contestId), player: id(playerAddr), isSealed: sealed, revealed: !sealed, enteredAt: BigInt(at) });
  const c = await context.Contest.get(id(contestId));
  if (c) context.Contest.set({ ...c, entrants: c.entrants + 1 });
}

indexer.onEvent({ contract: "TerraceLeagues", event: "PicksSubmitted" }, async ({ event, context }) => {
  await enter(context, event.params.contestId, event.params.player, false, event.block.timestamp);
});

indexer.onEvent({ contract: "TerraceLeagues", event: "SealedPicksSubmitted" }, async ({ event, context }) => {
  await enter(context, event.params.contestId, event.params.player, true, event.block.timestamp);
});

indexer.onEvent({ contract: "TerraceLeagues", event: "PicksRevealed" }, async ({ event, context }) => {
  const e = await context.Entry.get(`${id(event.params.contestId)}-${id(event.params.player)}`);
  if (e) context.Entry.set({ ...e, revealed: event.params.valid });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "ContestFinalized" }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.Contest.get(id(p.contestId));
  if (!c) return;
  context.Contest.set({ ...c, finalized: true, topScore: Number(p.topScore), winners: p.winners.map((w) => id(w)) });
  // Per-member scores aren't emitted; the app reads contestScore / seasonScore from the contract.
});

indexer.onEvent({ contract: "TerraceLeagues", event: "MarketWinCounted" }, async ({ event, context }) => {
  const p = event.params;
  const m = await context.LeagueMember.get(`${id(p.leagueId)}-${id(p.member)}`);
  if (m) context.LeagueMember.set({ ...m, seasonScore: Number(p.seasonScore) });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "TakeFeatured" }, async ({ event, context }) => {
  feed(context, event, { kind: "FEATURED", actor: "governance", league_id: id(event.params.leagueId), market_id: id(event.params.marketId) });
});

indexer.onEvent({ contract: "TerraceLeagues", event: "SeasonEnded" }, async ({ event, context }) => {
  const league = await context.League.get(id(event.params.leagueId));
  if (league) context.League.set({ ...league, ended: true });
});

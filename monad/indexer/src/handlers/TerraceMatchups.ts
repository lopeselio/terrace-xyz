import { indexer } from "envio";
import { feed, id } from "../lib";

indexer.onEvent({ contract: "TerraceMatchups", event: "MatchupCreated" }, async ({ event, context }) => {
  const p = event.params;
  const open = p.opponent === "0x0000000000000000000000000000000000000000";
  context.Matchup.set({
    id: id(p.matchupId),
    challenger: id(p.challenger),
    opponent: open ? undefined : id(p.opponent),
    question_id: id(p.questionId),
    challengerSide: Number(p.challengerSide),
    token: id(p.token),
    stake: p.stake,
    status: 0,
    winner: undefined,
    createdAt: BigInt(event.block.timestamp),
  });
  feed(context, event, { kind: "CHALLENGE", actor: p.challenger, amount: p.stake, text: open ? "open" : id(p.opponent) });
});

indexer.onEvent({ contract: "TerraceMatchups", event: "MatchupAccepted" }, async ({ event, context }) => {
  const m = await context.Matchup.get(id(event.params.matchupId));
  if (m) context.Matchup.set({ ...m, opponent: id(event.params.opponent), status: 1 });
});

indexer.onEvent({ contract: "TerraceMatchups", event: "MatchupCalledOff" }, async ({ event, context }) => {
  const m = await context.Matchup.get(id(event.params.matchupId));
  if (m) context.Matchup.set({ ...m, status: Number(event.params.status) });
});

indexer.onEvent({ contract: "TerraceMatchups", event: "MatchupRefunded" }, async ({ event, context }) => {
  const m = await context.Matchup.get(id(event.params.matchupId));
  if (m) context.Matchup.set({ ...m, status: 5 });
});

indexer.onEvent({ contract: "TerraceMatchups", event: "MatchupSettled" }, async ({ event, context }) => {
  const m = await context.Matchup.get(id(event.params.matchupId));
  if (!m) return;
  context.Matchup.set({ ...m, status: 4, winner: id(event.params.winner) });
  feed(context, event, { kind: "CHALLENGE_WON", actor: event.params.winner, amount: event.params.payout });
});

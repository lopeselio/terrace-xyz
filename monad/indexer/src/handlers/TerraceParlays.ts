import { indexer } from "envio";
import { feed, id } from "../lib";
import { award } from "../points";

indexer.onEvent({ contract: "TerraceParlays", event: "ParlayPlaced" }, async ({ event, context }) => {
  const p = event.params;
  context.Parlay.set({
    id: id(p.parlayId),
    player: id(p.player),
    token: id(p.token),
    stake: p.stake,
    legs: Number(p.legs),
    potId: p.potId,
    status: 0,
    liveLegs: 0,
    payout: undefined,
  });
  feed(context, event, { kind: "ACCA", actor: p.player, amount: p.stake, text: `${p.legs}-fold` });
  await award(context, event, p.player, "PARLAY", 5n * (BigInt(p.legs) - 1n));
});

indexer.onEvent({ contract: "TerraceParlays", event: "ParlaySettled" }, async ({ event, context }) => {
  const parlay = await context.Parlay.get(id(event.params.parlayId));
  if (parlay) context.Parlay.set({ ...parlay, status: Number(event.params.status), liveLegs: Number(event.params.liveLegs) });
});

indexer.onEvent({ contract: "TerraceParlays", event: "ParlayPaid" }, async ({ event, context }) => {
  const parlay = await context.Parlay.get(id(event.params.parlayId));
  if (!parlay) return;
  context.Parlay.set({ ...parlay, status: 4, payout: event.params.payout });
  feed(context, event, { kind: "ACCA_WON", actor: event.params.player, amount: event.params.payout, text: `${parlay.legs}-fold` });
});

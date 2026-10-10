import { indexer } from "envio";
import { feed, player } from "../lib";

indexer.onEvent({ contract: "TerraceReputation", event: "ResultRecorded" }, async ({ event, context }) => {
  const p = event.params;
  const pl = await player(context, p.player);
  const results = pl.results + 1;
  const wins = pl.wins + (p.won ? 1 : 0);
  context.Player.set({
    ...pl,
    results,
    wins,
    winRateBps: Math.floor((wins * 10_000) / results),
    streak: Number(p.streak),
    badge: Number(p.badge),
    points: pl.points + p.points,
  });
});

indexer.onEvent({ contract: "TerraceReputation", event: "PredictionsRecorded" }, async ({ event, context }) => {
  const p = event.params;
  const pl = await player(context, p.player);
  context.Player.set({
    ...pl,
    predictions: pl.predictions + Number(p.predictions),
    correctResults: pl.correctResults + Number(p.correctResults),
    exactScores: pl.exactScores + Number(p.exactScores),
    points: pl.points + p.points,
  });
});

indexer.onEvent({ contract: "TerraceReputation", event: "TitleWon" }, async ({ event, context }) => {
  const p = event.params;
  const pl = await player(context, p.player);
  context.Player.set({ ...pl, titles: pl.titles + 1, points: pl.points + p.points });
  feed(context, event, { kind: "TITLE", actor: p.player, amount: p.points, text: Number(p.source) === 4 ? "league" : "contest" });
});

indexer.onEvent({ contract: "TerraceReputation", event: "AgentRegistered" }, async ({ event, context }) => {
  const p = event.params;
  const pl = await player(context, p.agent);
  context.Player.set({ ...pl, isAgent: true, operator: p.operator.toLowerCase(), metadataURI: p.metadataURI });
  feed(context, event, { kind: "AGENT", actor: p.agent, text: p.metadataURI });
});

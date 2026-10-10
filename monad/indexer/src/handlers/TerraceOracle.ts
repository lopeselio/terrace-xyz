import { indexer } from "envio";
import { id } from "../lib";

indexer.onEvent({ contract: "TerraceOracle", event: "FixtureScheduled" }, async ({ event, context }) => {
  const fixtureId = id(event.params.fixtureId);
  const f = await context.Fixture.get(fixtureId);
  context.Fixture.set({
    id: fixtureId,
    kickoff: event.params.kickoff,
    state: f?.state ?? 0,
    homeGoals: f?.homeGoals ?? 0,
    awayGoals: f?.awayGoals ?? 0,
  });
});

indexer.onEvent({ contract: "TerraceOracle", event: "FixtureSettled" }, async ({ event, context }) => {
  const fixtureId = id(event.params.fixtureId);
  const f = await context.Fixture.get(fixtureId);
  context.Fixture.set({
    id: fixtureId,
    kickoff: f?.kickoff ?? 0n,
    state: Number(event.params.state),
    homeGoals: Number(event.params.homeGoals),
    awayGoals: Number(event.params.awayGoals),
  });
});

indexer.onEvent({ contract: "TerraceOracle", event: "QuestionCreated" }, async ({ event, context }) => {
  const p = event.params;
  context.Question.set({
    id: id(p.questionId),
    fixture_id: p.fixtureId === 0n ? undefined : id(p.fixtureId),
    kind: Number(p.kind),
    line: Number(p.line),
    closeTime: p.closeTime,
    creator: id(p.creator),
    text: p.text,
    spec: undefined,
    answer: 0,
  });
});

indexer.onEvent({ contract: "TerraceOracle", event: "QuestionSpec" }, async ({ event, context }) => {
  const q = await context.Question.get(id(event.params.questionId));
  if (!q) return;
  context.Question.set({ ...q, spec: Buffer.from(event.params.spec.slice(2), "hex").toString("utf8") });
});

indexer.onEvent({ contract: "TerraceOracle", event: "QuestionAnswered" }, async ({ event, context }) => {
  const q = await context.Question.get(id(event.params.questionId));
  if (!q) return;
  context.Question.set({ ...q, answer: Number(event.params.answer) });
});

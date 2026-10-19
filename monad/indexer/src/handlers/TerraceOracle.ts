import { indexer } from "envio";
import { id } from "../lib";

/*
 * Standard questions (1X2, over goals, both teams score) are never answered by a report: TerraceOracle
 * derives them from the fixture result in outcomeOf(). Mirror that here so the app sees them settle.
 * Answers: 0 open, 1 yes, 2 no, 3 void. Fixture state: 0 awaiting, 1 final, 2 void.
 */
export function standardAnswer(kind: number, line: number, f: { state: number; homeGoals: number; awayGoals: number }) {
  if (kind === 0 || f.state === 0) return 0;
  if (f.state === 2) return 3;
  const h = f.homeGoals, a = f.awayGoals;
  const yes = kind === 1 ? h > a : kind === 2 ? h === a : kind === 3 ? a > h : kind === 4 ? h + a > line : h > 0 && a > 0;
  return yes ? 1 : 2;
}

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
  const settled = {
    id: fixtureId,
    kickoff: f?.kickoff ?? 0n,
    state: Number(event.params.state),
    homeGoals: Number(event.params.homeGoals),
    awayGoals: Number(event.params.awayGoals),
  };
  context.Fixture.set(settled);
  for (const q of await context.Question.getWhere({ fixture_id: { _eq: fixtureId } })) {
    if (q.kind !== 0) context.Question.set({ ...q, answer: standardAnswer(q.kind, q.line, settled) });
  }
});

indexer.onEvent({ contract: "TerraceOracle", event: "QuestionCreated" }, async ({ event, context }) => {
  const p = event.params;
  // A standard question opened after its match settled is answered straight away.
  const f = p.fixtureId === 0n ? undefined : await context.Fixture.get(id(p.fixtureId));
  context.Question.set({
    id: id(p.questionId),
    fixture_id: p.fixtureId === 0n ? undefined : id(p.fixtureId),
    kind: Number(p.kind),
    line: Number(p.line),
    closeTime: p.closeTime,
    creator: id(p.creator),
    text: p.text,
    spec: undefined,
    answer: f ? standardAnswer(Number(p.kind), Number(p.line), f) : 0,
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

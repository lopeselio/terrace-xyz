import { indexer } from "envio";
import { feed, id } from "../lib";

indexer.onEvent({ contract: "TerraceGovernance", event: "Proposed" }, async ({ event, context }) => {
  const p = event.params;
  context.Proposal.set({
    id: id(p.proposalId),
    league_id: id(p.leagueId),
    proposer: id(p.proposer),
    kind: Number(p.kind),
    payload: p.payload,
    deadline: p.deadline,
    yes: 0,
    no: 0,
    status: 0,
  });
  feed(context, event, { kind: "PROPOSAL", actor: p.proposer, league_id: id(p.leagueId), text: Number(p.kind) === 0 ? "gameweek" : "feature take" });
});

indexer.onEvent({ contract: "TerraceGovernance", event: "Voted" }, async ({ event, context }) => {
  const prop = await context.Proposal.get(id(event.params.proposalId));
  if (prop) context.Proposal.set({ ...prop, yes: Number(event.params.yes), no: Number(event.params.no) });
});

indexer.onEvent({ contract: "TerraceGovernance", event: "Resolved" }, async ({ event, context }) => {
  const prop = await context.Proposal.get(id(event.params.proposalId));
  if (prop) context.Proposal.set({ ...prop, status: Number(event.params.status) });
});

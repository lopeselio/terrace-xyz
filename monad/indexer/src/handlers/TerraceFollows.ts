import { indexer } from "envio";
import { id, player } from "../lib";

indexer.onEvent({ contract: "TerraceFollows", event: "Followed" }, async ({ event, context }) => {
  const follower = id(event.params.follower);
  const followee = id(event.params.followee);
  const key = `${follower}-${followee}`;
  const was = await context.Follow.get(key);
  if (was?.active) return;
  context.Follow.set({ id: key, follower, followee, active: true, since: BigInt(event.block.timestamp) });
  const a = await player(context, follower);
  context.Player.set({ ...a, following: a.following + 1 });
  const b = await player(context, followee);
  context.Player.set({ ...b, followers: b.followers + 1 });
});

indexer.onEvent({ contract: "TerraceFollows", event: "Unfollowed" }, async ({ event, context }) => {
  const follower = id(event.params.follower);
  const followee = id(event.params.followee);
  const was = await context.Follow.get(`${follower}-${followee}`);
  if (!was?.active) return;
  context.Follow.set({ ...was, active: false });
  const a = await player(context, follower);
  context.Player.set({ ...a, following: Math.max(0, a.following - 1) });
  const b = await player(context, followee);
  context.Player.set({ ...b, followers: Math.max(0, b.followers - 1) });
});

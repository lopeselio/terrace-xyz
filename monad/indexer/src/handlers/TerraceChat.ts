import { BigDecimal, indexer } from "envio";
import { feed, heat, id, player, roomKey } from "../lib";
import { award } from "../points";

indexer.onEvent({ contract: "TerraceChat", event: "MessagePosted" }, async ({ event, context }) => {
  const p = event.params;
  const roomId = roomKey(p.roomKind, p.roomId);
  const room = (await context.Room.get(roomId)) ?? {
    id: roomId,
    kind: Number(p.roomKind),
    roomId: p.roomId,
    messageCount: 0,
    lastMessageAt: 0n,
  };
  context.Room.set({ ...room, messageCount: room.messageCount + 1, lastMessageAt: BigInt(event.block.timestamp) });

  const author = await player(context, p.author);
  context.Player.set({ ...author, messages: author.messages + 1 });

  const messageId = id(p.messageId);
  context.Message.set({
    id: messageId,
    room_id: roomId,
    author: id(p.author),
    text: p.text,
    replyTo: p.replyTo === 0n ? undefined : id(p.replyTo),
    postedAt: BigInt(event.block.timestamp),
    backers: 0,
    market_id: undefined,
    bettors: 0,
    volume: 0n,
    heat: new BigDecimal(0),
  });
  feed(context, event, { kind: "TAKE", actor: p.author, room_id: roomId, message_id: messageId, text: p.text });
  await award(context, event, p.author, "TAKE");
});

indexer.onEvent({ contract: "TerraceChat", event: "TakeBacked" }, async ({ event, context }) => {
  const m = await context.Message.get(id(event.params.messageId));
  if (!m) return;
  const author = await player(context, m.author);
  const next = { ...m, backers: Number(event.params.backers) };
  context.Message.set({ ...next, heat: heat(next, author) });
  context.Player.set({ ...author, backersReceived: author.backersReceived + 1 });
  await award(context, event, event.params.backer, "BACKED_A_TAKE");
  if (id(event.params.backer) !== m.author) await award(context, event, m.author, "TAKE_BACKED");
});

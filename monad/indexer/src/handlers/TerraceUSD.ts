import { indexer } from "envio";
import { id } from "../lib";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Only mints matter: the onboarding server mints a new fan's first $100, so the first mint is a sign-up. */
indexer.onEvent({ contract: "TerraceUSD", event: "Transfer" }, async ({ event, context }) => {
  if (event.params.from.toLowerCase() !== ZERO) return;
  const fan = id(event.params.to);
  const was = await context.Signup.get(fan);
  if (was) {
    context.Signup.set({ ...was, refills: was.refills + 1, minted: was.minted + event.params.value });
    return;
  }
  context.Signup.set({ id: fan, at: BigInt(event.block.timestamp), refills: 0, minted: event.params.value });
});

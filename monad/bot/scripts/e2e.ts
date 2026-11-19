/*
 * End-to-end check in a real test Telegram group. Walks the whole loop and checks each step:
 *   1. a take posted in the group gets the rule card        (you post: /take <take>)
 *   2. two accounts tap Back it / Fade it and confirm        (on two phones, through the deep links)
 *   3. the bot spots the market and maps it to the chat
 *   4. CRE settles it                                        (only with --broadcast, after a y/N prompt)
 *   5. the result posts in the group with winners by name
 *   6. both fans collect on Terrace                          (on the phones)
 *
 * Needs the bot running (bun src/main.ts) against the same BOT_DB, plus TEST_CHAT_ID.
 *   bun scripts/e2e.ts            # steps 1-3 and 5, waits for you to settle by hand
 *   bun scripts/e2e.ts --broadcast  # also runs the CRE questions workflow (spends testnet gas; asks first)
 */
import { Store } from "../src/store";
import { Terrace } from "../src/terrace";

const chatId = Number(process.env.TEST_CHAT_ID);
if (!chatId) throw new Error("Set TEST_CHAT_ID (the test group's chat id, negative)");
const store = new Store(process.env.BOT_DB ?? "./bot.sqlite");
const terrace = new Terrace(process.env.TERRACE_URL ?? "https://play.terrace.social");
const since = Math.floor(Date.now() / 1000) - 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(label: string, fn: () => Promise<T | null> | T | null, timeoutMin = 30): Promise<T> {
  process.stdout.write(`… ${label}`);
  const end = Date.now() + timeoutMin * 60_000;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return console.log(" ✓"), v;
    await sleep(5_000);
  }
  throw new Error(`timed out: ${label}`);
}

console.log(`1. In the test group, post: /take <a take on a match before kickoff>`);
const take = await until("waiting for the bot's rule card", () => store.unclaimed(since).find((p) => p.chatId === chatId && p.createdAt >= since && p.messageId) ?? null);
console.log(`   "${take.text}" · fixture ${take.fixtureId} · locks ${new Date(take.closeTime * 1000).toISOString()}`);
console.log(`2. Tap Back it on phone A and Fade it on phone B, then confirm each on Terrace.`);
const marketId = await until("waiting for the market to open and map to the chat", () => store.pending(take.token)?.marketId ?? null);
console.log(`   market ${marketId} → chat ${store.chatsOfMarket(marketId).join(", ")}`);
await until("waiting for two fans in", async () => ((await terrace.betsOn([marketId])).length >= 2 ? true : null));

console.log(`3. Settlement stays with Chainlink CRE. After full time run (from monad/cre):`);
console.log(`   cre workflow simulate questions -T staging-settings --non-interactive --trigger-index 0 --broadcast`);
if (process.argv.includes("--broadcast")) {
  process.stdout.write("   Run it now? It broadcasts to Monad testnet and spends test gas. [y/N] ");
  const answer = await new Promise<string>((r) => process.stdin.once("data", (d) => r(String(d).trim())));
  if (answer.toLowerCase() === "y") {
    const p = Bun.spawn(["cre", "workflow", "simulate", "questions", "-T", "staging-settings", "--non-interactive", "--trigger-index", "0", "--broadcast"], { cwd: `${import.meta.dir}/../../cre`, stdout: "inherit", stderr: "inherit" });
    await p.exited;
  }
}
await until("waiting for the result to post in the group", () => (store.marketsOfChat(chatId).find((m) => m.marketId === marketId)?.settledAt ? true : null), 240);
console.log(`4. Collect on both phones (Terrace → Live), then check the group shows the winners by name.`);
process.exit(0);

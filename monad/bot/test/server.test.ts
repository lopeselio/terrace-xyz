import { describe, expect, test } from "bun:test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyMessage } from "viem";
import { createHandler, linkMessage } from "../src/server";
import { Store } from "../src/store";

const cfg = { terraceUrl: "https://play.terrace.social", rpcUrl: "http://unused" };
const verify = (address: `0x${string}`, message: string, signature: `0x${string}`) => verifyMessage({ address, message, signature });

function setup() {
  const s = new Store();
  s.addPending({ token: "tok", chatId: -1, authorTg: 7, authorName: "Dave", text: "Arsenal win", fixtureId: 101, stake: 10, closeTime: 9e9, reading: "r", ruled: true, createdAt: 1 });
  return { s, handle: createHandler(cfg, s, null, verify, () => 100) };
}

describe("/go deep links", () => {
  test("before the market opens: the take sheet, prefilled", async () => {
    const { handle } = setup();
    const r = await handle(new Request("http://bot/go/tok?side=no"));
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get("location")!);
    expect(to.pathname).toBe("/take");
    expect(Object.fromEntries(to.searchParams)).toEqual({ match: "101", text: "Arsenal win", side: "no", stake: "10", via: "group" });
  });
  test("after: the take in its match room, bet sheet up", async () => {
    const { s, handle } = setup();
    s.claim("tok", "42", "7", 2);
    const r = await handle(new Request("http://bot/go/tok?side=yes"));
    expect(r.headers.get("location")).toBe("https://play.terrace.social/m/101?bet=yes&stake=10&via=group#take-7");
  });
  test("unknown takes 404", async () => expect((await setup().handle(new Request("http://bot/go/nope"))).status).toBe(404));
});

describe("/link one-time account link", () => {
  test("links a Terrace account to a Telegram user with a signed one-time code", async () => {
    const { s, handle } = setup();
    const acct = privateKeyToAccount(generatePrivateKey());
    s.newLinkCode("code1", 7, "Dave", 500);
    const post = async (body: unknown) => handle(new Request("http://bot/link", { method: "POST", body: JSON.stringify(body) }));
    const other = privateKeyToAccount(generatePrivateKey());
    expect((await post({ code: "code1", address: acct.address, signature: await other.signMessage({ message: linkMessage("code1") }) })).status).toBe(401);
    const signature = await acct.signMessage({ message: linkMessage("code1") });
    const ok = await post({ code: "code1", address: acct.address, signature });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://play.terrace.social");
    expect(s.linkOf(7)).toEqual({ address: acct.address.toLowerCase(), name: "Dave" });
    expect((await post({ code: "code1", address: acct.address, signature })).status).toBe(410);
  });
});

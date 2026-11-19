/*
 * HTTP side: the Telegram webhook, the /go redirect behind every Back/Fade button, and the one-time
 * account link callback from the Terrace app.
 */
import { webhookCallback, type Bot } from "grammy";
import { createPublicClient, http, isAddress, type Hex } from "viem";
import { betLink, takeLink, type Side } from "./links";
import type { Store } from "./store";

export type ServerConfig = { terraceUrl: string; webhookSecret?: string; rpcUrl: string };
export type Verify = (address: `0x${string}`, message: string, signature: Hex) => Promise<boolean>;

export const linkMessage = (code: string) => `Link my Terrace record to Telegram: ${code}`;

export function viemVerify(rpcUrl: string): Verify {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return (address, message, signature) => client.verifyMessage({ address, message, signature });
}

export function createHandler(cfg: ServerConfig, store: Store, bot: Bot | null, verify: Verify, now = () => Math.floor(Date.now() / 1000)) {
  const hook = bot ? webhookCallback(bot, "std/http", { secretToken: cfg.webhookSecret }) : null;
  const cors = { "access-control-allow-origin": cfg.terraceUrl.replace(/\/+$/, ""), "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/telegram" && req.method === "POST" && hook) return hook(req);

    const go = url.pathname.match(/^\/go\/([\w-]+)$/);
    if (go && req.method === "GET") {
      const p = store.pending(go[1]);
      if (!p) return new Response("That take has gone. Ask the group for a fresh one.", { status: 404 });
      const side: Side = url.searchParams.get("side") === "no" ? "no" : "yes";
      const to = p.marketId && p.takeId
        ? betLink(cfg.terraceUrl, { fixtureId: p.fixtureId, messageId: p.takeId, side, stake: p.stake })
        : takeLink(cfg.terraceUrl, { fixtureId: p.fixtureId, text: p.text, side, stake: p.stake });
      return Response.redirect(to, 302);
    }

    if (url.pathname === "/link") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method !== "POST") return new Response("method", { status: 405 });
      const body = (await req.json().catch(() => ({}))) as { code?: string; address?: string; signature?: Hex };
      const json = (o: unknown, status = 200) => Response.json(o, { status, headers: cors });
      if (!body.code || !body.address || !isAddress(body.address) || !body.signature) return json({ error: "bad_input" }, 400);
      const ok = await verify(body.address, linkMessage(body.code), body.signature).catch(() => false);
      if (!ok) return json({ error: "not_you" }, 401);
      const who = store.useLinkCode(body.code, now());
      if (!who) return json({ error: "expired" }, 410);
      store.link(who.tgUser, body.address, who.name, now());
      return json({ ok: true, name: who.name });
    }
    return new Response("not found", { status: 404 });
  };
}

#!/usr/bin/env node
// MetaMask's RPC proxy rejects Monad testnet, so mm can't build a transaction there. Run this, then
// prefix write commands with MM_INFURA_RPC_BASE_URL=http://127.0.0.1:8547. mm builds RPC URLs as
// <base>/<chainId>/<key>: chain 10143 goes to Monad's RPC, everything else is forwarded unchanged
// to MetaMask's own proxy. Listens on localhost only.
import { createServer } from "node:http";

const MONAD = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const METAMASK = "https://agentic-proxy.workers.cx.metamask.io/infura-service/v1";
const PORT = Number(process.env.PORT ?? 8547);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const chainId = req.url.split("/")[1];
  const target = chainId === "10143" ? MONAD : METAMASK + req.url;
  if (chainId === "10143") {
    try {
      const calls = [].concat(JSON.parse(body.toString() || "[]"));
      console.log(`10143 → Monad: ${calls.map((c) => c.method).join(", ")}`);
    } catch {}
  }
  try {
    const r = await fetch(target, { method: req.method, headers: { "content-type": req.headers["content-type"] ?? "application/json" }, body: req.method === "GET" ? undefined : body });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502).end(String(e));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`relay on http://127.0.0.1:${PORT}`));

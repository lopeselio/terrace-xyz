/**
 * Terrace notification worker — Cloudflare Workers
 *
 * Routes
 *   POST /register  { pubkey, token, following[] }  — upsert device entry
 *   POST /webhook   Helius webhook body              — fan-out push notifications
 *
 * KV namespace DEVICES
 *   key: device:{pubkey}  →  DeviceEntry JSON
 */

export interface Env {
  DEVICES: KVNamespace;
  /** Public HTTPS base URL of this worker, e.g. https://terrace-notifications.xyz.workers.dev */
  WORKER_BASE_URL?: string;
}

interface DeviceEntry {
  token:     string;
  following: string[];
  updatedAt: number;
}

interface ExpoPushMessage {
  to:    string;
  title: string;
  body:  string;
  sound: "default";
  data:  Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/register")
      return cors(await handleRegister(request, env));

    if (request.method === "POST" && url.pathname === "/webhook")
      return cors(await handleWebhook(request, env));

    // GET /m/<matchup-address>  — HTTPS deep-link redirect page
    // Shares as a clickable https:// link in Telegram/WhatsApp/SMS,
    // then JS immediately bounces to terrace://matchup/<address> on device.
    const matchupRedirect = url.pathname.match(/^\/m\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (request.method === "GET" && matchupRedirect) {
      return handleMatchupRedirect(matchupRedirect[1]);
    }

    return cors(new Response("Not found", { status: 404 }));
  },
};

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: { pubkey?: string; token?: string; following?: string[] };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { pubkey, token, following = [] } = body;
  if (!pubkey || !token) return new Response("Missing pubkey or token", { status: 400 });

  const entry: DeviceEntry = { token, following, updatedAt: Date.now() };
  await env.DEVICES.put(`device:${pubkey}`, JSON.stringify(entry), {
    expirationTtl: 60 * 60 * 24 * 90, // 90 days
  });

  return new Response("OK");
}

// ---------------------------------------------------------------------------
// POST /webhook  — Helius enhanced-transaction webhook
// ---------------------------------------------------------------------------

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  let events: any[];
  try {
    const raw = await request.json();
    events = Array.isArray(raw) ? raw : [raw];
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  for (const event of events) {
    const actorPubkey: string | undefined = event.feePayer ?? event.accountData?.[0]?.account;
    if (!actorPubkey) continue;

    // Describe the action from the Helius event type
    const { title, body } = notificationCopy(event, actorPubkey);

    // List all registered devices
    const list = await env.DEVICES.list({ prefix: "device:" });
    const pushBatch: ExpoPushMessage[] = [];

    for (const { name } of list.keys) {
      const raw = await env.DEVICES.get(name);
      if (!raw) continue;

      let entry: DeviceEntry;
      try { entry = JSON.parse(raw); }
      catch { continue; }

      // Only notify followers of the actor, not the actor themselves
      const followerPubkey = name.replace("device:", "");
      if (followerPubkey === actorPubkey) continue;
      if (!entry.following.includes(actorPubkey)) continue;
      if (!entry.token.startsWith("ExponentPushToken[")) continue;

      pushBatch.push({ to: entry.token, title, body, sound: "default", data: { actorPubkey, type: event.type } });
    }

    if (pushBatch.length > 0) {
      // Expo push API accepts up to 100 messages per request
      for (let i = 0; i < pushBatch.length; i += 100) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
          body: JSON.stringify(pushBatch.slice(i, i + 100)),
        });
      }
    }
  }

  return new Response("OK");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /m/:address  — deep link bounce page
// ---------------------------------------------------------------------------

function handleMatchupRedirect(address: string): Response {
  const deepLink = `terrace://matchup/${address}`;
  const short    = `${address.slice(0, 6)}…${address.slice(-4)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Terrace 1v1 Challenge</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0a;color:#f9fafb;font-family:-apple-system,sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;padding:32px;text-align:center;gap:20px}
    h1{font-size:28px;font-weight:800}
    p{font-size:15px;color:#9ca3af;line-height:1.6}
    .addr{font-family:monospace;font-size:12px;color:#6b7280}
    a.btn{display:inline-block;background:#22c55e;color:#000;font-weight:700;
          font-size:17px;padding:16px 40px;border-radius:16px;text-decoration:none;
          margin-top:8px}
    .note{font-size:12px;color:#4b5563;margin-top:8px}
  </style>
</head>
<body>
  <div style="font-size:52px">⚔️</div>
  <h1>You've been challenged!</h1>
  <p>Someone issued you a 1v1 matchup on Terrace.<br/>Open the app to accept or decline.</p>
  <p class="addr">${short}</p>
  <a class="btn" href="${deepLink}">Open in Terrace</a>
  <p class="note">Requires the Terrace app to be installed.</p>
  <script>
    // Auto-bounce to the app. If the scheme fires, the browser will background.
    setTimeout(function(){ window.location.href = "${deepLink}"; }, 400);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

function notificationCopy(event: any, actorPubkey: string): { title: string; body: string } {
  const short = `${actorPubkey.slice(0, 5)}…${actorPubkey.slice(-4)}`;
  const type: string = event.type ?? "";

  if (type.includes("SWAP") || type.includes("BET"))
    return { title: "🎯 New bet placed", body: `${short} just backed a market on Terrace` };
  if (type.includes("CREATE"))
    return { title: "🏗️ New market created", body: `${short} opened a new prediction market` };

  return { title: "⚡ Activity from someone you follow", body: `${short} did something on Terrace` };
}

function cors(response: Response): Response {
  const r = new Response(response.body, response);
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return r;
}

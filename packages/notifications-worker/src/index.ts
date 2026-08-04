/**
 * Terrace notification worker — Cloudflare Workers
 *
 * Routes
 *   POST /register         { pubkey, token, following[] }     — upsert device entry
 *   POST /webhook          Helius webhook body                — fan-out follow-graph pushes
 *   POST /league-register  { pubkey, leagues[] }              — upsert league membership index
 *   POST /league-event     { leagueAddress, actorPubkey, kind, payload? } — fan-out to league-mates
 *
 * KV namespace DEVICES
 *   key: device:{pubkey}              →  DeviceEntry JSON
 *   key: member_leagues:{pubkey}      →  string[]  (leagues the user belongs to)
 *   key: league_members:{leagueAddr}  →  string[]  (member pubkeys in the league)
 */

export interface Env {
  DEVICES: KVNamespace;
  /** api-football key. Held here so devices don't each burn their own quota. */
  API_FOOTBALL_KEY?: string;
  /** Anthropic key for the market-statement validator. Never reaches a device. */
  ANTHROPIC_API_KEY?: string;
  /** Public HTTPS base URL of this worker, e.g. https://terrace-notifications.xyz.workers.dev */
  WORKER_BASE_URL?: string;
  /** Telegram bot token — used to DM users when their wallet is successfully linked */
  TELEGRAM_BOT_TOKEN?: string;
  /** Shared secret between the bot server and this worker — required for internal API calls */
  WORKER_SECRET?: string;
}

// KV key namespaces (all stored in DEVICES namespace):
//   link_token:{uuid}  → LinkToken JSON  (TTL 15 min)
//   tg_wallet:{userId} → { pubkey, linkedAt }
//   wallet_tg:{pubkey} → { tgUserId, username }

interface LinkToken {
  tgUserId:   string;
  tgUsername: string;
  expiresAt:  number; // ms epoch
  used:       boolean;
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

    if (request.method === "POST" && url.pathname === "/league-register")
      return cors(await handleLeagueRegister(request, env));

    if (request.method === "POST" && url.pathname === "/league-event")
      return cors(await handleLeagueEvent(request, env));

    if (request.method === "POST" && url.pathname === "/league-event-broadcast")
      return cors(await handleLeagueEventBroadcast(request, env));

    // GET /football/*  — cached api-football proxy (see handleFootballProxy)
    if (request.method === "GET" && url.pathname.startsWith("/football/"))
      return cors(await handleFootballProxy(request, url, env));

    // POST /validate-market  { question } — Claude statement validator
    if (request.method === "POST" && url.pathname === "/validate-market")
      return cors(await handleValidateMarket(request, env));

    const ua = request.headers.get("User-Agent") ?? "";

    // GET /m/<matchup-address>  — HTTPS deep-link redirect page
    const matchupRedirect = url.pathname.match(/^\/m\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (request.method === "GET" && matchupRedirect) {
      return handleMatchupRedirect(matchupRedirect[1], ua, request.url);
    }

    // GET /link/<token>  — wallet linking bounce page → terrace://link/<token>
    // Wide regex: accept any alphanumeric+hyphen token (10–100 chars) to avoid
    // case or format surprises from crypto.randomUUID() across environments
    const linkRedirect = url.pathname.match(/^\/link\/([a-zA-Z0-9_-]{10,100})$/);
    if (request.method === "GET" && linkRedirect) {
      return handleLinkRedirect(linkRedirect[1], ua, request.url);
    }

    // POST /link/verify  { token, pubkey }  — called by the Terrace app after user confirms
    if (request.method === "POST" && url.pathname === "/link/verify")
      return cors(await handleLinkVerify(request, env));

    // Internal API — protected by X-Worker-Secret header
    if (!checkSecret(request, env))
      return cors(new Response("Unauthorized", { status: 401 }));

    // POST /api/link-token  { tgUserId, tgUsername }  → { token }
    if (request.method === "POST" && url.pathname === "/api/link-token")
      return cors(await handleCreateLinkToken(request, env));

    // POST /api/link-wallet  { tgUserId, tgUsername, pubkey }  — direct link (no token/deep-link)
    if (request.method === "POST" && url.pathname === "/api/link-wallet")
      return cors(await handleDirectLinkWallet(request, env));

    // GET /api/wallet/tg/:userId  → { pubkey }
    const walletByTg = url.pathname.match(/^\/api\/wallet\/tg\/(.+)$/);
    if (request.method === "GET" && walletByTg)
      return cors(await handleGetWalletByTg(walletByTg[1], env));

    // GET /api/wallet/pubkey/:pubkey  → { tgUserId, username }
    const walletByPubkey = url.pathname.match(/^\/api\/wallet\/pubkey\/(.+)$/);
    if (request.method === "GET" && walletByPubkey)
      return cors(await handleGetTgByPubkey(walletByPubkey[1], env));

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
// GET /football/*  — api-football proxy with a shared cache
//
// The free tier allows 100 requests/day. Called from the device that budget is
// per-install, so ten testers on a matchday exhaust ten separate allowances and
// the live board freezes for all of them. Behind the worker there is one key
// and one cache: the tenth device asking for the live board in a given 20
// seconds is served the first device's response and costs nothing upstream.
//
// The key never reaches the client. Paths are allowlisted rather than open
// proxied, so this can't be turned into a general-purpose relay for someone
// else's api-football usage.
//
// Cached in KV rather than the Cache API. The Cache API is the obvious tool and
// it silently does nothing on a *.workers.dev hostname — it only stores for
// custom domains inside a zone — so every request was a MISS and the proxy was
// a pass-through that happened to hide the key. KV works on workers.dev, at the
// cost of a 60s floor on every TTL.
// ---------------------------------------------------------------------------

const FOOTBALL_BASE = "https://v3.football.api-sports.io";

const FOOTBALL_PATHS = new Set(["fixtures", "standings", "predictions", "teams", "leagues"]);

/**
 * A ceiling on what this key spends upstream in a day, counted in KV.
 *
 * The free plan allows 100. The per-device cap in the app can't protect the
 * account — it only knows what that install spent — so the limit belongs here,
 * where the key is. 90 leaves headroom for checking the account by hand.
 *
 * KV reads are eventually consistent, so two requests landing together can both
 * read the same count and each write count+1 — the tally undercounts slightly
 * under burst. That's acceptable for a guardrail with ten spare requests of
 * headroom; an exact counter would need a Durable Object.
 */
const FOOTBALL_DAILY_BUDGET = 90;

/**
 * How long a response stays fresh. Live scores go stale in seconds; a fixture
 * list for tomorrow barely moves, and re-fetching it is the waste that starves
 * the live board.
 */
function footballTtl(params: URLSearchParams): number {
  // 60 is KV's minimum expirationTtl, and also the app's live poll interval —
  // scores are at most one poll stale, which is what they'd be anyway.
  if (params.has("live")) return 60;
  const date = params.get("date");
  if (date) {
    const today = new Date().toISOString().slice(0, 10);
    // Today's card changes as matches kick off and finish; a future date is
    // just a schedule and holds for hours.
    return date > today ? 21_600 : 600;
  }
  return 300;
}

/** Upstream spend so far today, and the key it's counted under. */
async function footballSpend(env: Env): Promise<{ key: string; spent: number }> {
  const key = `football_budget:${new Date().toISOString().slice(0, 10)}`;
  const raw = await env.DEVICES.get(key);
  return { key, spent: raw ? Number(raw) || 0 : 0 };
}

async function handleFootballProxy(request: Request, url: URL, env: Env): Promise<Response> {
  if (!env.API_FOOTBALL_KEY) {
    return json({ error: "Football proxy not configured" }, 503);
  }

  const path = url.pathname.slice("/football/".length).replace(/^\/+|\/+$/g, "");
  if (!FOOTBALL_PATHS.has(path.split("/")[0])) {
    return json({ error: `Unsupported path: ${path}` }, 400);
  }

  const upstream = `${FOOTBALL_BASE}/${path}${url.search}`;
  const ttl = footballTtl(url.searchParams);

  // Keyed on the upstream URL, not the incoming one, so two clients spelling
  // the same query differently still share an entry.
  const cacheKey = `football_cache:${upstream}`;

  const hit = await env.DEVICES.get(cacheKey);
  if (hit) {
    return new Response(hit, {
      headers: { "Content-Type": "application/json", "X-Terrace-Cache": "HIT" },
    });
  }

  // Every cache miss is real money on a 100/day plan, so the budget is checked
  // here rather than after the fact.
  const { key: budgetKey, spent } = await footballSpend(env);
  if (spent >= FOOTBALL_DAILY_BUDGET) {
    // Shaped like the provider's own quota error: the app already treats that
    // as authoritative and freezes the last snapshot rather than blanking.
    return json({ errors: { requests: "Daily request limit reached (proxy budget)" } }, 429);
  }

  const res = await fetch(upstream, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
  const body = await res.text();

  await env.DEVICES.put(budgetKey, String(spent + 1), { expirationTtl: 60 * 60 * 48 });

  const out = new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl}`,
      "X-Terrace-Cache": "MISS",
      "X-Terrace-Budget": `${spent + 1}/${FOOTBALL_DAILY_BUDGET}`,
      // Passed through so the app can show how much of the day's allowance is
      // left instead of guessing from a local counter.
      "X-RateLimit-Requests-Remaining":
        res.headers.get("x-ratelimit-requests-remaining") ?? "",
    },
  });

  // api-football answers a plan violation with HTTP 200 and an `errors` object,
  // so status alone isn't enough. A clean response is held for its full TTL;
  // a refusal is held only briefly — long enough to stop retries hammering the
  // quota inside the per-minute limit, short enough that a passing rate limit
  // or a plan upgrade isn't remembered.
  if (res.ok) {
    const clean = !hasApiErrors(body);
    await env.DEVICES.put(cacheKey, body, {
      expirationTtl: clean ? ttl : ERROR_TTL,
    });
  }
  return out;
}

/** KV's floor, and long enough to stop a retry loop spending the day's budget. */
const ERROR_TTL = 60;

/** True when api-football reported an error inside a 200 response. */
function hasApiErrors(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    const errors = parsed.errors;
    if (!errors) return false;
    if (Array.isArray(errors)) return errors.length > 0;
    return typeof errors === "object" && Object.keys(errors as object).length > 0;
  } catch {
    return true; // unparseable is not something to cache either
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// POST /validate-market  { question } — is this statement settleable?
//
// A market whose wording can't be checked against the final score is a dispute
// waiting to happen: "Will Arsenal play well?" has no answer anyone can point
// at, and the creator finds out only when it's time to settle. Catching that at
// creation is cheaper than arbitrating it afterwards.
//
// Runs here rather than on the device for the same reason as the football key:
// an EXPO_PUBLIC_ Anthropic key is a key every install carries and anyone can
// extract. Identical drafts are cached, and the whole thing is bounded by a
// daily ceiling — a validator that quietly runs up a bill is worse than one
// that stops.
// ---------------------------------------------------------------------------

/** Bounded classification with a couple of rewrites — 1024 is ample. */
const VALIDATOR_MAX_TOKENS = 1024;

/** Cheapest model that does this well; one constant so switching is one line. */
const VALIDATOR_MODEL = "claude-haiku-4-5";

/** Ceiling on validator calls per day. Well past a beta cohort's creation rate. */
const VALIDATOR_DAILY_BUDGET = 500;

/** Identical drafts are common — people retype and resubmit. */
const VALIDATOR_CACHE_TTL = 3_600;

const VALIDATOR_SYSTEM = `You judge whether a prediction-market question can be settled objectively.

A question is settleable when a neutral person, looking only at the final score, official match record, or a named public source, would reach the same verdict as everyone else. Judge only the wording — not whether the outcome is likely, and not whether the market is interesting.

verifiable — one unambiguous answer once the event is over. "Arsenal to beat Chelsea", "Over 2.5 goals in Arsenal v Chelsea", "Haaland to score first".
ambiguous — the subject is real but the wording leaves room to argue: no deadline, a vague threshold, or a term with more than one reading. "Arsenal to win soon", "Salah to have a big game".
unverifiable — nothing public would ever settle it: private information, unfalsifiable claims, or pure opinion. "Arteta to regret his team talk", "Arsenal to play the better football".

Write suggestions as complete replacement questions in the user's own voice, keeping their intent and their teams — not instructions about how to fix it. Give two or three for ambiguous or unverifiable, and none for verifiable. Keep the reason to one short sentence addressed to the creator.`;

const VALIDATOR_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["verifiable", "ambiguous", "unverifiable"] },
    reason: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "reason", "suggestions"],
  additionalProperties: false,
} as const;

async function handleValidateMarket(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    // Not an error: the app treats a missing validator as "no opinion" and
    // market creation carries on unchanged.
    return json({ error: "Validator not configured" }, 503);
  }

  let body: { question?: string };
  try { body = await request.json(); }
  catch { return json({ error: "Bad JSON" }, 400); }

  const question = (body.question ?? "").trim();
  if (question.length < 8) return json({ error: "Question too short to judge" }, 400);
  if (question.length > 500) return json({ error: "Question too long" }, 400);

  const cacheKey = `validator_cache:${await sha256(question.toLowerCase())}`;
  const hit = await env.DEVICES.get(cacheKey);
  if (hit) {
    return new Response(hit, {
      headers: { "Content-Type": "application/json", "X-Terrace-Cache": "HIT" },
    });
  }

  const budgetKey = `validator_budget:${new Date().toISOString().slice(0, 10)}`;
  const spent = Number(await env.DEVICES.get(budgetKey)) || 0;
  if (spent >= VALIDATOR_DAILY_BUDGET) {
    return json({ error: "Daily validator budget reached" }, 429);
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: VALIDATOR_MODEL,
      max_tokens: VALIDATOR_MAX_TOKENS,
      system: VALIDATOR_SYSTEM,
      // The schema is enforced by the API rather than coaxed by the prompt, so
      // a malformed verdict can't reach the client.
      output_config: { format: { type: "json_schema", schema: VALIDATOR_SCHEMA } },
      messages: [{ role: "user", content: question }],
    });

    await env.DEVICES.put(budgetKey, String(spent + 1), { expirationTtl: 60 * 60 * 48 });

    if (message.stop_reason === "refusal") {
      return json({ error: "Validator declined this statement" }, 422);
    }

    const text = message.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Empty validator response" }, 502);

    // Re-parsed rather than passed through so a bad payload fails here, on the
    // server, instead of rendering as a broken badge on the card.
    const parsed = JSON.parse(text.text) as {
      verdict: string; reason: string; suggestions: string[];
    };
    const payload = JSON.stringify({
      verdict: parsed.verdict,
      reason: parsed.reason,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
    });

    await env.DEVICES.put(cacheKey, payload, { expirationTtl: VALIDATOR_CACHE_TTL });
    return new Response(payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Terrace-Cache": "MISS",
        "X-Terrace-Budget": `${spent + 1}/${VALIDATOR_DAILY_BUDGET}`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Validator failed: ${msg}` }, 502);
  }
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// POST /league-register  { pubkey, leagues[] }  — replaces membership list
// ---------------------------------------------------------------------------

async function handleLeagueRegister(request: Request, env: Env): Promise<Response> {
  let body: { pubkey?: string; leagues?: string[] };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { pubkey, leagues } = body;
  if (!pubkey || !Array.isArray(leagues)) {
    return new Response("Missing pubkey or leagues", { status: 400 });
  }
  if (pubkey.length < 32 || pubkey.length > 44) {
    return new Response("Invalid pubkey length", { status: 400 });
  }

  // Diff against previously-registered set so we can remove the user from
  // league_members entries they no longer belong to.
  const prevRaw = await env.DEVICES.get(`member_leagues:${pubkey}`);
  const prev: string[] = prevRaw ? safeArr(prevRaw) : [];
  const next = Array.from(new Set(leagues.filter((l) => typeof l === "string" && l.length >= 32)));

  const removed = prev.filter((l) => !next.includes(l));
  const added   = next.filter((l) => !prev.includes(l));

  for (const leagueAddr of added) {
    const memRaw = await env.DEVICES.get(`league_members:${leagueAddr}`);
    const members: string[] = memRaw ? safeArr(memRaw) : [];
    if (!members.includes(pubkey)) {
      members.push(pubkey);
      await env.DEVICES.put(`league_members:${leagueAddr}`, JSON.stringify(members), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    }
  }
  for (const leagueAddr of removed) {
    const memRaw = await env.DEVICES.get(`league_members:${leagueAddr}`);
    if (!memRaw) continue;
    const members: string[] = safeArr(memRaw).filter((m) => m !== pubkey);
    if (members.length === 0) {
      await env.DEVICES.delete(`league_members:${leagueAddr}`);
    } else {
      await env.DEVICES.put(`league_members:${leagueAddr}`, JSON.stringify(members), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    }
  }

  await env.DEVICES.put(`member_leagues:${pubkey}`, JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 365,
  });

  return new Response(JSON.stringify({ ok: true, count: next.length }), {
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// POST /league-event  { leagueAddress, actorPubkey, kind, payload? }
// ---------------------------------------------------------------------------

type LeagueEventKind =
  | "join"           // a new member joined
  | "win"            // actor recorded a league win
  | "advance"        // gameweek advanced
  | "reveal"         // actor revealed their GW score
  | "market_create"; // actor created a market

async function handleLeagueEvent(request: Request, env: Env): Promise<Response> {
  let body: {
    leagueAddress?: string;
    actorPubkey?: string;
    kind?: LeagueEventKind;
    payload?: Record<string, unknown>;
  };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { leagueAddress, actorPubkey, kind, payload = {} } = body;
  if (!leagueAddress || !actorPubkey || !kind) {
    return new Response("Missing leagueAddress / actorPubkey / kind", { status: 400 });
  }

  const memRaw = await env.DEVICES.get(`league_members:${leagueAddress}`);
  if (!memRaw) return new Response(JSON.stringify({ delivered: 0 }), {
    headers: { "Content-Type": "application/json" },
  });
  const members: string[] = safeArr(memRaw);

  const { title, body: pushBody } = leagueEventCopy(kind, actorPubkey, payload);
  const pushBatch: ExpoPushMessage[] = [];

  for (const member of members) {
    if (member === actorPubkey) continue; // don't ping the actor
    const deviceRaw = await env.DEVICES.get(`device:${member}`);
    if (!deviceRaw) continue;
    let entry: DeviceEntry;
    try { entry = JSON.parse(deviceRaw); }
    catch { continue; }
    if (!entry.token.startsWith("ExponentPushToken[")) continue;

    pushBatch.push({
      to: entry.token,
      title,
      body: pushBody,
      sound: "default",
      data: {
        terraceKind: "league_event",
        leagueAddress,
        actorPubkey,
        kind,
        ...payload,
      },
    });
  }

  if (pushBatch.length > 0) {
    for (let i = 0; i < pushBatch.length; i += 100) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
        body: JSON.stringify(pushBatch.slice(i, i + 100)),
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ delivered: pushBatch.length }), {
    headers: { "Content-Type": "application/json" },
  });
}

// Broadcast a league event to every league the actor belongs to. Used for
// "market_create" where the app doesn't carry the actor's league list.
async function handleLeagueEventBroadcast(request: Request, env: Env): Promise<Response> {
  let body: {
    actorPubkey?: string;
    kind?: LeagueEventKind;
    payload?: Record<string, unknown>;
  };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { actorPubkey, kind, payload = {} } = body;
  if (!actorPubkey || !kind) {
    return new Response("Missing actorPubkey / kind", { status: 400 });
  }

  const leaguesRaw = await env.DEVICES.get(`member_leagues:${actorPubkey}`);
  const leagues = leaguesRaw ? safeArr(leaguesRaw) : [];
  if (leagues.length === 0) {
    return new Response(JSON.stringify({ delivered: 0, leagues: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalDelivered = 0;
  for (const leagueAddress of leagues) {
    const memRaw = await env.DEVICES.get(`league_members:${leagueAddress}`);
    if (!memRaw) continue;
    const members: string[] = safeArr(memRaw);
    const { title, body: pushBody } = leagueEventCopy(kind, actorPubkey, payload);
    const pushBatch: ExpoPushMessage[] = [];
    for (const member of members) {
      if (member === actorPubkey) continue;
      const deviceRaw = await env.DEVICES.get(`device:${member}`);
      if (!deviceRaw) continue;
      let entry: DeviceEntry;
      try { entry = JSON.parse(deviceRaw); }
      catch { continue; }
      if (!entry.token.startsWith("ExponentPushToken[")) continue;
      pushBatch.push({
        to: entry.token,
        title,
        body: pushBody,
        sound: "default",
        data: {
          terraceKind: "league_event",
          leagueAddress,
          actorPubkey,
          kind,
          ...payload,
        },
      });
    }
    if (pushBatch.length > 0) {
      for (let i = 0; i < pushBatch.length; i += 100) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
          body: JSON.stringify(pushBatch.slice(i, i + 100)),
        }).catch(() => {});
      }
      totalDelivered += pushBatch.length;
    }
  }

  return new Response(JSON.stringify({ delivered: totalDelivered, leagues: leagues.length }), {
    headers: { "Content-Type": "application/json" },
  });
}

function leagueEventCopy(
  kind: LeagueEventKind,
  actor: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  const short = `${actor.slice(0, 5)}…${actor.slice(-4)}`;
  const leagueName = (payload.leagueName as string) || "your league";
  switch (kind) {
    case "join":
      return { title: "👋 New rival in the league", body: `${short} just joined ${leagueName}` };
    case "win":
      return { title: "🎯 League point scored", body: `${short} cashed a bet in ${leagueName}` };
    case "advance":
      return { title: "📅 Gameweek advanced", body: `${leagueName} is now in GW${payload.gameweek ?? "?"} — reveal your score` };
    case "reveal":
      return { title: "🔓 Score revealed", body: `${short} revealed their score in ${leagueName}` };
    case "market_create":
      return { title: "🏗️ New market in your league", body: `${short} opened a market for ${leagueName} to back` };
    default:
      return { title: "⚡ League activity", body: `${short} did something in ${leagueName}` };
  }
}

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /m/:address  — deep link bounce page
// ---------------------------------------------------------------------------

function handleMatchupRedirect(address: string, ua: string, pageUrl: string): Response {
  const { primary, fallback } = buildDeepLinks(`matchup/${address}`, ua, pageUrl);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

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
          font-size:17px;padding:16px 40px;border-radius:16px;text-decoration:none;margin-top:8px}
    .note{font-size:12px;color:#4b5563;margin-top:8px}
  </style>
</head>
<body>
  <div style="font-size:52px">⚔️</div>
  <h1>You've been challenged!</h1>
  <p>Someone issued you a 1v1 matchup on Terrace.<br/>Open the app to accept or decline.</p>
  <p class="addr">${short}</p>
  <a class="btn" href="${primary}">Open in Terrace</a>
  <p class="note">Requires the Terrace app to be installed.</p>
  <script>
    // No auto-redirect on Android — intent:// fallback loops. iOS is safe.
    if (!/android/i.test(navigator.userAgent)) {
      setTimeout(function(){ window.location.href = "${primary}"; }, 400);
    }
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function checkSecret(req: Request, env: Env): boolean {
  const secret = env.WORKER_SECRET;
  if (!secret) return false;
  return req.headers.get("X-Worker-Secret") === secret;
}

function uuid(): string {
  // crypto.randomUUID is available in Cloudflare Workers
  return (crypto as any).randomUUID();
}

// ---------------------------------------------------------------------------
// Deep link URL helpers — Android needs intent:// to work from WebViews
// ---------------------------------------------------------------------------

function buildDeepLinks(path: string, ua: string, pageUrl: string): { primary: string; fallback: string } {
  const isAndroid = /android/i.test(ua);
  const custom    = `terrace://${path}`;
  // Android Intent URL: works from Telegram/Chrome WebView where terrace:// is blocked.
  // S.browser_fallback_url points back to THIS page so if the app isn't installed the user
  // just sees the same page again instead of an Unauthorized/404 error from the worker root.
  const intent    = `intent://${path}#Intent;scheme=terrace;package=com.terrace.app;S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`;
  return { primary: isAndroid ? intent : custom, fallback: custom };
}

// ---------------------------------------------------------------------------
// GET /link/:token  — wallet linking bounce page
// ---------------------------------------------------------------------------

function handleLinkRedirect(token: string, ua: string, pageUrl: string): Response {
  const { primary } = buildDeepLinks(`link/${token}`, ua, pageUrl);
  const isAndroid = /android/i.test(ua);
  // No JS auto-redirect on Android — intent:// in a WebView with a fallback URL causes an
  // infinite reload loop when the app isn't installed / using Expo Go.
  // On iOS (WKWebView), auto-redirect is safe.
  const autoScript = isAndroid
    ? ""
    : `<script>setTimeout(function(){ window.location.href = "${primary}"; }, 400);</script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Link Wallet — Terrace</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0a;color:#f9fafb;font-family:-apple-system,sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;padding:32px;text-align:center;gap:20px}
    h1{font-size:28px;font-weight:800}
    p{font-size:15px;color:#9ca3af;line-height:1.6}
    a.btn{display:inline-block;background:#22c55e;color:#000;font-weight:700;
          font-size:17px;padding:16px 40px;border-radius:16px;text-decoration:none;margin-top:4px}
    .note{font-size:12px;color:#4b5563;margin-top:4px}
    .alt{font-size:13px;color:#9ca3af;background:#111;border-radius:12px;padding:14px 16px;text-align:left;line-height:1.8}
    code{font-family:monospace;color:#22c55e;background:#0d1f12;padding:2px 7px;border-radius:4px}
  </style>
</head>
<body>
  <div style="font-size:48px">🔗</div>
  <h1>Link your wallet</h1>
  <p>Connect your Solana wallet to your Telegram account.</p>
  <a class="btn" href="${primary}">Open in Terrace</a>
  <p class="note">Requires a native Terrace build · expires in 15 min</p>
  <div class="alt">
    <strong style="color:#f9fafb">Using Expo Go?</strong><br/>
    Copy your wallet address from the <strong>Profile</strong> tab, then send this to the bot:<br/>
    <code>/link YOUR_WALLET_ADDRESS</code>
  </div>
  ${autoScript}
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" },
  });
}

// ---------------------------------------------------------------------------
// POST /link/verify  { token, pubkey }
// ---------------------------------------------------------------------------

async function handleLinkVerify(request: Request, env: Env): Promise<Response> {
  let body: { token?: string; pubkey?: string };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { token, pubkey } = body;
  if (!token || !pubkey) return new Response("Missing token or pubkey", { status: 400 });

  const raw = await env.DEVICES.get(`link_token:${token}`);
  if (!raw) return new Response(JSON.stringify({ error: "Token not found or expired" }), { status: 404, headers: { "Content-Type": "application/json" } });

  let entry: LinkToken;
  try { entry = JSON.parse(raw); }
  catch { return new Response("Corrupt token", { status: 500 }); }

  if (entry.used)        return new Response(JSON.stringify({ error: "Token already used" }),   { status: 409, headers: { "Content-Type": "application/json" } });
  if (Date.now() > entry.expiresAt) return new Response(JSON.stringify({ error: "Token expired" }), { status: 410, headers: { "Content-Type": "application/json" } });

  // Mark token as used (keep TTL so it stays expired, not reusable)
  await env.DEVICES.put(`link_token:${token}`, JSON.stringify({ ...entry, used: true }), { expirationTtl: 60 });

  // Store bidirectional mappings
  await env.DEVICES.put(`tg_wallet:${entry.tgUserId}`, JSON.stringify({ pubkey, linkedAt: Date.now() }), { expirationTtl: 60 * 60 * 24 * 365 });
  await env.DEVICES.put(`wallet_tg:${pubkey}`, JSON.stringify({ tgUserId: entry.tgUserId, username: entry.tgUsername }), { expirationTtl: 60 * 60 * 24 * 365 });

  // Notify the user in Telegram
  if (env.TELEGRAM_BOT_TOKEN) {
    const short = `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: entry.tgUserId,
        text: `✅ *Wallet linked!*\n\nYour Solana wallet \`${short}\` is now connected to this Telegram account.\n\nUse /me to see your reputation anytime.`,
        parse_mode: "Markdown",
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ success: true, tgUsername: entry.tgUsername }), {
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// POST /api/link-wallet  { tgUserId, tgUsername, pubkey }  — direct link, no deep-link needed
// ---------------------------------------------------------------------------

async function handleDirectLinkWallet(request: Request, env: Env): Promise<Response> {
  let body: { tgUserId?: string; tgUsername?: string; pubkey?: string };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { tgUserId, tgUsername = "", pubkey } = body;
  if (!tgUserId || !pubkey) return new Response("Missing tgUserId or pubkey", { status: 400 });
  if (pubkey.length < 32 || pubkey.length > 44) return new Response("Invalid pubkey length", { status: 400 });

  await env.DEVICES.put(`tg_wallet:${tgUserId}`, JSON.stringify({ pubkey, linkedAt: Date.now() }), { expirationTtl: 60 * 60 * 24 * 365 });
  await env.DEVICES.put(`wallet_tg:${pubkey}`, JSON.stringify({ tgUserId, username: tgUsername }), { expirationTtl: 60 * 60 * 24 * 365 });

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// POST /api/link-token  { tgUserId, tgUsername }  → { token }
// ---------------------------------------------------------------------------

async function handleCreateLinkToken(request: Request, env: Env): Promise<Response> {
  let body: { tgUserId?: string; tgUsername?: string };
  try { body = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const { tgUserId, tgUsername = "" } = body;
  if (!tgUserId) return new Response("Missing tgUserId", { status: 400 });

  const token: string = uuid();
  const entry: LinkToken = { tgUserId, tgUsername, expiresAt: Date.now() + 15 * 60 * 1000, used: false };
  await env.DEVICES.put(`link_token:${token}`, JSON.stringify(entry), { expirationTtl: 15 * 60 });

  return new Response(JSON.stringify({ token }), { headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// GET /api/wallet/tg/:userId  → { pubkey } | 404
// ---------------------------------------------------------------------------

async function handleGetWalletByTg(tgUserId: string, env: Env): Promise<Response> {
  const raw = await env.DEVICES.get(`tg_wallet:${tgUserId}`);
  if (!raw) return new Response(JSON.stringify({ error: "Not linked" }), { status: 404, headers: { "Content-Type": "application/json" } });
  return new Response(raw, { headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// GET /api/wallet/pubkey/:pubkey  → { tgUserId, username } | 404
// ---------------------------------------------------------------------------

async function handleGetTgByPubkey(pubkey: string, env: Env): Promise<Response> {
  const raw = await env.DEVICES.get(`wallet_tg:${pubkey}`);
  if (!raw) return new Response(JSON.stringify({ error: "Not linked" }), { status: 404, headers: { "Content-Type": "application/json" } });
  return new Response(raw, { headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
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
  r.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return r;
}

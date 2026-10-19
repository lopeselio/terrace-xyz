import "server-only";
import webpush from "web-push";
import { ensureTable } from "./azure";
import { matches } from "./football";
import { gql } from "./indexer";
import { BET_FIELDS, DUEL_FIELDS, buildNotes, fixtureIds, type BetN, type DuelN, type FollowN, type Note } from "@/lib/notes";
import type { PushPrefs } from "@/lib/push";

/*
 * Web push for results, challenges and followers. /api/push/run (called every minute by a timer on the
 * Azure VM) builds each subscribed fan's notes exactly as the bell does, and pushes the ones it hasn't
 * sent before. Sent note ids live in the `pushsent` table (partition = fan), so a note goes out once even
 * if two runs overlap: the row is written before the push.
 */

export type Sub = PushPrefs & { partitionKey: string; rowKey: string; endpoint: string; p256dh: string; auth: string; at: number };

/** Marks a fan whose existing notes were recorded on their first run, so turning pushes on doesn't replay history. */
export const BASELINE = "_base";
/** At most this many pushes per fan per run; the rest are marked sent (the bell still has them). */
const PER_RUN = 3;
const DAY = 86_400;

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_SITE_URL || "https://play.terrace.social", pub, priv);
  configured = true;
}

/** Send one push. Returns false when the device has unsubscribed (the caller deletes it). */
export async function sendPush(s: Pick<Sub, "endpoint" | "p256dh" | "auth">, payload: { title: string; body?: string; url: string; tag: string }) {
  configure();
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return false;
    throw e;
  }
}

async function agentNames() {
  const d = await gql<{ Player: { id: string; metadataURI: string | null }[] }>(`{ Player(where: { isAgent: { _eq: true } }) { id metadataURI } }`);
  return new Map(
    d.Player.map((p) => {
      let name = "";
      try {
        name = JSON.parse(decodeURIComponent((p.metadataURI ?? "").replace(/^data:application\/json,/, ""))).name ?? "";
      } catch {}
      return [p.id, name] as const;
    }),
  );
}

export async function runPush() {
  const subs = await ensureTable("pushsubs");
  const sent = await ensureTable("pushsent");

  const byFan = new Map<string, Sub[]>();
  for await (const e of subs.listEntities<Sub>()) {
    const s = e as Sub;
    byFan.set(s.partitionKey, [...(byFan.get(s.partitionKey) ?? []), s]);
  }
  const fans = [...byFan.keys()];
  if (!fans.length) return { fans: 0, pushed: 0 };

  const now = Math.floor(Date.now() / 1000);
  const d = await gql<{ Matchup: DuelN[]; Bet: (BetN & { bettor: string })[]; Follow: FollowN[] }>(
    `query R($fans: [String!]!, $week: numeric!, $fortnight: numeric!) {
      Matchup(where: { _or: [{ challenger: { _in: $fans } }, { opponent: { _in: $fans } }], createdAt: { _gt: $fortnight } }, limit: 500) { ${DUEL_FIELDS} }
      Bet(where: { bettor: { _in: $fans }, market: { question: { answer: { _neq: 0 }, closeTime: { _gt: $week } } } }, limit: 1000) { ${BET_FIELDS} }
      Follow(where: { followee: { _in: $fans }, active: { _eq: true }, since: { _gt: $week } }, limit: 500) { follower followee since }
    }`,
    { fans, week: String(now - 7 * DAY), fortnight: String(now - 14 * DAY) },
  );
  const agents = await agentNames().catch(() => new Map<string, string>());
  const names = new Map((await matches(fixtureIds(d.Matchup, d.Bet)).catch(() => [])).map((m) => [m.id, m]));
  const look = { agents, match: (id: number) => names.get(id) };

  let pushed = 0;
  for (const fan of fans) {
    const notes = buildNotes(
      fan,
      {
        duels: d.Matchup.filter((m) => m.challenger === fan || m.opponent === fan),
        bets: d.Bet.filter((b) => b.bettor === fan),
        follows: d.Follow.filter((f) => f.followee === fan),
      },
      look,
    ).filter((n) => n.kind !== "points");

    const done = new Set<string>();
    for await (const e of sent.listEntities({ queryOptions: { filter: `PartitionKey eq '${fan}'`, select: ["RowKey"] } })) done.add(e.rowKey!);

    const fresh = notes.filter((n) => !done.has(n.id)).reverse(); // oldest first
    const first = !done.has(BASELINE);
    let n = 0;
    for (const note of fresh) {
      // Claim the note before pushing: createEntity fails if another run already did.
      try {
        await sent.createEntity({ partitionKey: fan, rowKey: note.id, at: now });
      } catch {
        continue;
      }
      if (first || n >= PER_RUN) continue;
      n++;
      pushed += await deliver(byFan.get(fan)!, note, subs);
    }
    if (first) await sent.upsertEntity({ partitionKey: fan, rowKey: BASELINE, at: now });
  }
  return { fans: fans.length, pushed };
}

async function deliver(devices: Sub[], note: Note, subs: Awaited<ReturnType<typeof ensureTable>>) {
  let ok = 0;
  for (const s of devices) {
    if (note.kind === "points" || s[note.kind] === false) continue;
    const alive = await sendPush(s, { title: note.title, body: note.sub, url: note.href, tag: note.id }).catch(() => null);
    if (alive) ok++;
    else if (alive === false) await subs.deleteEntity(s.partitionKey, s.rowKey).catch(() => {});
  }
  return ok;
}

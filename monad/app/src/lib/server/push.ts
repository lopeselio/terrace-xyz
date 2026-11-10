import "server-only";
import webpush from "web-push";
import { asItStands, parseRule, type FixtureDetail } from "@shared/rules";
import { ensureTable } from "./azure";
import { football, matches, type MatchInfo } from "./football";
import { gql } from "./indexer";
import { BET_FIELDS, DUEL_FIELDS, buildNotes, fixtureIds, type BetN, type DuelN, type FollowN, type Note } from "@/lib/notes";
import { GD_BET, GD_DUEL, buildGroups, type RawBet, type RawDuel } from "@/lib/positions";
import type { PushPrefs } from "@/lib/push";
import { compare, livePositions, readingId, swingId, swingPush, type LivePosition, type Reading } from "@/lib/swings";

/*
 * Web push for results, challenges and followers. /api/push/run (called every minute by a timer on the
 * Azure VM) builds each subscribed fan's notes exactly as the bell does, and pushes the ones it hasn't
 * sent before. Sent note ids live in the `pushsent` table (partition = fan), so a note goes out once even
 * if two runs overlap: the row is written before the push.
 *
 * Swing alerts ride the same round: positions on matches in play are read as they stand, each one's last
 * reading is kept in `pushsent` (row w<position>), and a change from winning to losing or back claims a
 * row w<position>-<reading>-<score> before it goes out, so the same swing at the same score never repeats.
 */

export type Sub = PushPrefs & { partitionKey: string; rowKey: string; endpoint: string; p256dh: string; auth: string; at: number };

/** Marks a fan whose existing notes were recorded on their first run, so turning pushes on doesn't replay history. */
export const BASELINE = "_base";
/** At most this many pushes per fan per run; the rest are marked sent (the bell still has them). */
const PER_RUN = 3;
const DAY = 86_400;
/** Matches that kicked off this long ago or less can still be in play (extra time and penalties included). */
const IN_PLAY = 4 * 3600;
/** At most this many matches' full detail per round, for custom takes. */
const MAX_DETAIL = 8;

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
  const live = await inPlay(fans, now).catch(() => null);

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
    const readings = new Map<string, Reading>();
    for await (const e of sent.listEntities<Partial<Reading>>({ queryOptions: { filter: `PartitionKey eq '${fan}'`, select: ["RowKey", "standing", "home", "away"] } })) {
      done.add(e.rowKey!);
      if (e.standing) readings.set(e.rowKey!, { standing: e.standing, home: Number(e.home), away: Number(e.away) });
    }

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
      pushed += await deliver(byFan.get(fan)!, note.kind, { title: note.title, body: note.sub, url: note.href, tag: note.id }, subs);
    }

    // Swings: store every reading, push the ones that turned, one push per match.
    const swung = new Map<number, { list: LivePosition[]; before: { home: number; away: number } }>();
    for (const p of live?.byFan.get(fan) ?? []) {
      const prev = readings.get(readingId(p.key));
      const change = compare(prev, p);
      if (change === "same") continue;
      await sent.upsertEntity({ partitionKey: fan, rowKey: readingId(p.key), standing: p.standing, home: p.home, away: p.away, at: now }, "Replace");
      if (change !== "swing") continue;
      try {
        await sent.createEntity({ partitionKey: fan, rowKey: swingId(p), at: now });
      } catch {
        continue;
      }
      const s = swung.get(p.fixture) ?? { list: [], before: { home: prev!.home, away: prev!.away } };
      s.list.push(p);
      swung.set(p.fixture, s);
    }
    for (const [fixture, s] of swung) {
      if (first || n >= PER_RUN) continue;
      const m = live!.match.get(fixture)!;
      const events = (await live!.detail(fixture))?.events;
      n++;
      pushed += await deliver(byFan.get(fan)!, "swings", swingPush(m, s.list, s.before, events), subs);
    }
    if (first) await sent.upsertEntity({ partitionKey: fan, rowKey: BASELINE, at: now });
  }
  return { fans: fans.length, pushed };
}

async function deliver(devices: Sub[], kind: Note["kind"] | "swings", payload: Parameters<typeof sendPush>[1], subs: Awaited<ReturnType<typeof ensureTable>>) {
  let ok = 0;
  for (const s of devices) {
    if (kind === "points" || s[kind] === false) continue;
    const alive = await sendPush(s, payload).catch(() => null);
    if (alive) ok++;
    else if (alive === false) await subs.deleteEntity(s.partitionKey, s.rowKey).catch(() => {});
  }
  return ok;
}

/**
 * Every subscribed fan's open positions on matches in play, read as they stand. Costs nothing on the
 * football API unless a fan holds one: then one call per 20 such matches (shared with the 30-second
 * cache), plus one full-detail call per match with a custom take held, or with a swing to name the scorer.
 */
async function inPlay(fans: string[], now: number) {
  const d = await gql<{ Bet: (RawBet & { bettor: string })[]; Matchup: RawDuel[] }>(
    `query L($fans: [String!]!, $from: numeric!, $to: numeric!) {
      Bet(where: { bettor: { _in: $fans }, market: { question: { answer: { _eq: 0 }, fixture: { kickoff: { _gt: $from, _lte: $to } } } } }, limit: 2000) { bettor ${GD_BET} }
      Matchup(where: { _or: [{ challenger: { _in: $fans } }, { opponent: { _in: $fans } }], status: { _eq: 1 }, question: { answer: { _eq: 0 }, fixture: { kickoff: { _gt: $from, _lte: $to } } } }, limit: 500) { ${GD_DUEL} }
    }`,
    { fans, from: String(now - IN_PLAY), to: String(now) },
  );
  const byFan = new Map<string, LivePosition[]>();
  const match = new Map<number, MatchInfo>();
  const cache = new Map<number, Promise<FixtureDetail | null>>();
  const detail = (id: number) => {
    if (!cache.has(id)) cache.set(id, football<FixtureDetail[]>(`/fixtures?id=${id}`, 15_000).then((r) => r[0] ?? null, () => null));
    return cache.get(id)!;
  };
  const questions = [...d.Bet.map((b) => b.market.question), ...d.Matchup.map((m) => m.question)];
  const ids = [...new Set(questions.map((q) => Number(q.fixture!.id)))];
  if (!ids.length) return { byFan, match, detail };
  for (const m of await matches(ids)) if (m.status !== "NS") match.set(m.id, m);

  // Custom takes with a rule are read with the same code CRE settles with.
  const custom: Record<string, "YES" | "NO" | null> = {};
  const takes = questions.filter((q) => (q.kind < 1 || q.kind > 5) && q.spec && match.has(Number(q.fixture!.id)));
  const withTakes = [...new Set(takes.map((q) => Number(q.fixture!.id)))].slice(0, MAX_DETAIL);
  await Promise.all(withTakes.map(detail));
  for (const q of takes) {
    const f = withTakes.includes(Number(q.fixture!.id)) ? await detail(Number(q.fixture!.id)) : null;
    const rule = parseRule(q.spec!);
    custom[q.id] = f && rule ? asItStands(rule, f) : null;
  }

  for (const fan of fans) {
    const bets = d.Bet.filter((b) => b.bettor === fan);
    const duels = d.Matchup.filter((m) => m.challenger === fan || m.opponent === fan);
    if (!bets.length && !duels.length) continue;
    byFan.set(fan, livePositions(buildGroups(bets, duels, fan, match, custom, now)));
  }
  return { byFan, match, detail };
}

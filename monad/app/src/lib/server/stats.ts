import "server-only";
import { gql } from "./indexer";

/*
 * Numbers for the private /ops dashboard, computed from the Envio index of Terrace's contracts.
 * The hosted indexer has no aggregate queries, so this pages through every row and counts here;
 * fine at testnet scale (hundreds to low thousands of rows), cached for a minute.
 */

const TUSD = "0xa20ad4dbca268d2b8935a8ab67f352c2ece1e2fe";
const DAY = 86_400;
const PAGE = 1000;

type Player = { id: string; isAgent: boolean; terracePoints: string; firstSeen: string | null; results: number; wins: number; followers: number; invitesLanded: number; dayStreak: number };
type Feed = { kind: string; actor: string; amount: string | null; timestamp: string; text: string | null; market: { token: string; question: { text: string } } | null };
type Message = { author: string; postedAt: string };
type Points = { player: string; timestamp: string };
type Market = { id: string; token: string; creator: string; volume: string; bettors: number; createdAt: string; isSealed: boolean; isFlash: boolean; take: { id: string } | null; question: { text: string; answer: number } };
type Bet = { bettor: string; stake: string; result: number | null; payout: string | null; market: { token: string; question: { text: string } } };
type Matchup = { challenger: string; opponent: string | null; status: number; stake: string; createdAt: string };
type Parlay = { player: string; stake: string; legs: number; status: number };
type League = { id: string; creator: string; isPrivate: boolean; memberCount: number; ended: boolean };
type Follow = { follower: string; active: boolean };
type Signup = { id: string; at: string; refills: number };

async function all<T>(entity: string, fields: string, where = ""): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
    const q = `{ ${entity}(limit: ${PAGE}, offset: ${offset}${where ? `, where: ${where}` : ""}, order_by: {id: asc}) { ${fields} } }`;
    const page = (await gql<Record<string, T[]>>(q))[entity];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const usd = (raw: string | null | undefined) => Number(raw ?? 0) / 1e6;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const isTest = (text?: string) => !!text && text.startsWith("E2E ");

export type Stats = Awaited<ReturnType<typeof compute>>;

let cached: { at: number; days: number; data: Stats } | null = null;

export async function getStats(days: number): Promise<Stats> {
  if (cached && cached.days === days && Date.now() - cached.at < 60_000) return cached.data;
  const data = await compute(days);
  cached = { at: Date.now(), days, data };
  return data;
}

async function compute(days: number) {
  const [players, feed, messages, points, markets, bets, matchups, parlays, leagues, follows] = await Promise.all([
    all<Player>("Player", "id isAgent terracePoints firstSeen results wins followers invitesLanded dayStreak"),
    all<Feed>("FeedItem", "kind actor amount timestamp text market { token question { text } }"),
    all<Message>("Message", "author postedAt"),
    all<Points>("PointsEvent", "player timestamp"),
    all<Market>("Market", "id token creator volume bettors createdAt isSealed isFlash take { id } question { text answer }"),
    all<Bet>("Bet", "bettor stake result payout market { token question { text } }"),
    all<Matchup>("Matchup", "challenger opponent status stake createdAt"),
    all<Parlay>("Parlay", "player stake legs status"),
    all<League>("League", "id creator isPrivate memberCount ended"),
    all<Follow>("Follow", "follower active"),
  ]);
  // Sign-ups need the indexer version with the TerraceUSD mint handler; older deployments don't have the entity
  const signups = await all<Signup>("Signup", "id at refills").catch(() => null);

  const now = Math.floor(Date.now() / 1000);
  const today = dayOf(now);
  const agents = new Set(players.filter((p) => p.isAgent).map((p) => p.id));
  const fan = (a: string | null | undefined) => !!a && !agents.has(a.toLowerCase());
  const fans = players.filter((p) => !p.isAgent);

  // activity: any on-chain action we can date (feed events, chat messages, points lines)
  const acts: [string, number][] = [
    ...feed.map((f) => [f.actor.toLowerCase(), +f.timestamp] as [string, number]),
    ...messages.map((m) => [m.author.toLowerCase(), +m.postedAt] as [string, number]),
    ...points.map((p) => [p.player.toLowerCase(), +p.timestamp] as [string, number]),
  ].filter(([a]) => fan(a));
  const activeSince = (secs: number) => new Set(acts.filter(([, t]) => t >= now - secs).map(([a]) => a)).size;
  const daysActive = new Map<string, Set<number>>();
  for (const [a, t] of acts) (daysActive.get(a) ?? daysActive.set(a, new Set()).get(a)!).add(dayOf(t));
  const firstSeen = new Map<string, number>();
  for (const [a, t] of acts) firstSeen.set(a, Math.min(firstSeen.get(a) ?? Infinity, t));
  for (const p of fans) if (p.firstSeen) firstSeen.set(p.id, Math.min(firstSeen.get(p.id) ?? Infinity, +p.firstSeen));
  const lastSeen = new Map<string, number>();
  for (const [a, t] of acts) lastSeen.set(a, Math.max(lastSeen.get(a) ?? 0, t));
  const fanIds = new Set([...fans.map((p) => p.id), ...firstSeen.keys()]);

  // per-day series for the window
  const range = Array.from({ length: days }, (_, i) => today - days + 1 + i);
  const newFans = new Map<number, number>();
  for (const t of firstSeen.values()) newFans.set(dayOf(t), (newFans.get(dayOf(t)) ?? 0) + 1);
  const activeByDay = new Map<number, Set<string>>();
  for (const [a, t] of acts) (activeByDay.get(dayOf(t)) ?? activeByDay.set(dayOf(t), new Set()).get(dayOf(t))!).add(a);
  const fanBets = feed.filter((f) => f.kind === "BET" && fan(f.actor) && !isTest(f.market?.question.text));
  const volByDay = new Map<number, number>();
  for (const f of fanBets) volByDay.set(dayOf(+f.timestamp), (volByDay.get(dayOf(+f.timestamp)) ?? 0) + usd(f.amount));
  // sign-ups: first test-dollar mint per account, AI agents and house wallets left out
  const humanSignups = signups?.filter((x) => fan(x.id)) ?? null;
  const signupsByDay = new Map<number, number>();
  for (const x of humanSignups ?? []) signupsByDay.set(dayOf(+x.at), (signupsByDay.get(dayOf(+x.at)) ?? 0) + 1);
  const bettorIds = new Set(fanBetsAll().map((f) => f.actor.toLowerCase()));
  function fanBetsAll() {
    return feed.filter((f) => f.kind === "BET" && fan(f.actor) && !isTest(f.market?.question.text));
  }
  const funnel = humanSignups && {
    signedUp: humanSignups.length,
    acted: humanSignups.filter((x) => firstSeen.has(x.id)).length,
    bet: humanSignups.filter((x) => bettorIds.has(x.id)).length,
    returned: humanSignups.filter((x) => (daysActive.get(x.id)?.size ?? 0) >= 2).length,
  };

  const series = range.map((d) => ({
    signups: humanSignups ? signupsByDay.get(d) ?? 0 : null,
    day: d,
    label: new Date(d * DAY * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    newFans: newFans.get(d) ?? 0,
    active: activeByDay.get(d)?.size ?? 0,
    volume: Math.round((volByDay.get(d) ?? 0) * 100) / 100,
  }));

  // money
  const realBets = bets.filter((b) => !isTest(b.market.question.text));
  const sum = (rows: Bet[], f: (b: Bet) => number) => rows.reduce((s, b) => s + f(b), 0);
  const fanBetRows = realBets.filter((b) => fan(b.bettor));
  const agentBetRows = realBets.filter((b) => !fan(b.bettor));
  const byToken = (rows: Bet[], tusd: boolean) => rows.filter((b) => (b.market.token.toLowerCase() === TUSD) === tusd);

  // what fans do, by feed event kind
  const KIND: Record<string, string> = {
    TAKE: "Takes posted", TAKE_LISTED: "Takes made markets", BET: "Bets placed", WIN: "Wins", CHALLENGE: "1v1s sent",
    CHALLENGE_WON: "1v1s won", TITLE: "League titles", LEAGUE_JOIN: "League joins", PROPOSAL: "League proposals",
  };
  const mix = new Map<string, number>();
  for (const f of feed) if (fan(f.actor) && KIND[f.kind]) mix.set(KIND[f.kind], (mix.get(KIND[f.kind]) ?? 0) + 1);

  const realMarkets = markets.filter((m) => !isTest(m.question.text));
  const fanMatchups = matchups.filter((m) => fan(m.challenger));

  return {
    at: now,
    days,
    signups: humanSignups && {
      total: humanSignups.length,
      new24h: humanSignups.filter((x) => +x.at >= now - DAY).length,
      new7d: humanSignups.filter((x) => +x.at >= now - 7 * DAY).length,
      refilled: humanSignups.filter((x) => x.refills > 0).length,
    },
    funnel,
    fans: {
      total: fanIds.size,
      agents: agents.size,
      new24h: [...firstSeen.values()].filter((t) => t >= now - DAY).length,
      new7d: [...firstSeen.values()].filter((t) => t >= now - 7 * DAY).length,
      dau: activeSince(DAY),
      wau: activeSince(7 * DAY),
      returning: [...daysActive.values()].filter((s) => s.size >= 2).length,
      streak3: fans.filter((p) => p.dayStreak >= 3).length,
    },
    money: {
      bets: fanBets.length,
      bettors: new Set(fanBets.map((f) => f.actor.toLowerCase())).size,
      volumeTusd: sum(byToken(fanBetRows, true), (b) => usd(b.stake)),
      volumeUsdc: sum(byToken(fanBetRows, false), (b) => usd(b.stake)),
      paidOut: sum(fanBetRows.filter((b) => b.result === 1), (b) => usd(b.payout)),
      agentBets: agentBetRows.length,
      agentVolume: sum(agentBetRows, (b) => usd(b.stake)),
      markets: realMarkets.length,
      fromTakes: realMarkets.filter((m) => m.take).length,
      sealed: realMarkets.filter((m) => m.isSealed).length,
      settled: realMarkets.filter((m) => m.question.answer !== 0).length,
    },
    social: {
      takes: messages.filter((m) => fan(m.author)).length,
      follows: follows.filter((f) => f.active).length,
      followers: new Set(follows.filter((f) => f.active).map((f) => f.follower.toLowerCase())).size,
      matchups: fanMatchups.length,
      matchupsAccepted: fanMatchups.filter((m) => m.status === 1 || m.status === 4).length,
      parlays: parlays.filter((p) => fan(p.player)).length,
      leagues: leagues.length,
      privateLeagues: leagues.filter((l) => l.isPrivate).length,
      leagueMembers: leagues.reduce((s, l) => s + l.memberCount, 0),
      invites: fans.reduce((s, p) => s + p.invitesLanded, 0),
    },
    series,
    mix: [...mix.entries()].sort((a, b) => b[1] - a[1]),
    top: fans
      .slice()
      .sort((a, b) => Number(b.terracePoints) - Number(a.terracePoints))
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        points: Number(p.terracePoints),
        results: p.results,
        wins: p.wins,
        followers: p.followers,
        firstSeen: firstSeen.get(p.id) ?? null,
        lastSeen: lastSeen.get(p.id) ?? null,
      })),
    recent: feed
      .filter((f) => !isTest(f.market?.question.text))
      .sort((a, b) => +b.timestamp - +a.timestamp)
      .slice(0, 20)
      .map((f) => ({ kind: f.kind, actor: f.actor, agent: !fan(f.actor), amount: f.amount ? usd(f.amount) : null, at: +f.timestamp, what: f.market?.question.text ?? f.text ?? "" })),
  };
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { BetSheet, type BetPick } from "./BetSheet";
import { FixtureCard, LiveFixtureCard, kickoffDay } from "./FixtureCard";
import { ActivityTicker } from "./ActivityTicker";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { fixtureOf, marketOdds, marketPick, marketTitle, useOpenMarkets, type OpenMarket } from "./MarketCard";
import { FINISHED, LIVE } from "./MatchRow";
import { Avatar, Badge, Odd, SectionHead, SkeletonCards, Tile, ago, countdown, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { foundingFans } from "@/lib/terracePoints";
import { PointsSheet } from "./PointsSheet";
import { useAgents } from "@/lib/agents";
import { query } from "@/lib/indexer";
import { useMatchPrices } from "@/lib/picks";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/home.css";

/** Home, in-play first: live matches, next up, one flash market, what fans are backing, your league, quick tiles. */
export function Home() {
  const matches = useMatches();
  const { status, address, send } = useAccount();
  const router = useRouter();
  const owner = status === "ready" ? address : null;
  const all = [...matches.values()].sort((a, b) => a.kickoff - b.kickoff);
  const prices = useMatchPrices(all.map((m) => m.id));
  const [pick, setPick] = useState<BetPick | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const loaded = matches.size > 0;
  const live = all.filter((m) => LIVE.has(m.status));
  const upcoming = all.filter((m) => !LIVE.has(m.status) && !FINISHED.has(m.status));
  const firstDay = upcoming[0] ? kickoffDay(upcoming[0].kickoff) : null;
  const nextUp = upcoming.filter((m) => kickoffDay(m.kickoff) === firstDay).slice(0, 4);

  return (
    <>
      <Header brand search bell />
      <ActivityTicker />

      {live.length > 0 && (
        <>
          <div className="sec">
            <SectionHead title="In-play now" color="var(--red-ink)" more="All" href="/matches">
              <Badge tone="min">{live.length} {live.length === 1 ? "match" : "matches"}</Badge>
            </SectionHead>
          </div>
          <div className="chiprow inplay">
            {live.map((m) => (
              <LiveFixtureCard key={m.id} m={m} odds={prices.odds} onPick={() => router.push(`/m/${m.id}`)} />
            ))}
          </div>
        </>
      )}

      <div className="sec">
        <SectionHead title={firstDay === "Today" || !firstDay ? "Next up · today" : `Next up · ${firstDay.toLowerCase()}`} more="Fixtures" href="/matches" />
        {!loaded && <SkeletonCards n={2} />}
        {nextUp.map((m) => (
          <FixtureCard key={m.id} m={m} odds={prices.odds} onPick={(kind) => setPick(prices.pick(m, kind, 1, send, owner))} />
        ))}
        {loaded && nextUp.length === 0 && <div className="card umeta">No more fixtures scheduled yet.</div>}
      </div>

      <FlashTeaser matches={matches} now={now} onPick={(m, side) => setPick(marketPick(m, matches.get(fixtureOf(m)), side, send, owner))} />
      <FansBacking matches={matches} onCopy={setPick} send={send} owner={owner} />
      <YourLeague />

      {foundingFans() && (
        <div className="sec">
          <button className="card points-banner" onClick={() => setPointsOpen(true)}>
            <span className="points-coin"><Icon name="bolt" size={20} /></span>
            <span style={{ flex: 1, textAlign: "left" }}>
              <span className="uname" style={{ display: "block" }}>Founding fans earn double Terrace Points</span>
              <span className="umeta">Bet, post takes, start leagues, bring your mates. Until 1 November.</span>
            </span>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      )}
      {pointsOpen && <PointsSheet address={address} onClose={() => setPointsOpen(false)} />}

      <div className="sec" style={{ paddingBottom: 18 }}>
        <div className="stats four">
          <Tile href="/flash" icon="bolt">Flash<br />markets</Tile>
          <Tile href="/challenges" icon="swords">1v1<br />matchups</Tile>
          <Tile href="/acca" icon="list">Build a<br />parlay</Tile>
          <Tile href="/leagues" icon="trophy">Private<br />leagues</Tile>
        </div>
      </div>

      {pick && <BetSheet pick={pick} onClose={() => setPick(null)} />}
    </>
  );
}

/** One open flash market on a live match, linking to the Flash screen. Hidden when there isn't one. */
function FlashTeaser({ matches, now, onPick }: { matches: Map<number, MatchLite>; now: number; onPick: (m: OpenMarket, side: 1 | 2) => void }) {
  const { list } = useOpenMarkets({ flash: true });
  const m = (list ?? []).find((x) => {
    const match = matches.get(fixtureOf(x));
    return match && LIVE.has(match.status) && Number(x.question.closeTime) > now;
  });
  if (!m) return null;
  const match = matches.get(fixtureOf(m))!;
  return (
    <div className="sec">
      <SectionHead title="Flash · in-play" color="var(--amber-ink)" more="All" href="/flash" />
      <div className="card">
        <Link href="/flash" className="row" style={{ color: "var(--ink)" }}>
          <Badge tone="live">{match.status === "HT" ? "HT" : `${match.elapsed ?? 0}'`}</Badge>
          <span className="match-lg">{match.home.name} v {match.away.name}</span>
          <Badge tone="flash" icon="clock">{countdown(Number(m.question.closeTime), now)}</Badge>
        </Link>
        <div style={{ fontSize: 14.5, fontWeight: 600, margin: "10px 0 9px" }}>{marketTitle(m, match)}</div>
        <div className="oddsrow two">
          <Odd label="Back · yes" value={marketOdds(m, 1)} tone="yes" onClick={() => onPick(m, 1)} />
          <Odd label="Fade · no" value={marketOdds(m, 2)} tone="no" onClick={() => onPick(m, 2)} />
        </div>
      </div>
    </div>
  );
}

type BetItem = { id: string; actor: string; amount: string | null; timestamp: string; market: OpenMarket | null };

/** "Your follows backed" from the design: the latest backs on open markets, each one copyable. */
function FansBacking({ matches, onCopy, send, owner }: { matches: Map<number, MatchLite>; onCopy: (p: BetPick) => void; send: ReturnType<typeof useAccount>["send"]; owner: Address | null }) {
  const agents = useAgents();
  const [items, setItems] = useState<(BetItem & { side: number })[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await query<{ FeedItem: BetItem[] }>(`{
          FeedItem(where: { kind: { _eq: "BET" }, market: { isSealed: { _eq: false }, question: { answer: { _eq: 0 } } } }, order_by: { timestamp: desc }, limit: 12) {
            id actor amount timestamp
            market { id token feeBps isFlash yesPool noPool volume bettors take { id room_id } question { id kind line text closeTime answer spec fixture { id } } }
          }
        }`);
        const now = Date.now() / 1000;
        const open = d.FeedItem.filter((i) => i.market && Number(i.market.question.closeTime) > now && !i.market.question.text.startsWith("E2E "));
        const ids = open.map((i) => `${i.market!.id}-${i.actor}`);
        const b = ids.length ? await query<{ Bet: { id: string; side: number }[] }>(`query B($ids: [String!]) { Bet(where: { id: { _in: $ids } }) { id side } }`, { ids }) : { Bet: [] };
        const sides = new Map(b.Bet.map((x) => [x.id, x.side]));
        if (alive) setItems(open.map((i) => ({ ...i, side: sides.get(`${i.market!.id}-${i.actor}`) ?? 0 })).filter((i) => i.side > 0).slice(0, 3));
      } catch {
        if (alive) setItems((x) => x ?? []);
      }
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (items !== null && items.length === 0) return null;
  return (
    <div className="sec">
      <SectionHead title="Fans are backing" more="Feed" href="/social" />
      {items === null ? (
        <div className="card"><div className="sk" style={{ height: 38 }} /><div className="sk" style={{ height: 38, marginTop: 12 }} /></div>
      ) : (
        <div className="card rowlist" style={{ paddingTop: 2, paddingBottom: 2 }}>
          {items.map((i) => {
            const m = i.market!;
            const match = matches.get(fixtureOf(m));
            const name = owner && i.actor === owner.toLowerCase() ? "You" : agents.get(i.actor) || fanName(i.actor);
            const side = i.side as 1 | 2;
            return (
              <div key={i.id} className="listrow">
                <Avatar seed={i.actor} name={agents.get(i.actor) || undefined} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="uname">
                    {name}{agents.has(i.actor) && <> <Badge tone="private">AI</Badge></>} <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>{side === 1 ? "backed" : "faded"}</span> {marketTitle(m, match)}
                  </div>
                  <div className="umeta">{marketOdds(m, side)} · {usd(i.amount ?? 0)} stake · {ago(i.timestamp)}</div>
                </div>
                <button className="btn-out" onClick={() => onCopy(marketPick(m, match, side, send, owner))}>Copy</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Membership = { seasonScore: number; league: { id: string; name: string; memberCount: number; isPrivate: boolean; members: { member: string; seasonScore: number }[]; contests: { gameweek: number | null; isSealed: boolean; finalized: boolean; prizePool: string }[] } };

/** Your league's gameweek card (violet), or a quiet nudge to start one. */
function YourLeague() {
  const { status, address } = useAccount();
  const [mine, setMine] = useState<Membership[] | null>(null);
  useEffect(() => {
    if (!address) return setMine(null);
    query<{ LeagueMember: Membership[] }>(
      `query L($me: String!) {
        LeagueMember(where: { member: { _eq: $me } }, order_by: { seasonScore: desc }) {
          seasonScore
          league { id name memberCount isPrivate
            members(order_by: { seasonScore: desc }) { member seasonScore }
            contests(order_by: { gameweek: desc }, limit: 1) { gameweek isSealed finalized prizePool } }
        }
      }`,
      { me: address.toLowerCase() },
    )
      .then((d) => setMine(d.LeagueMember))
      .catch(() => setMine([]));
  }, [address]);

  if (status !== "ready" || (mine && mine.length === 0)) {
    return (
      <div className="sec">
        <SectionHead title="Your leagues" />
        <Link href="/leagues" className="card card-tap row" style={{ color: "var(--ink)" }}>
          <span className="avatar" style={{ background: "var(--violet-deep)", color: "var(--violet-ink)" }}><Icon name="trophy" size={20} /></span>
          <span style={{ flex: 1 }}>
            <span className="uname" style={{ display: "block" }}>Run a league with your mates</span>
            <span className="umeta" style={{ display: "block" }}>Gameweek picks, a table, sealed until the whistle</span>
          </span>
          <Icon name="chevronRight" size={16} />
        </Link>
      </div>
    );
  }
  if (!mine) return null;
  const top = mine[0];
  const l = top.league;
  const rank = l.members.findIndex((x) => x.member === address!.toLowerCase()) + 1 || l.memberCount;
  const leader = l.members[0]?.seasonScore ?? 0;
  const gw = l.contests[0];
  const hidden = gw && gw.isSealed && !gw.finalized;
  const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
  return (
    <div className="sec">
      <SectionHead title="Your leagues" more={mine.length > 1 ? `All ${mine.length}` : "All"} href="/leagues" />
      <Link href={`/l/${l.id}`} className="card card-tap violet" style={{ color: "var(--ink)" }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: "var(--violet-ink)" }}>{l.name}{gw?.gameweek ? ` · gameweek ${gw.gameweek}` : ""}</div>
            <div className="row" style={{ gap: 8, marginTop: 3 }}>
              <span className="cond" style={{ fontSize: 28, lineHeight: 1 }}>{ord(rank)}</span>
              <span className="umeta">of {l.memberCount} · {rank === 1 ? "top of the table" : `${leader - top.seasonScore} points off the top`}</span>
            </div>
          </div>
          {hidden ? <Badge tone="sealed">Hidden</Badge> : l.isPrivate ? <Badge tone="sealed">Sealed</Badge> : <Badge tone="open">Open</Badge>}
        </div>
        <div className="oddsrow" style={{ marginTop: 12 }}>
          <div className="odd sm"><span className="lbl">Season</span><span className="val">{top.seasonScore} pts</span></div>
          <div className="odd sm"><span className="lbl">This GW</span><span className="val" style={{ color: hidden ? "var(--violet-ink)" : undefined }}>{hidden ? "Hidden" : gw ? (gw.finalized ? "Final" : "Live") : "—"}</span></div>
          <div className="odd sm"><span className="lbl">Pool</span><span className="val" style={{ color: "var(--amber-ink)" }}>{gw ? usd(gw.prizePool) : "$0"}</span></div>
        </div>
      </Link>
    </div>
  );
}

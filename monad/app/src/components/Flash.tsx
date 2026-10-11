"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BetSheet, type BetPick } from "./BetSheet";
import { kickoffDay, kickoffTime } from "./FixtureCard";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { fixtureOf, marketOdds, marketPick, marketTitle, useOpenMarkets, type OpenMarket } from "./MarketCard";
import { FINISHED, LIVE } from "./MatchRow";
import { Badge, Crest, Empty, Odd, SkeletonCards, countdown } from "./ui";
import { useAccount } from "@/lib/account";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/markets.css";

/** Flash markets: in-play only, grouped by when they close, locking at the whistle. */
export function Flash() {
  const matches = useMatches();
  const { status, address, send } = useAccount();
  const owner = status === "ready" ? address : null;
  const { list } = useOpenMarkets({ flash: true });
  const [fixture, setFixture] = useState<number | "all">("all");
  const [pick, setPick] = useState<BetPick | null>(null);
  // Countdowns tick every second (device clock synced to chain time within a second or two).
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const live = [...matches.values()].filter((m) => LIVE.has(m.status));
  const flash = (list ?? []).filter((m) => live.some((x) => x.id === fixtureOf(m)));
  const shown = flash.filter((m) => fixture === "all" || fixtureOf(m) === fixture);
  const header = <Header title="Flash markets" sub="In-play only · settle before the whistle" back="/" />;

  if (!matches.size || list === null) {
    return (
      <>
        {header}
        <div className="sec"><SkeletonCards n={3} odds={2} /></div>
      </>
    );
  }

  if (!live.length) {
    const next = [...matches.values()].filter((m) => !FINISHED.has(m.status)).sort((a, b) => a.kickoff - b.kickoff)[0];
    return (
      <>
        {header}
        <Empty
          title="No live matches right now"
          action={next && <Link href={`/m/${next.id}`} className="cta cta-ghost cta-sm" style={{ maxWidth: 280, margin: "0 auto" }}>Next up: {next.home.name} v {next.away.name}</Link>}
        >
          Flash markets open during a match and close before the whistle.
          {next && <><br />Next kick-off {kickoffDay(next.kickoff).toLowerCase()} at {kickoffTime(next.kickoff)}.</>}
        </Empty>
      </>
    );
  }

  const focus = fixture === "all" ? live[0] : live.find((m) => m.id === fixture) ?? live[0];
  // "Before half time" while the first half is on; everything else is later in the match.
  const htCut = focus.status === "1H" ? now + Math.max(0, 45 - (focus.elapsed ?? 0)) * 60 + 180 : 0;
  const before = shown.filter((m) => Number(m.question.closeTime) <= htCut);
  const later = shown.filter((m) => Number(m.question.closeTime) > htCut);

  return (
    <>
      {header}
      <div className="chiprow" style={{ paddingTop: 12 }}>
        <button className={`chip${fixture === "all" ? " on" : ""}`} onClick={() => setFixture("all")}><Icon name="flame" size={14} /> All live</button>
        {live.map((m) => (
          <button key={m.id} className={`chip${fixture === m.id ? " on" : ""}`} onClick={() => setFixture(m.id)}>{m.home.name} v {m.away.name}</button>
        ))}
      </div>
      <div style={{ padding: "10px var(--gutter) 0" }}>
        <LiveHeader m={focus} />
        {before.length > 0 && (
          <>
            <div className="sec flash-sec">
              <div className="sec-hd">
                <h3 style={{ color: "var(--amber-ink)" }}>Before half time</h3>
                <Badge tone="flash">Closes {Math.max(0, 45 - (focus.elapsed ?? 0))}&apos;</Badge>
              </div>
            </div>
            {before.map((m) => <FlashRow key={m.id} m={m} match={matches.get(fixtureOf(m))} now={now} onPick={(side) => setPick(marketPick(m, matches.get(fixtureOf(m)), side, send, owner))} />)}
          </>
        )}
        {later.length > 0 && (
          <>
            <div className="sec flash-sec"><div className="sec-hd"><h3>{before.length ? "Later in the match" : "Open now"}</h3></div></div>
            {later.map((m) => <FlashRow key={m.id} m={m} match={matches.get(fixtureOf(m))} now={now} onPick={(side) => setPick(marketPick(m, matches.get(fixtureOf(m)), side, send, owner))} />)}
          </>
        )}
        {shown.length === 0 && (
          <Empty
            title="No flash calls yet"
            action={<Link href={`/m/${focus.id}`} className="cta cta-sm" style={{ maxWidth: 240, margin: "0 auto" }}><Icon name="bolt" size={16} /> Call the next moment</Link>}
          >
            Say what happens next in the match room. Back it and it opens here.
          </Empty>
        )}
        <div style={{ height: 18 }} />
      </div>
      {pick && <BetSheet pick={pick} onClose={() => setPick(null)} />}
    </>
  );
}

function LiveHeader({ m }: { m: MatchLite }) {
  const toHt = m.status === "1H" ? Math.max(0, 45 - (m.elapsed ?? 0)) : null;
  return (
    <Link href={`/m/${m.id}`} className="card redish" style={{ color: "var(--ink)" }}>
      <div className="row">
        <Badge tone="live">LIVE</Badge>
        <Badge tone="min">{m.status === "HT" ? "HT" : `${m.elapsed ?? 0}'`}</Badge>
        <span className="match-lg" style={{ marginLeft: "auto" }}>{toHt !== null ? `Half time in ${toHt}'` : m.status === "HT" ? "Half time" : "Second half"}</span>
      </div>
      <div className="row" style={{ marginTop: 11, gap: 10 }}>
        <Crest logo={m.home.logo} name={m.home.name} />
        <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1, minWidth: 0 }}>{m.home.name}</span>
        <span className="cond" style={{ fontSize: 22 }}>{m.goals?.home ?? 0} – {m.goals?.away ?? 0}</span>
        <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1, minWidth: 0, textAlign: "right" }}>{m.away.name}</span>
        <Crest logo={m.away.logo} name={m.away.name} />
      </div>
    </Link>
  );
}

function FlashRow({ m, match, now, onPick }: { m: OpenMarket; match?: MatchLite; now: number; onPick: (side: 1 | 2) => void }) {
  const close = Number(m.question.closeTime);
  const closed = close <= now;
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{marketTitle(m, match)}</div>
          <div className="umeta">{match ? `${match.home.name} v ${match.away.name}` : "Live match"} · {m.bettors === 1 ? "1 fan in" : `${m.bettors} fans in`}</div>
        </div>
        {closed ? <Badge tone="settled">Closed</Badge> : <Badge tone="flash" icon="clock">{countdown(close, now)}</Badge>}
      </div>
      <div className="oddsrow two" style={{ marginTop: 10 }}>
        <Odd label="Back · yes" value={marketOdds(m, 1)} tone="yes" disabled={closed} onClick={() => onPick(1)} />
        <Odd label="Fade · no" value={marketOdds(m, 2)} tone="no" disabled={closed} onClick={() => onPick(2)} />
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BetSheet, type BetPick } from "./BetSheet";
import { FixtureCard } from "./FixtureCard";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { MarketCard, fixtureOf, marketPick, useOpenMarkets } from "./MarketCard";
import { FINISHED, LIVE } from "./MatchRow";
import { SwipeDeck } from "./SwipeDeck";
import { Empty, Seg, SkeletonCards } from "./ui";
import { useAccount } from "@/lib/account";
import { useMatchPrices } from "@/lib/picks";
import { useMatches } from "@/lib/useMatches";
import "@/styles/markets.css";

type View = "list" | "swipe";
type Filter = "all" | "live" | "matches" | `league:${string}`;
const VIEW_KEY = "terrace.marketsView";

/** Markets: every open call as a list or a swipe deck, plus match result prices per fixture. */
export function Markets() {
  const params = useSearchParams();
  const matches = useMatches();
  const { status, address, send } = useAccount();
  const owner = status === "ready" ? address : null;
  const { list, error } = useOpenMarkets();
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [pick, setPick] = useState<BetPick | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);

  useEffect(() => {
    const fromUrl = params.get("view");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {}
    const v = fromUrl === "swipe" || fromUrl === "list" ? fromUrl : saved === "swipe" ? "swipe" : "list";
    setView(v);
  }, [params]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const fixtures = [...matches.values()].sort((a, b) => a.kickoff - b.kickoff);
  const prices = useMatchPrices(fixtures.map((m) => m.id));
  const leagues = [...new Set(fixtures.map((m) => m.league).filter(Boolean))] as string[];
  const all = list ?? [];
  const shown = all.filter((m) => {
    const match = matches.get(fixtureOf(m));
    if (filter === "live") return match ? LIVE.has(match.status) : false;
    if (filter.startsWith("league:")) return match?.league === filter.slice(7);
    return true;
  });
  const liveCount = all.filter((m) => LIVE.has(matches.get(fixtureOf(m))?.status ?? "")).length;
  const upcoming = fixtures.filter((m) => !LIVE.has(m.status) && !FINISHED.has(m.status));

  return (
    <>
      <Header title="Football" sub={leagues.length ? leagues.join(" · ") : "Every call, every match"} search bell />
      <div style={{ padding: "12px var(--gutter) 10px" }}>
        <Seg
          value={view}
          onChange={choose}
          options={[
            { id: "list", label: "List", icon: "list" },
            { id: "swipe", label: "Swipe", icon: "cards" },
          ]}
        />
      </div>
      <div className="chiprow" style={{ marginBottom: 4 }}>
        <button className={`chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>All <span className="ct">{all.length || ""}</span></button>
        <button className={`chip${filter === "live" ? " on" : ""}`} onClick={() => setFilter("live")}><Icon name="flame" size={14} /> Live {liveCount > 0 && <span className="ct">{liveCount}</span>}</button>
        {view === "list" && (
          <button className={`chip${filter === "matches" ? " on" : ""}`} onClick={() => setFilter("matches")}>Match results <span className="ct">{upcoming.length || ""}</span></button>
        )}
        {leagues.length > 1 &&
          leagues.map((l) => (
            <button key={l} className={`chip${filter === `league:${l}` ? " on" : ""}`} onClick={() => setFilter(`league:${l}`)}>{l}</button>
          ))}
        <Link href="/flash" className="chip"><Icon name="bolt" size={14} /> Flash</Link>
      </div>

      {view === "swipe" ? (
        list === null ? (
          <div className="stage"><div className="swipecard"><div className="sk" style={{ height: 22, width: 120 }} /><div className="sk" style={{ flex: 1, margin: "16px 0" }} /><div className="sk" style={{ height: 52 }} /></div></div>
        ) : (
          <SwipeDeck markets={shown} matches={matches} now={now} />
        )
      ) : (
        <div className="markets-list">
          {filter === "matches" ? (
            upcoming.length ? (
              upcoming.map((m) => <FixtureCard key={m.id} m={m} showDay odds={prices.odds} onPick={(kind) => setPick(prices.pick(m, kind, 1, send, owner))} />)
            ) : (
              <Empty title="No fixtures open">Match result pools open when fixtures are scheduled.</Empty>
            )
          ) : list === null ? (
            <SkeletonCards n={3} odds={2} />
          ) : shown.length ? (
            shown.map((m) => (
              <MarketCard key={m.id} m={m} match={matches.get(fixtureOf(m))} now={now} onPick={(side) => setPick(marketPick(m, matches.get(fixtureOf(m)), side, send, owner))} />
            ))
          ) : (
            <Empty
              title={filter === "live" ? "Nothing live right now" : "No open calls yet"}
              action={<Link href="/take" className="cta cta-sm" style={{ maxWidth: 220, margin: "0 auto" }}><Icon name="plus" size={16} /> Say your take</Link>}
            >
              {error ? <span className="error">Couldn&apos;t load the markets. Pull to retry.</span> : "Every take a fan backs with money becomes a market here."}
            </Empty>
          )}
          <div style={{ height: 8 }} />
        </div>
      )}
      {pick && <BetSheet pick={pick} onClose={() => setPick(null)} />}
    </>
  );
}

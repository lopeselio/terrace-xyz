"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BetSheet, type BetPick } from "./BetSheet";
import { Icon } from "./Icon";
import { FINISHED, LIVE } from "./MatchRow";
import { Badge, Crest, Empty, Odd, SkeletonCards, LeagueLogo } from "./ui";
import { useAccount } from "@/lib/account";
import { useMatchPrices } from "@/lib/picks";
import { KIND } from "@/lib/social";
import { useMatches, type MatchLite } from "@/lib/useMatches";

type Odds = ReturnType<typeof useMatchPrices>["odds"];

export const kickoffTime = (unix: number) => new Date(unix * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
export const kickoffDay = (unix: number) => {
  const d = new Date(unix * 1000);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

/** Next-up fixture card: kickoff badge, league, both teams, 1 / X / 2. */
export function FixtureCard({ m, odds, onPick, showDay }: { m: MatchLite; odds: Odds; onPick: (kind: number) => void; showDay?: boolean }) {
  const open = !LIVE.has(m.status) && !FINISHED.has(m.status);
  return (
    <div className="card">
      <Link href={`/m/${m.id}`} className="match-top card-tap" style={{ color: "var(--ink)" }}>
        <Badge tone="open">{showDay ? `${kickoffDay(m.kickoff)} ${kickoffTime(m.kickoff)}` : kickoffTime(m.kickoff)}</Badge>
        <LeagueLogo m={m} withName />
        <span style={{ marginLeft: "auto", color: "var(--ink-4)" }}><Icon name="chevronRight" size={16} /></span>
      </Link>
      <Link href={`/m/${m.id}`} className="match-teams" style={{ margin: "10px 0 11px", color: "var(--ink)" }}>
        <span className="team"><Crest logo={m.home.logo} name={m.home.name} /><span className="nm">{m.home.name}</span></span>
        <span className="team"><Crest logo={m.away.logo} name={m.away.name} /><span className="nm">{m.away.name}</span></span>
      </Link>
      <div className="oddsrow">
        <Odd label="Home" value={odds(m.id, KIND.HOME)} disabled={!open} onClick={() => onPick(KIND.HOME)} />
        <Odd label="Draw" value={odds(m.id, KIND.DRAW)} disabled={!open} onClick={() => onPick(KIND.DRAW)} />
        <Odd label="Away" value={odds(m.id, KIND.AWAY)} disabled={!open} onClick={() => onPick(KIND.AWAY)} />
      </div>
    </div>
  );
}

/** Live match card for the in-play carousel: LIVE + minute, scores, 1 / X / 2. */
export function LiveFixtureCard({ m, odds, onPick }: { m: MatchLite; odds: Odds; onPick: (kind: number) => void }) {
  const hg = m.goals?.home ?? 0, ag = m.goals?.away ?? 0;
  return (
    <div className="card live-card">
      <Link href={`/m/${m.id}`} className="match-top" style={{ color: "var(--ink)" }}>
        <Badge tone="live">LIVE</Badge>
        <Badge tone="min">{m.status === "HT" ? "HT" : `${m.elapsed ?? 0}'`}</Badge>
        <span className="match-lg" style={{ marginLeft: "auto" }}>Match result</span>
      </Link>
      <Link href={`/m/${m.id}`} className="match-teams" style={{ margin: "11px 0 12px", color: "var(--ink)" }}>
        <span className={`team${hg < ag ? " dim" : ""}`}><Crest logo={m.home.logo} name={m.home.name} /><span className="nm">{m.home.name}</span><span className="sc">{hg}</span></span>
        <span className={`team${ag < hg ? " dim" : ""}`}><Crest logo={m.away.logo} name={m.away.name} /><span className="nm">{m.away.name}</span><span className="sc">{ag}</span></span>
      </Link>
      {/* Result pools close at kick-off, so in play these are the closing prices; a tap opens the match. */}
      <div className="oddsrow">
        <Odd label="Home" value={odds(m.id, KIND.HOME)} up={hg > ag} onClick={() => onPick(KIND.HOME)} />
        <Odd label="Draw" value={odds(m.id, KIND.DRAW)} onClick={() => onPick(KIND.DRAW)} />
        <Odd label="Away" value={odds(m.id, KIND.AWAY)} up={ag > hg} onClick={() => onPick(KIND.AWAY)} />
      </div>
    </div>
  );
}

/** Every scheduled match, grouped by day (the Fixtures screen). */
export function FixtureList() {
  const matches = useMatches();
  const { status, address, send } = useAccount();
  const all = [...matches.values()].sort((a, b) => a.kickoff - b.kickoff);
  const prices = useMatchPrices(all.map((m) => m.id));
  const [pick, setPick] = useState<BetPick | null>(null);
  const router = useRouter();

  if (!matches.size) return <div className="sec"><SkeletonCards n={4} /></div>;
  const days = new Map<string, MatchLite[]>();
  for (const m of all) {
    const key = FINISHED.has(m.status) ? "Full time" : LIVE.has(m.status) ? "In play" : kickoffDay(m.kickoff);
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return (
    <>
      {[...days].map(([day, list]) => (
        <div key={day} className="sec">
          <div className="sec-hd"><h3 style={day === "In play" ? { color: "var(--red-ink)" } : undefined}>{day}</h3></div>
          {list.map((m) =>
            LIVE.has(m.status) ? (
              <LiveFixtureCard key={m.id} m={m} odds={prices.odds} onPick={() => router.push(`/m/${m.id}`)} />
            ) : (
              <FixtureCard key={m.id} m={m} odds={prices.odds} onPick={(kind) => setPick(prices.pick(m, kind, 1, send, status === "ready" ? address : null))} />
            ),
          )}
        </div>
      ))}
      {all.length === 0 && <Empty title="No fixtures yet">New matches appear once they're scheduled.</Empty>}
      {pick && <BetSheet pick={pick} onClose={() => setPick(null)} />}
    </>
  );
}

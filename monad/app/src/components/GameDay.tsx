"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { BetSheet, type BetPick } from "./BetSheet";
import { FixtureCard, kickoffDay, kickoffTime } from "./FixtureCard";
import { FINISHED } from "./MatchRow";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { MarketCard, fixtureOf, marketPick, useOpenMarkets, type OpenMarket } from "./MarketCard";
import { OnboardingPanel } from "./Onboarding";
import { announceCollected } from "./OutcomePopup";
import { Badge, Crest, Empty, LeagueLogo, SectionHead, SkeletonCards, money } from "./ui";
import { useAccount } from "@/lib/account";
import { useFavTeam } from "@/lib/favTeam";
import { useGameDay, type Acca, type MatchGroup, type Position, type Standing } from "@/lib/gameday";
import { collect } from "@/lib/play";
import { useMatchPrices } from "@/lib/picks";
import { balanceChanged } from "@/lib/useBalance";
import type { MatchLite } from "@/lib/useMatches";
import { showError } from "@/lib/errors";
import "@/styles/gameday.css";

const STANDING: Record<Standing, { label: string; tone: "won" | "lost" | "live" | "open" | "settled" | "amber" }> = {
  won: { label: "Won", tone: "won" },
  lost: { label: "Lost", tone: "lost" },
  refund: { label: "Refund", tone: "settled" },
  winning: { label: "Winning", tone: "won" },
  losing: { label: "Losing", tone: "lost" },
  live: { label: "In play", tone: "live" },
  due: { label: "Awaiting result", tone: "amber" },
  upcoming: { label: "Not started", tone: "open" },
  waiting: { label: "Waiting for a mate", tone: "amber" },
  expired: { label: "Not taken", tone: "settled" },
};
const signed = (raw: number) => `${raw >= 0 ? "+" : "−"}${money(Math.abs(raw))}`;

/** Game day: every position you hold, beside the action, with more to back on the games you follow. */
export function GameDay() {
  const { status, address, send } = useAccount();
  const owner = status === "ready" ? address : null;
  const { groups, accas, matches, reload } = useGameDay(owner);
  const { team } = useFavTeam();
  const [pick, setPick] = useState<BetPick | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!owner) {
    return (
      <>
        <Header title="Game day" balance={false} />
        <div className="pad page-enter" style={{ paddingTop: 24 }}>
          <OnboardingPanel compact />
        </div>
      </>
    );
  }

  async function collectBet(p: Position) {
    if (!p.bet) return;
    setBusy(p.key);
    setError(null);
    try {
      await collect(send, BigInt(p.bet.market.id), owner as Address);
      if (p.standing === "won" || p.standing === "refund") announceCollected({ id: p.bet.market.id, outcome: p.standing, title: p.title, amount: p.returns ?? p.stake, href: p.href });
      balanceChanged();
      reload();
    } catch (e) {
      setError(showError(e));
    } finally {
      setBusy(null);
    }
  }

  const live = groups?.filter((g) => g.phase === "live") ?? [];
  const fulltime = groups?.filter((g) => g.phase === "fulltime") ?? [];
  const upcoming = groups?.filter((g) => g.phase === "upcoming") ?? [];

  return (
    <>
      <Header title="Game day" sub="Everything you've got on, as it happens" />
      <div className="pad page-enter gd">
        {!groups && <SkeletonCards n={2} odds={0} />}
        {groups && <Summary groups={groups} accas={accas} />}
        {error && <div className="card umeta" role="alert" style={{ marginTop: 12, color: "var(--red-ink)" }}>{error}</div>}

        {live.length > 0 && (
          <div className="sec">
            <SectionHead title="In play" color="var(--red-ink)"><Badge tone="live">{live.length} {live.length === 1 ? "game" : "games"}</Badge></SectionHead>
            {live.map((g) => <MatchBoard key={g.fixture} g={g} busy={busy} onCollect={collectBet} />)}
          </div>
        )}
        {fulltime.length > 0 && (
          <div className="sec">
            <SectionHead title="Full time" />
            {fulltime.map((g) => <MatchBoard key={g.fixture} g={g} busy={busy} onCollect={collectBet} />)}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="sec">
            <SectionHead title="Coming up" />
            {upcoming.map((g) => <MatchBoard key={g.fixture} g={g} busy={busy} onCollect={collectBet} />)}
          </div>
        )}
        {accas.length > 0 && (
          <div className="sec">
            <SectionHead title="Parlays riding" more="All" href="/acca" />
            {accas.map((a) => <AccaLine key={a.id} a={a} />)}
          </div>
        )}
        {groups && groups.length === 0 && accas.length === 0 && (
          <Empty title="Nothing on yet" action={<Link href="/matches" className="cta cta-sm">Find a match</Link>}>
            Back a result, take on a mate or call a moment. Everything you&apos;ve got on lands here, live.
          </Empty>
        )}

        {groups && <Discover groups={groups} matches={matches} team={team} owner={owner} send={send} onPick={setPick} />}
      </div>
      {pick && <BetSheet pick={pick} onClose={() => (setPick(null), reload())} />}
    </>
  );
}

/** The fan's whole exposure in one line: what's riding, and where it stands right now. */
function Summary({ groups, accas }: { groups: MatchGroup[]; accas: Acca[] }) {
  const all = groups.flatMap((g) => g.positions);
  const riding = groups.reduce((s, g) => s + g.staked, 0) + accas.reduce((s, a) => s + Number(a.stake), 0);
  const games = groups.filter((g) => g.staked > 0).length;
  const winning = all.filter((p) => p.standing === "winning").length;
  const losing = all.filter((p) => p.standing === "losing").length;
  const read = groups.filter((g) => g.ifEndsNow !== null);
  const net = read.reduce((s, g) => s + (g.ifEndsNow ?? 0), 0);
  const toCollect = all.filter((p) => p.collectible).reduce((s, p) => s + (p.returns ?? p.stake), 0);
  return (
    <div className="card gd-hero">
      <div className="gd-hero-row">
        <div>
          <div className="gd-k">On the line</div>
          <div className="gd-v">{money(riding)}</div>
          <div className="umeta">{games} {games === 1 ? "game" : "games"}{accas.length ? ` · ${accas.length} ${accas.length === 1 ? "parlay" : "parlays"}` : ""}</div>
        </div>
        {read.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <div className="gd-k">If it all ends now</div>
            <div className={`gd-v ${net >= 0 ? "amt-won" : "amt-lost"}`}>{signed(net)}</div>
            <div className="umeta">{winning} winning · {losing} losing</div>
          </div>
        )}
      </div>
      {toCollect > 0 && (
        <div className="gd-collect"><Icon name="dollar" size={16} /> {money(toCollect)} ready to collect below</div>
      )}
    </div>
  );
}

function MatchBoard({ g, busy, onCollect }: { g: MatchGroup; busy: string | null; onCollect: (p: Position) => void }) {
  const m = g.match;
  const positions = [...g.positions].sort((a, b) => Number(b.collectible) - Number(a.collectible));
  const clock =
    g.phase === "live" ? (m?.status === "HT" ? "HT" : m?.elapsed ? `${m.elapsed}'` : "LIVE")
    : g.phase === "fulltime" ? (m && !FINISHED.has(m.status) ? (m.status === "PST" ? "Postponed" : m.status) : "FT")
    : g.kickoff ? `${kickoffDay(g.kickoff)} ${kickoffTime(g.kickoff)}` : "";
  return (
    <div className={`card gd-match gd-${g.phase}`}>
      <Link href={g.fixture ? `/m/${g.fixture}` : "/me"} className="gd-head" style={{ color: "var(--ink)" }}>
        {g.phase === "live" ? <Badge tone="live">{clock}</Badge> : <Badge tone={g.phase === "fulltime" ? "settled" : "open"}>{clock}</Badge>}
        {m && <LeagueLogo m={m} withName />}
        <span style={{ marginLeft: "auto", color: "var(--ink-4)" }}><Icon name="chevronRight" size={16} /></span>
      </Link>
      {m ? (
        <Link href={`/m/${g.fixture}`} className="gd-score" style={{ color: "var(--ink)" }}>
          <span className="t"><Crest logo={m.home.logo} name={m.home.name} /><span className="nm">{m.home.name}</span></span>
          <span className={`sc${g.phase === "live" ? " on" : ""}`}>{g.score ? `${g.score.home}–${g.score.away}` : "v"}</span>
          <span className="t away"><span className="nm">{m.away.name}</span><Crest logo={m.away.logo} name={m.away.name} /></span>
        </Link>
      ) : (
        g.score && <div className="gd-score"><span className="sc">{g.score.home}–{g.score.away}</span></div>
      )}
      <div className="gd-positions">
        {positions.map((p) => <PositionLine key={p.key} p={p} busy={busy === p.key} onCollect={() => onCollect(p)} />)}
      </div>
      {(g.staked > 0 || g.ifEndsNow !== null) && (
        <div className="gd-foot">
          {g.staked > 0 && <span>{money(g.staked)} riding</span>}
          {g.ifEndsNow !== null && <span className={g.ifEndsNow >= 0 ? "amt-won" : "amt-lost"}>{g.phase === "live" ? "If it ends now" : "As it finished"} {signed(g.ifEndsNow)}</span>}
        </div>
      )}
    </div>
  );
}

function PositionLine({ p, busy, onCollect }: { p: Position; busy: boolean; onCollect: () => void }) {
  const s = STANDING[p.standing];
  const amount =
    p.standing === "winning" || p.standing === "won" ? (p.returns !== null ? `+${money(p.returns - p.stake)}` : "")
    : p.standing === "losing" || p.standing === "lost" ? `−${money(p.stake)}`
    : p.standing === "refund" || p.standing === "expired" ? money(p.stake)
    : p.returns !== null ? `pays ${money(p.returns)}` : "";
  return (
    <div className={`gd-pos gd-${p.standing}`}>
      <Link href={p.href} className="gd-pos-main" style={{ color: "var(--ink)" }}>
        <div className="uname">{p.title}</div>
        <div className="umeta">
          {p.pick} · {money(p.stake)}{p.flash ? " · flash" : ""}
        </div>
      </Link>
      <div className="gd-pos-side">
        <Badge tone={s.tone}>{s.label}</Badge>
        {amount && <div className={`gd-amt${p.standing === "winning" || p.standing === "won" ? " amt-won" : p.standing === "losing" || p.standing === "lost" ? " amt-lost" : ""}`}>{amount}</div>}
      </div>
      {p.collectible && (
        <button className="cta cta-sm gd-pos-cta" disabled={busy} onClick={onCollect}>
          {busy ? "One moment…" : p.standing === "won" ? `Collect ${money(p.returns ?? p.stake)}` : `Get my ${money(p.stake)} back`}
        </button>
      )}
    </div>
  );
}

function AccaLine({ a }: { a: Acca }) {
  const dead = a.legs - a.liveLegs;
  return (
    <Link href="/acca" className="card card-tap gd-acca" style={{ color: "var(--ink)" }}>
      <div>
        <div className="uname">{a.legs}-leg parlay</div>
        <div className="umeta">{a.liveLegs} of {a.legs} legs still to settle{dead ? ` · ${dead} in` : ""}</div>
      </div>
      <Badge tone="settled">{money(a.stake)}</Badge>
    </Link>
  );
}

/**
 * Discovery tied to what the fan already follows: open markets on the games they're on, then on their
 * clubs (their positions' teams and the club they picked), then those clubs' next fixtures.
 */
function Discover({ groups, matches, team, owner, send, onPick }: {
  groups: MatchGroup[];
  matches: Map<number, MatchLite>;
  team: { id: number; name: string } | null;
  owner: Address;
  send: ReturnType<typeof useAccount>["send"];
  onPick: (p: BetPick) => void;
}) {
  const { list } = useOpenMarkets();
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const mine = useMemo(() => new Set(groups.map((g) => g.fixture)), [groups]);
  const held = useMemo(() => new Set(groups.flatMap((g) => g.positions.map((p) => p.bet?.market.id)).filter(Boolean)), [groups]);
  const teams = useMemo(() => {
    const names = new Set<string>();
    for (const g of groups) if (g.match) names.add(g.match.home.name), names.add(g.match.away.name);
    if (team) names.add(team.name);
    return names;
  }, [groups, team]);
  const teamMatch = (m?: MatchLite) => !!m && (teams.has(m.home.name) || teams.has(m.away.name));

  const fresh = (list ?? []).filter((m) => !held.has(m.id));
  const onYours = fresh.filter((m) => mine.has(fixtureOf(m))).slice(0, 4);
  const onTeams = fresh.filter((m) => !mine.has(fixtureOf(m)) && teamMatch(matches.get(fixtureOf(m)))).slice(0, 4);
  const next = [...matches.values()]
    .filter((m) => m.status === "NS" && m.kickoff < now + 14 * 86400 && !mine.has(m.id) && teamMatch(m))
    .sort((a, b) => a.kickoff - b.kickoff)
    .slice(0, 3);
  const prices = useMatchPrices(next.map((m) => m.id));
  const card = (m: OpenMarket) => {
    const match = matches.get(fixtureOf(m));
    return <MarketCard key={m.id} m={m} match={match} now={now} onPick={(side) => onPick(marketPick(m, match, side, send, owner))} />;
  };

  if (!onYours.length && !onTeams.length && !next.length) return null;
  return (
    <>
      {onYours.length > 0 && (
        <div className="sec">
          <SectionHead title="More on your games" more="Markets" href="/markets" />
          {onYours.map(card)}
        </div>
      )}
      {onTeams.length > 0 && (
        <div className="sec">
          <SectionHead title="Your teams" />
          {onTeams.map(card)}
        </div>
      )}
      {next.length > 0 && (
        <div className="sec">
          <SectionHead title="Your teams play next" more="Fixtures" href="/matches" />
          {next.map((m) => <FixtureCard key={m.id} m={m} odds={prices.odds} showDay onPick={(kind) => onPick(prices.pick(m, kind, 1, send, owner))} />)}
        </div>
      )}
    </>
  );
}

/** Home's way in: one line when you've got something on in play or today, with how it stands. */
export function GameDayStrip() {
  const { status, address } = useAccount();
  const { groups } = useGameDay(status === "ready" ? address : null);
  if (!groups) return null;
  const today = new Date().toDateString();
  const on = groups.filter((g) => g.phase === "live" || (g.phase === "upcoming" && new Date(g.kickoff * 1000).toDateString() === today));
  const toCollect = groups.flatMap((g) => g.positions).filter((p) => p.collectible).length;
  if (!on.length && !toCollect) return null;
  const live = on.filter((g) => g.phase === "live");
  const ps = live.flatMap((g) => g.positions);
  const winning = ps.filter((p) => p.standing === "winning").length;
  const losing = ps.filter((p) => p.standing === "losing").length;
  const net = live.reduce((s, g) => s + (g.ifEndsNow ?? 0), 0);
  const read = live.some((g) => g.ifEndsNow !== null);
  return (
    <Link href="/live" className="gd-strip card-tap">
      {live.length ? <Badge tone="live">LIVE</Badge> : <Icon name="whistle" size={20} />}
      <span className="gd-strip-t">
        <span className="uname" style={{ display: "block" }}>
          Game day · {on.length ? `you're on ${on.length} ${on.length === 1 ? "game" : "games"}` : "results are in"}
        </span>
        <span className="umeta">
          {live.length ? `${winning} winning · ${losing} losing${read ? ` · ${signed(net)} if it ends now` : ""}` : toCollect ? `${toCollect} to collect` : "Kick-off later today"}
        </span>
      </span>
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}

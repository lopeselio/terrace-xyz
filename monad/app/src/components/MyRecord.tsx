"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { MonadMark } from "./MonadMark";
import { SignIn } from "./SignIn";
import { Avatar, Badge, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { publicClient } from "@/lib/chain";
import { ADDR, erc20Abi } from "@/lib/contracts";
import { query } from "@/lib/indexer";

type Player = {
  points: string;
  results: number;
  wins: number;
  winRateBps: number;
  streak: number;
  badge: number;
  exactScores: number;
  titles: number;
  takesListed: number;
  takesWon: number;
  backersReceived: number;
};
type Bet = { id: string; side: number; stake: string; result: number | null; payout: string | null; market: { id: string; question: { text: string; answer: number; closeTime: string } } };
type Acca = { id: string; legs: number; stake: string; status: number; payout: string | null };
type Matchup = { id: string; challenger: string; stake: string; status: number; winner: string | null; question: { text: string; kind: number } };
type Created = { id: string; yesPool: string; noPool: string; bettors: number; question: { text: string; answer: number } };
type Member = { seasonScore: number; league: { id: string; name: string; memberCount: number } };

const TIERS = [
  { name: "CASUAL", cls: "casual" },
  { name: "SHARP", cls: "sharp" },
  { name: "LEGEND", cls: "legend" },
];
type Tab = "active" | "history" | "created" | "leagues";
type Filter = "all" | "bets" | "accas" | "1v1";

export function MyRecord() {
  const { status, address, keys, logout } = useAccount();
  const [p, setP] = useState<Player | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [accas, setAccas] = useState<Acca[]>([]);
  const [duels, setDuels] = useState<Matchup[]>([]);
  const [created, setCreated] = useState<Created[]>([]);
  const [leagues, setLeagues] = useState<Member[]>([]);
  const [money, setMoney] = useState<{ usd: bigint; usdc: bigint; gas: bigint } | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [filter, setFilter] = useState<Filter>("all");
  const [toppingUp, setToppingUp] = useState(false);
  const [shared, setShared] = useState(false);

  const load = useCallback(() => {
    if (!address) return;
    const me = address.toLowerCase();
    query<{ Player_by_pk: Player | null; Bet: Bet[]; Parlay: Acca[]; Matchup: Matchup[]; Market: Created[]; LeagueMember: Member[] }>(
      `query R($me: String!) {
        Player_by_pk(id: $me) { points results wins winRateBps streak badge exactScores titles takesListed takesWon backersReceived }
        Bet(where: { bettor: { _eq: $me } }) { id side stake result payout market { id question { text answer closeTime } } }
        Parlay(where: { player: { _eq: $me } }, order_by: { id: desc }) { id legs stake status payout }
        Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }) { id challenger stake status winner question { text kind } }
        Market(where: { creator: { _eq: $me } }, order_by: { createdAt: desc }) { id yesPool noPool bettors question { text answer } }
        LeagueMember(where: { member: { _eq: $me } }) { seasonScore league { id name memberCount } }
      }`,
      { me },
    )
      .then((d) => {
        setP(d.Player_by_pk);
        setBets(d.Bet);
        setAccas(d.Parlay);
        setDuels(d.Matchup);
        setCreated(d.Market);
        setLeagues(d.LeagueMember);
      })
      .catch(() => {});
    Promise.all([
      publicClient.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      publicClient.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      publicClient.getBalance({ address }),
    ]).then(([usd, usdc, gas]) => setMoney({ usd, usdc, gas }));
  }, [address]);
  useEffect(() => { load(); }, [load]);

  if (status !== "ready" || !address) return <SignIn reason="Your record lives on your passkey. Sign in to see it, on any device." />;

  const me = address.toLowerCase();
  const tier = TIERS[p?.badge ?? 0];
  const losses = (p?.results ?? 0) - (p?.wins ?? 0);
  const settledBets = bets.filter((b) => b.result !== null);
  const pnl = settledBets.reduce((s, b) => s + Number(b.payout ?? 0) - Number(b.stake), 0);
  const streak = p?.streak ?? 0;

  async function share() {
    const url = `${window.location.origin}/me`;
    const text = `${fanName(address!)} on Terrace: ${p?.results ? `${Math.round(p.winRateBps / 100)}% win rate over ${p.results} calls` : "just getting started"}. Back your take.`;
    if (navigator.share) await navigator.share({ title: "My Terrace record", text, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    }
  }
  async function topUp() {
    setToppingUp(true);
    await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address }) }).catch(() => {});
    setToppingUp(false);
    load();
  }

  // Tab rows ---------------------------------------------------------------
  type Row = { key: string; kind: Filter; icon: "ball" | "trophy" | "swords"; title: string; sub: string; right: string; tone: "won" | "lost" | "open" | "settled" | "amber"; href?: string };
  const betRows: Row[] = bets.map((b) => {
    const done = b.result !== null || b.market.question.answer !== 0;
    const label = b.result === 1 ? `+${usd(b.payout ?? 0)}` : b.result === 2 ? "LOST" : b.result === 0 ? "REFUND" : b.market.question.answer ? "COLLECT" : b.side === 1 ? "YES" : b.side === 2 ? "NO" : "SEALED";
    return { key: `b${b.id}`, kind: "bets", icon: "ball", title: b.market.question.text, sub: `${usd(b.stake)} staked`, right: label, tone: b.result === 1 ? "won" : b.result === 2 ? "lost" : done ? "amber" : "open", href: undefined, ...(done ? { done: true } : {}) } as Row & { done?: boolean };
  });
  const accaRows: Row[] = accas.map((a) => ({ key: `a${a.id}`, kind: "accas", icon: "trophy", title: `${a.legs}-fold accumulator`, sub: `${usd(a.stake)} stake`, right: ["OPEN", "WON", "LOST", "REFUND", a.payout ? `+${usd(a.payout)}` : "PAID"][a.status], tone: a.status === 2 ? "lost" : a.status === 0 ? "open" : "won", href: "/acca" }));
  const duelRows: Row[] = duels.map((d) => ({ key: `d${d.id}`, kind: "1v1", icon: "swords", title: d.question.text || "Match result 1v1", sub: `${usd(d.stake)} each`, right: d.status === 4 ? (d.winner === me ? "WON" : "LOST") : ["OPEN", "ON", "OFF", "EXPIRED", "", "VOID"][d.status], tone: d.status === 4 ? (d.winner === me ? "won" : "lost") : d.status <= 1 ? "open" : "settled", href: `/c/${d.id}` }));
  const isActive = (r: Row) => (r.kind === "bets" ? !(r as Row & { done?: boolean }).done : r.tone === "open");
  const pool = tab === "active" ? [...betRows, ...accaRows, ...duelRows].filter(isActive) : [...betRows, ...accaRows, ...duelRows].filter((r) => !isActive(r));
  const rows = pool.filter((r) => filter === "all" || r.kind === filter);

  return (
    <>
      <section className="profile-hero">
        <div className="top">
          <Avatar seed={address} size={48} />
          <div style={{ flex: 1 }}>
            <div className="name">{fanName(address)}</div>
            <span className={`tier ${tier.cls}`}><Icon name="shield" size={11} /> {tier.name} TIER</span>
          </div>
          <button className="chip" onClick={logout}>Sign out</button>
        </div>
        <div className="hero-row">
          <div>
            <div className="big-rate">{p?.results ? Math.round(p.winRateBps / 100) : 0}<small>%</small></div>
            <div className="meta" style={{ marginTop: 4 }}>Win rate · {p?.results ?? 0} calls</div>
          </div>
          <div className="streak-tile" title="Current streak">
            <span>
              <Icon name="flame" size={18} />
              <br />
              {streak > 0 ? `W${streak}` : streak < 0 ? `L${-streak}` : "–"}
            </span>
          </div>
        </div>
        <div className="hero-stats">
          <div className="box"><b>{p?.points ?? "0"}</b><span className="meta">Points</span></div>
          <div className="box"><b>{p?.exactScores ?? 0}</b><span className="meta">Exact scores</span></div>
          <button className="cta small" onClick={share}><Icon name="arrowUpRight" size={16} /> {shared ? "Copied" : "Share"}</button>
        </div>
      </section>

      <div className="section-head"><h3>Record</h3></div>
      <div className="stat-grid three">
        <div className="stat"><div className="stat-value green">{p?.wins ?? 0}</div><div className="stat-label">Wins</div></div>
        <div className="stat"><div className="stat-value red">{losses}</div><div className="stat-label">Losses</div></div>
        <div className="stat"><div className="stat-value">{p?.results ?? 0}</div><div className="stat-label">Total calls</div></div>
        <div className="stat"><div className={`stat-value ${pnl >= 0 ? "green" : "red"}`}>{pnl >= 0 ? "+" : "−"}{usd(Math.abs(pnl))}</div><div className="stat-label">Net P&amp;L</div></div>
        <div className="stat"><div className="stat-value amber">{p ? `${p.takesWon}/${p.takesListed}` : "0/0"}</div><div className="stat-label">Takes that came in</div></div>
        <div className="stat"><div className="stat-value violet">{p?.titles ?? 0}</div><div className="stat-label">Titles</div></div>
      </div>

      <div className="section-head"><h3>Wallet</h3></div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-pill no-dot" style={{ paddingLeft: 6 }}><MonadMark size={16} /> Monad testnet</span>
          <strong style={{ marginLeft: "auto", fontFamily: "var(--font-cond)", fontSize: 22 }}>{money ? usd(money.usd) : "…"}</strong>
          <span className="muted" style={{ fontSize: 12 }}>dollars</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span className="muted">USDC</span>
          <strong style={{ marginLeft: "auto" }}>{money ? usd(money.usdc) : "…"}</strong>
        </div>
        <button className="link-btn" style={{ color: "var(--blue)" }} disabled={toppingUp} onClick={topUp}>
          + {toppingUp ? "Topping up…" : "Top up test dollars and gas"}
        </button>
      </div>

      <div className="seg-wide" style={{ marginTop: 18 }}>
        {(["active", "history", "created", "leagues"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : undefined} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {(tab === "active" || tab === "history") && (
        <>
          <div className="chips" style={{ marginBottom: 10 }}>
            {(["all", "bets", "accas", "1v1"] as Filter[]).map((f) => (
              <button key={f} className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "bets" ? "Bets" : f === "accas" ? "Accas" : "1v1"}</button>
            ))}
          </div>
          <div className="mrows">
            {rows.map((r) => {
              const inner = (
                <>
                  <span className="tile"><Icon name={r.icon} size={20} /></span>
                  <span className="body"><div className="title">{r.title}</div><div className="sub">{r.sub}</div></span>
                  <Badge tone={r.tone}>{r.right}</Badge>
                </>
              );
              return r.href ? <Link key={r.key} href={r.href} className="mrow">{inner}</Link> : <div key={r.key} className="mrow">{inner}</div>;
            })}
            {rows.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>{tab === "active" ? "Nothing live. Find a take to back on Home." : "Nothing settled yet."}</p>}
          </div>
        </>
      )}
      {tab === "created" && (
        <div className="mrows">
          {created.map((m) => (
            <div key={m.id} className="mrow">
              <span className="tile"><Icon name="flame" size={20} /></span>
              <span className="body"><div className="title">{m.question.text}</div><div className="sub">{m.bettors} in · {usd(Number(m.yesPool) + Number(m.noPool))} pool · 3% to you</div></span>
              <Badge tone={m.question.answer ? "settled" : "open"}>{m.question.answer ? "SETTLED" : "OPEN"}</Badge>
            </div>
          ))}
          {created.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>Your takes that became markets show up here. You earn 3% of the profit on each.</p>}
        </div>
      )}
      {tab === "leagues" && (
        <div className="mrows">
          {leagues.map((l) => (
            <Link key={l.league.id} href={`/l/${l.league.id}`} className="mrow">
              <span className="tile"><Icon name="crown" size={20} /></span>
              <span className="body"><div className="title">{l.league.name}</div><div className="sub">{l.league.memberCount} members</div></span>
              <span className="chev"><Icon name="chevronRight" size={16} /></span>
            </Link>
          ))}
          {leagues.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>Not in a league yet. <Link href="/leagues" style={{ textDecoration: "underline" }}>Start or join one</Link>.</p>}
        </div>
      )}

      <div className="section-head"><h3>One passkey, many keys</h3></div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Everything here comes from your passkey alone. Nothing is stored on this phone: open Terrace on any device with the same passkey and it all comes back.
      </p>
      <div className="mrows">
        <div className="mrow"><span className="tile"><Icon name="wallet" size={20} /></span><span className="body"><div className="title">Your account</div><div className="sub">{fanName(address)}</div></span></div>
        <div className="mrow"><span className="tile"><Icon name="bolt" size={20} /></span><span className="body"><div className="title">Your AI agent&apos;s own account</div><div className="sub">{keys ? fanName(keys.agentAccount.address, true) : "…"}</div></span></div>
        <div className="mrow"><span className="tile"><Icon name="lock" size={20} /></span><span className="body"><div className="title">Your sealing key</div><div className="sub">Seals private-league picks; reveal them from any device</div></span></div>
        <div className="mrow"><span className="tile"><Icon name="shield" size={20} /></span><span className="body"><div className="title">Your agent&apos;s memory key</div><div className="sub">Encrypts your agent&apos;s notes so only you can read them</div></span></div>
      </div>
    </>
  );
}

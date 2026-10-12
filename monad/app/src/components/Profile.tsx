"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Header, shareLink } from "./Header";
import { Icon } from "./Icon";
import { PointsSheet } from "./PointsSheet";
import { ThemeSwitch } from "./ThemeSwitch";
import { foundingFans, points } from "@/lib/terracePoints";
import { OnboardingPanel } from "./Onboarding";
import { announceCollected } from "./OutcomePopup";
import { WalletSheet } from "./WalletSheet";
import { Avatar, Badge, Empty, FixtureArt, Seg, Tile, fanName, handle, money, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { useFollows } from "@/lib/follows";
import { query } from "@/lib/indexer";
import { questionLabel } from "@/lib/labels";
import { betOutcome } from "@/lib/outcome";
import { fractional, poolDecimal } from "@/lib/odds";
import { collect } from "@/lib/play";
import { balanceChanged, useBalance } from "@/lib/useBalance";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/profile.css";

type Q = { text: string; kind: number; line: number; answer: number; fixture: { id: string } | null };
type Player = { points: string; results: number; wins: number; winRateBps: number; streak: number; badge: number; exactScores: number; titles: number; takesListed: number; takesWon: number };
type Bet = { id: string; side: number; stake: string; result: number | null; payout: string | null; market: { id: string; feeBps: number; yesPool: string; noPool: string; question: Q } };
type Acca = { id: string; legs: number; stake: string; status: number; payout: string | null };
type Duel = { id: string; challenger: string; challengerSide: number; stake: string; status: number; winner: string | null; question: Q };
type Created = { id: string; feeBps: number; yesPool: string; noPool: string; bettors: number; question: Q };
type Member = { seasonScore: number; league: { id: string; name: string; memberCount: number; isPrivate: boolean } };
type Tab = "open" | "settled" | "created" | "leagues";

const TIERS = ["Casual", "Sharp", "Legend"];

/** Profile (screen-profile.html): record, balance, Play tiles, and every bet you've got going. */
export function Profile() {
  const { status, address, keys, send, logout } = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const matches = useMatches();
  const { follows } = useFollows();
  const { balance } = useBalance();
  const [p, setP] = useState<Player | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [tp, setTp] = useState<{ terracePoints: string; dayStreak: number; invitesLanded: number } | null>(null);
  const [graph, setGraph] = useState<{ followers: number; following: number } | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [accas, setAccas] = useState<Acca[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [created, setCreated] = useState<Created[]>([]);
  const [leagues, setLeagues] = useState<Member[]>([]);
  const [tab, setTab] = useState<Tab>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const walletOpen = params.get("wallet") === "1";

  const load = useCallback(() => {
    if (!address) return;
    query<{ Player_by_pk: Player | null; Bet: Bet[]; Parlay: Acca[]; Matchup: Duel[]; Market: Created[]; LeagueMember: Member[] }>(
      `query R($me: String!) {
        Player_by_pk(id: $me) { points results wins winRateBps streak badge exactScores titles takesListed takesWon }
        Bet(where: { bettor: { _eq: $me } }) { id side stake result payout market { id feeBps yesPool noPool question { text kind line answer fixture { id } } } }
        Parlay(where: { player: { _eq: $me } }, order_by: { id: desc }) { id legs stake status payout }
        Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }) { id challenger challengerSide stake status winner question { text kind line answer fixture { id } } }
        Market(where: { creator: { _eq: $me } }, order_by: { createdAt: desc }) { id feeBps yesPool noPool bettors question { text kind line answer fixture { id } } }
        LeagueMember(where: { member: { _eq: $me } }) { seasonScore league { id name memberCount isPrivate } }
      }`,
      { me: address.toLowerCase() },
    )
      .then((d) => {
        setP(d.Player_by_pk);
        query<{ Player_by_pk: { terracePoints: string; dayStreak: number; invitesLanded: number } | null }>(
          `query TP($me: String!) { Player_by_pk(id: $me) { terracePoints dayStreak invitesLanded } }`,
          { me: address.toLowerCase() },
        ).then((x) => setTp(x.Player_by_pk)).catch(() => {});
        query<{ Player_by_pk: { followers: number; following: number } | null }>(
          `query G($me: String!) { Player_by_pk(id: $me) { followers following } }`,
          { me: address.toLowerCase() },
        ).then((x) => setGraph(x.Player_by_pk)).catch(() => {});
        setBets(d.Bet.filter((b) => !b.market.question.text.startsWith("E2E ")).reverse());
        setAccas(d.Parlay);
        setDuels(d.Matchup);
        setCreated(d.Market.filter((m) => !m.question.text.startsWith("E2E ")));
        setLeagues(d.LeagueMember);
      })
      .catch(() => {});
  }, [address]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (status !== "ready" || !address) {
    return (
      <>
        <Header title="Profile" balance={false} />
        <div className="pad page-enter" style={{ paddingTop: 24 }}>
          <OnboardingPanel compact />
        </div>
      </>
    );
  }

  const me = address.toLowerCase();
  const matchOf = (q: Q) => (q.fixture ? matches.get(Number(q.fixture.id)) : undefined);
  const label = (q: Q) => questionLabel(q, matchOf(q));
  const tier = TIERS[p?.badge ?? 0];
  const losses = (p?.results ?? 0) - (p?.wins ?? 0);
  const streak = p?.streak ?? 0;

  // Net P&L across settled bets, parlays and 1v1s.
  const pnl =
    bets.filter((b) => b.result !== null).reduce((s, b) => s + Number(b.payout ?? 0) - Number(b.stake), 0) +
    accas.filter((a) => a.status >= 2 || a.payout).reduce((s, a) => s + Number(a.payout ?? 0) - (a.status === 3 ? 0 : Number(a.stake)), 0) +
    duels.filter((d) => d.status === 4).reduce((s, d) => s + (d.winner === me ? Number(d.stake) : -Number(d.stake)), 0);
  const inBets =
    bets.filter((b) => b.result === null).reduce((s, b) => s + Number(b.stake), 0) +
    accas.filter((a) => a.status === 0).reduce((s, a) => s + Number(a.stake), 0) +
    duels.filter((d) => d.status <= 1).reduce((s, d) => s + Number(d.stake), 0);
  // Fees are paid as winners collect; estimate from settled pools you created.
  const fees = created.reduce((s, m) => {
    const loser = m.question.answer === 1 ? Number(m.noPool) : m.question.answer === 2 ? Number(m.yesPool) : 0;
    return s + (loser * m.feeBps) / 10_000;
  }, 0);

  async function share() {
    const text = `${fanName(address!)} on Terrace: ${p?.results ? `${Math.round(p.winRateBps / 100)}% win rate over ${p.results} calls` : "just getting started"}. Back your take.`;
    setCopied(await shareLink("My Terrace record", text, `${window.location.origin}/me`));
  }
  async function addFunds() {
    setToppingUp(true);
    await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address }) }).catch(() => {});
    setToppingUp(false);
    balanceChanged();
  }
  async function collectBet(b: Bet) {
    setBusy(b.id);
    setError(null);
    try {
      const r = betOutcome(b);
      await collect(send, BigInt(b.market.id), address as Address);
      if (r.outcome === "won" || r.outcome === "refund") {
        const fixture = b.market.question.fixture?.id;
        announceCollected({ id: b.market.id, outcome: r.outcome, title: label(b.market.question), amount: r.amount, href: fixture ? `/m/${fixture}` : "/me" });
      }
      balanceChanged();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const openBets = bets.filter((b) => b.result === null);
  const settledBets = bets.filter((b) => b.result !== null);
  const openAccas = accas.filter((a) => a.status === 0);
  const openDuels = duels.filter((d) => d.status <= 1);

  return (
    <>
      <Header title={fanName(address)} sub={`${tier} tier · ${p?.results ?? 0} calls`} balance={false} share={share} />
      <div className="pad page-enter">
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row">
            <Avatar seed={address} size={58} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 7 }}>
                <span className="cond" style={{ fontSize: 23, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{handle(address)}</span>
                {streak > 0 && <Badge tone="flash" icon="flame">{streak}</Badge>}
              </div>
              <div className="umeta">
                {graph ? `${graph.followers} follower${graph.followers === 1 ? "" : "s"} · following ${graph.following}` : `following ${follows.size}`}
                {copied ? " · link copied" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cond" style={{ fontSize: 38, lineHeight: 0.9 }}>
                {p?.results ? Math.round(p.winRateBps / 100) : 0}
                <span style={{ fontSize: 18, color: "var(--green)" }}>%</span>
              </div>
              <div className="umeta">win rate</div>
            </div>
          </div>
        </div>

        <div className="stats" style={{ marginTop: 10 }}>
          <div className="stat"><div className="v green">{p?.wins ?? 0}</div><div className="k">Won</div></div>
          <div className="stat"><div className="v red">{losses}</div><div className="k">Lost</div></div>
          <div className="stat"><div className={`v${pnl < 0 ? " red" : ""}`}>{pnl >= 0 ? "+" : "−"}{usd(Math.abs(pnl))}</div><div className="k">Profit</div></div>
        </div>

        <button className="card points-card" style={{ marginTop: 10 }} onClick={() => setPointsOpen(true)}>
          <div className="row">
            <span className="points-coin"><Icon name="bolt" size={20} /></span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div className="eyebrow amber">Terrace Points{foundingFans() && " · founding fan 2×"}</div>
              <div className="cond" style={{ fontSize: 30, lineHeight: 1.1 }}>{points(tp?.terracePoints ?? 0)}</div>
              <div className="umeta">
                {!tp || tp.terracePoints === "0"
                  ? `Your welcome ${foundingFans() ? 200 : 100} lands with your first bet or take`
                  : tp.dayStreak ? `${tp.dayStreak}-day run` : "Play today to start a run"}
                {tp?.invitesLanded ? ` · ${tp.invitesLanded} fan${tp.invitesLanded > 1 ? "s" : ""} brought in` : ""}
              </div>
            </div>
            <span className="textbtn amber">How to earn ›</span>
          </div>
        </button>
        {pointsOpen && <PointsSheet address={address} total={tp?.terracePoints ?? 0} onClose={() => setPointsOpen(false)} />}

        <div className="card" style={{ marginTop: 10 }}>
          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Available balance</div>
              <div className="cond" style={{ fontSize: 34, lineHeight: 1.1 }}>{balance ? money(balance.usd) : "…"}</div>
            </div>
            <button className="btn-out" disabled={toppingUp} onClick={addFunds}>
              <Icon name="plus" size={14} /> {toppingUp ? "Adding…" : "Add funds"}
            </button>
          </div>
          <button className="kv" style={{ borderTop: "1px solid var(--line-hair)", marginTop: 12, paddingBottom: 0 }} onClick={() => router.push("/me?wallet=1", { scroll: false })}>
            <span className="k row" style={{ gap: 8 }}><Icon name="wallet" size={16} /> Wallet &amp; payouts</span>
            <span className="v" style={{ color: "var(--ink-3)" }}><Icon name="chevronRight" size={16} /></span>
          </button>
        </div>

        <div className="sec" style={{ padding: "16px 0 6px" }}>
          <div className="sec-hd"><h3>Play</h3></div>
          <div className="stats">
            <Tile href="/challenges" icon="swords">1v1<br />matchups</Tile>
            <Tile href="/acca" icon="list">Build a<br />parlay</Tile>
            <Tile href="/leagues" icon="trophy">Private<br />leagues</Tile>
          </div>
          {keys && (
            <div className="card agent-card">
              <div className="row">
                <Avatar seed={keys.agentAccount.address} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="uname">Your AI agent <Badge tone="private">AI</Badge></div>
                  <div className="umeta">{fanName(keys.agentAccount.address, true)} · its own account, from your passkey</div>
                </div>
              </div>
              <div className="umeta" style={{ marginTop: 10, fontSize: 12.5 }}>
                Hand it to an AI pundit and it can back takes while you&apos;re away, on its own money, never yours. AI players show up on the leaderboard with a violet badge.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 0 10px" }}>
          <Seg<Tab>
            sub
            value={tab}
            onChange={setTab}
            options={[
              { id: "open", label: "Open" },
              { id: "settled", label: "Settled" },
              { id: "created", label: "Created" },
              { id: "leagues", label: "Leagues" },
            ]}
          />
        </div>
        {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}

        <div key={tab} className="page-enter">
          {tab === "open" && (
            <>
              {openBets.map((b) => <BetRow key={b.id} b={b} m={matchOf(b.market.question)} label={label(b.market.question)} busy={busy === b.id} onCollect={() => collectBet(b)} />)}
              {openAccas.map((a) => <AccaRow key={`a${a.id}`} a={a} />)}
              {openDuels.map((d) => <DuelRow key={`d${d.id}`} d={d} me={me} m={matchOf(d.question)} label={label(d.question)} />)}
              {openBets.length + openAccas.length + openDuels.length === 0 && (
                <Empty title="Nothing live" action={<Link href="/markets" className="textbtn">Find a market</Link>}>Back a take and it shows up here.</Empty>
              )}
            </>
          )}
          {tab === "settled" && (
            <>
              {settledBets.map((b) => <BetRow key={b.id} b={b} m={matchOf(b.market.question)} label={label(b.market.question)} />)}
              {accas.filter((a) => a.status !== 0).map((a) => <AccaRow key={`a${a.id}`} a={a} />)}
              {duels.filter((d) => d.status > 1).map((d) => <DuelRow key={`d${d.id}`} d={d} me={me} m={matchOf(d.question)} label={label(d.question)} />)}
              {settledBets.length + accas.filter((a) => a.status !== 0).length + duels.filter((d) => d.status > 1).length === 0 && (
                <Empty title="Nothing settled yet">Results land when Chainlink reads the final whistle.</Empty>
              )}
            </>
          )}
          {tab === "created" && (
            <>
              {created.map((m) => {
                const pool = Number(m.yesPool) + Number(m.noPool);
                return (
                  <div key={m.id} className="card">
                    <div className="row" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="uname" style={{ marginBottom: 6 }}>{label(m.question)}</div>
                        <div className="row" style={{ gap: 6 }}>
                          <Badge tone="settled">{m.bettors} in</Badge>
                          <Badge tone="settled">{usd(pool)} matched</Badge>
                          <Badge tone="flash">{(m.feeBps / 100).toFixed(m.feeBps % 100 ? 1 : 0)}% to you</Badge>
                        </div>
                      </div>
                      <Badge tone={m.question.answer ? "settled" : "open"}>{m.question.answer ? "Settled" : "Open"}</Badge>
                    </div>
                  </div>
                );
              })}
              {created.length === 0 && (
                <Empty title="No markets yet" action={<Link href="/take" className="textbtn">Create one</Link>}>
                  Your takes that become markets show up here. You earn the creator fee on winners&apos; profit.
                </Empty>
              )}
            </>
          )}
          {tab === "leagues" && (
            <>
              {leagues.map((l) => (
                <Link key={l.league.id} href={`/l/${l.league.id}`} className="card card-tap row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cond upper" style={{ fontSize: 20 }}>{l.league.name}</div>
                    <div className="umeta">{l.league.memberCount} members · {l.seasonScore} season pts</div>
                  </div>
                  {l.league.isPrivate ? <Badge tone="sealed">Sealed</Badge> : <Badge tone="open">Open</Badge>}
                  <Icon name="chevronRight" size={16} />
                </Link>
              ))}
              {leagues.length === 0 && (
                <Empty title="Not in a league" action={<Link href="/leagues" className="textbtn">Start or join one</Link>}>Your mates, one table.</Empty>
              )}
            </>
          )}
        </div>
        <div style={{ height: 20 }} />
      </div>
      <div className="pad" style={{ marginTop: 22 }}>
        <div className="flabel">Appearance</div>
        <ThemeSwitch />
      </div>

      <div className="pad" style={{ margin: "22px 0 8px" }}>
        <button className="cta cta-ghost cta-sm" onClick={() => { logout(); router.replace("/"); }}>
          <Icon name="logout" size={16} /> Sign out
        </button>
        <div className="umeta" style={{ textAlign: "center", marginTop: 8 }}>Your passkey brings everything back when you sign in again, on any device.</div>
      </div>

      {walletOpen && <WalletSheet inBets={inBets} feesEarned={created.length ? fees : null} onClose={() => router.replace("/me", { scroll: false })} />}
    </>
  );
}

function BetRow({ b, m, label, busy, onCollect }: { b: Bet; m?: MatchLite; label: string; busy?: boolean; onCollect?: () => void }) {
  const yes = Number(b.market.yesPool), no = Number(b.market.noPool);
  const sidePool = b.side === 1 ? yes : no;
  const dec = b.side ? poolDecimal(sidePool, b.side === 1 ? no : yes) : null;
  const est = sidePool > 0 ? (Number(b.stake) * (yes + no)) / sidePool : Number(b.stake);
  const answer = b.market.question.answer; // 0 open, 1 yes, 2 no, 3 void
  const toCollect = b.result === null && answer !== 0;
  // What Collect will do, mirroring TerraceMarkets.settleBet: void, or nobody on the winning side, means a refund.
  const winningPool = answer === 1 ? yes : answer === 2 ? no : 0;
  const due: "won" | "lost" | "refund" | null = !toCollect
    ? null
    : answer === 3 || b.side === 0 || winningPool === 0
      ? "refund"
      : b.side === answer
        ? "won"
        : "lost";
  const grossDue = due === "won" ? (Number(b.stake) * (yes + no)) / winningPool : 0;
  const winDue = grossDue - ((grossDue - Number(b.stake)) * b.market.feeBps) / 10_000;
  const state =
    b.result === 1 ? "Won" : b.result === 2 ? "Lost" : b.result === 0 ? "Refund"
    : due === "won" ? "Won" : due === "lost" ? "Lost" : due === "refund" ? "Refund" : "Open";
  const value =
    b.result === 1 ? `+${money(b.payout ?? 0)}` : b.result === 2 ? money(b.stake) : b.result === 0 ? money(b.payout ?? b.stake)
    : due === "won" ? `+${money(winDue)}` : due === "lost" ? money(b.stake) : due === "refund" ? money(b.stake) : money(est);
  const why =
    (b.result === 0 || due === "refund") &&
    (answer === 3 ? "Called off, so stakes go back." : "Nobody backed the winning side, so everyone gets their stake back.");
  const tone = state === "Won" ? "won" : state === "Lost" ? "lost" : state === "Refund" ? "refund" : "";
  return (
    <div className={`card ${tone}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <FixtureArt m={m} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="uname" style={{ marginBottom: 6 }}>{label}</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {b.side === 0 ? (
              <Badge tone="sealed">Sealed</Badge>
            ) : (
              <Badge tone={b.side === 1 ? "terrace" : "lost"}>{b.side === 1 ? "Yes" : "No"} · {fractional(dec ?? 2)}</Badge>
            )}
            <Badge tone="settled">{money(b.stake)} stake</Badge>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Badge tone={state === "Won" ? "won" : state === "Lost" ? "lost" : state === "Refund" ? "settled" : "flash"}>{state}</Badge>
          <div className={`cond amt-${tone || "won"}`} style={{ fontSize: 20, marginTop: 6 }}>{state === "Lost" ? `−${value}` : value}</div>
        </div>
      </div>
      {why && <div className="umeta" style={{ marginTop: 8 }}>{why}</div>}
      {toCollect && onCollect && (
        <button className={`cta cta-sm${due === "lost" ? " cta-ghost" : ""}`} style={{ marginTop: 12 }} disabled={busy} onClick={onCollect}>
          {busy ? "One moment…" : due === "won" ? `Collect ${money(winDue)}` : due === "refund" ? `Get my ${money(b.stake)} back` : "Close it out"}
        </button>
      )}
    </div>
  );
}

function AccaRow({ a }: { a: Acca }) {
  const state = ["Open", "Won", "Lost", "Refund", "Paid"][a.status];
  return (
    <Link href="/acca" className={`card card-tap ${a.status === 1 || a.status === 4 ? "won" : a.status === 2 ? "lost" : a.status === 3 ? "refund" : ""}`} style={{ display: "block" }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="uname" style={{ marginBottom: 6 }}>{a.legs}-leg parlay</div>
          <div className="row" style={{ gap: 6 }}><Badge tone="settled">{money(a.stake)} stake</Badge></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Badge tone={a.status === 2 ? "lost" : a.status === 0 ? "flash" : a.status === 3 ? "settled" : "won"}>{a.status === 1 ? "Claim" : state}</Badge>
          {a.payout ? (
            <div className="cond amt-won" style={{ fontSize: 20, marginTop: 6 }}>+{money(a.payout)}</div>
          ) : a.status === 2 ? (
            <div className="cond amt-lost" style={{ fontSize: 20, marginTop: 6 }}>−{money(a.stake)}</div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function DuelRow({ d, me, m, label }: { d: Duel; me: string; m?: MatchLite; label: string }) {
  const mine = d.challenger === me ? d.challengerSide : d.challengerSide === 1 ? 2 : 1;
  const state = d.status === 4 ? (d.winner === me ? "Won" : "Lost") : ["Waiting", "Active", "Declined", "Expired", "", "Refund"][d.status];
  return (
    <Link href={`/c/${d.id}`} className={`card card-tap ${state === "Won" ? "won" : state === "Lost" ? "lost" : state === "Refund" ? "refund" : ""}`} style={{ display: "block" }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <FixtureArt m={m} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="uname" style={{ marginBottom: 6 }}><Icon name="swords" size={14} /> {label || "Match result 1v1"}</div>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone={mine === 1 ? "terrace" : "lost"}>You: {mine === 1 ? "Yes" : "No"}</Badge>
            <Badge tone="settled">{money(d.stake)} each</Badge>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Badge tone={state === "Won" ? "won" : state === "Lost" ? "lost" : d.status <= 1 ? "open" : "settled"}>{state}</Badge>
          <div className={`cond ${state === "Lost" ? "amt-lost" : state === "Won" ? "amt-won" : "amt-refund"}`} style={{ fontSize: 20, marginTop: 6 }}>
            {state === "Lost" ? `−${money(d.stake)}` : state === "Won" ? `+${money(Number(d.stake) * 2)}` : money(Number(d.stake) * 2)}
          </div>
        </div>
      </div>
    </Link>
  );
}

export type { MatchLite };

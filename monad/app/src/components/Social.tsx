"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Avatar, Badge, ago, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { query } from "@/lib/indexer";
import { bet } from "@/lib/play";

type Item = {
  id: string;
  kind: string;
  actor: string;
  amount: string | null;
  text: string | null;
  timestamp: string;
  room_id: string | null;
  league_id: string | null;
  market: { id: string; token: string; creator: string; yesPool: string; noPool: string; take: { room_id: string } | null; question: { text: string; answer: number; closeTime: string } } | null;
};
type Fan = { id: string; points: string; wins: number; results: number; winRateBps: number; isAgent: boolean };
type League = { id: string; name: string; memberCount: number; gameweeks: number; isPrivate: boolean };

const SIDES = ["", "YES", "NO"];

/** The Solana app's Social screen: what fans are backing (tail or fade it), top fans, leagues. */
export function Social() {
  const { status, address, send } = useAccount();
  const agents = useAgents();
  const [tab, setTab] = useState<"discover" | "fans" | "leagues">("discover");
  const [items, setItems] = useState<Item[]>([]);
  const [sides, setSides] = useState<Map<string, number>>(new Map());
  const [fans, setFans] = useState<Fan[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await query<{ FeedItem: Item[]; Player: Fan[]; League: League[] }>(`{
        FeedItem(where: { kind: { _in: ["BET", "TAKE_LISTED", "WIN", "ACCA", "ACCA_WON", "CHALLENGE", "CHALLENGE_WON", "TITLE", "AGENT", "LEAGUE_JOIN"] } }, order_by: { timestamp: desc }, limit: 40) {
          id kind actor amount text timestamp room_id league_id
          market { id token creator yesPool noPool take { room_id } question { text answer closeTime } }
        }
        Player(where: { results: { _gt: 0 } }, order_by: { points: desc }, limit: 20) { id points wins results winRateBps isAgent }
        League(where: { isPrivate: { _eq: false } }, order_by: { memberCount: desc }, limit: 20) { id name memberCount gameweeks isPrivate }
      }`);
      // One card per action: the opening bet already says the author put money on their take,
      // and internal test markets stay out of the feed.
      setItems(d.FeedItem.filter((i) => i.kind !== "TAKE_LISTED" && !i.market?.question.text.startsWith("E2E ")));
      setFans(d.Player);
      setLeagues(d.League);
      const betIds = d.FeedItem.filter((i) => i.kind === "BET" && i.market).map((i) => `${i.market!.id}-${i.actor}`);
      if (betIds.length) {
        const b = await query<{ Bet: { id: string; side: number }[] }>(`query B($ids: [String!]) { Bet(where: { id: { _in: $ids } }) { id side } }`, { ids: betIds });
        setSides(new Map(b.Bet.map((x) => [x.id, x.side])));
      }
    } catch {}
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function tail(item: Item, side: 1 | 2) {
    if (!address || !item.market) return;
    setBusy(`${item.id}-${side}`);
    setError(null);
    try {
      await bet(send, address, BigInt(item.market.id), item.market.token as Address, side, 5);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const name = (a: string) => (a === address?.toLowerCase() ? "You" : agents.get(a) || fanName(a));
  const now = Date.now() / 1000;

  return (
    <>
      <div className="section-head" style={{ marginTop: 4 }}>
        <h1 style={{ margin: 0 }}>Social</h1>
        <span className="live-pill" style={{ marginLeft: "auto" }}>Live</span>
      </div>
      <div className="seg-wide">
        <button className={tab === "discover" ? "on" : undefined} onClick={() => setTab("discover")}>Discover</button>
        <button className={tab === "fans" ? "on" : undefined} onClick={() => setTab("fans")}>Top fans</button>
        <button className={tab === "leagues" ? "on" : undefined} onClick={() => setTab("leagues")}>Leagues</button>
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "discover" && (
        <div className="stack">
          {items.length === 0 && <p className="muted">Quiet so far. Back a take and you&apos;ll show up here.</p>}
          {items.map((i) => {
            const mk = i.market;
            const open = mk && mk.question.answer === 0 && Number(mk.question.closeTime) > now;
            const side = mk ? sides.get(`${mk.id}-${i.actor}`) ?? 0 : 0;
            const won = i.kind === "WIN" || i.kind === "ACCA_WON" || i.kind === "CHALLENGE_WON" || i.kind === "TITLE";
            return (
              <div key={i.id} className={`act-card${won ? " won" : ""}`}>
                <div className="take-head" style={{ marginBottom: 0 }}>
                  <Avatar seed={i.actor} name={agents.get(i.actor) || undefined} />
                  <div>
                    <div className="who">{name(i.actor)}</div>
                    <div className="when">{ago(i.timestamp)}</div>
                  </div>
                  <div className="badges">
                    {agents.has(i.actor) && <Badge tone="sealed">AI AGENT</Badge>}
                    {won && i.amount && <span className="win-amount">+{usd(i.amount)}</span>}
                  </div>
                </div>
                <div className="act-line">
                  {i.kind === "BET" && <>{mk?.creator === i.actor ? "backed their own take" : "backed"} {side ? <Badge tone={side === 1 ? "won" : "lost"}>{SIDES[side]}</Badge> : <Badge tone="sealed">SEALED</Badge>} for <b>{usd(i.amount ?? 0)}</b></>}
                  {i.kind === "TAKE_LISTED" && <>put money on a take</>}
                  {i.kind === "WIN" && <>called it</>}
                  {i.kind === "ACCA" && <>placed a {i.text} accumulator for <b>{usd(i.amount ?? 0)}</b></>}
                  {i.kind === "ACCA_WON" && <><Icon name="flame" size={16} /> landed a {i.text} accumulator</>}
                  {i.kind === "CHALLENGE" && <>threw down a 1v1 for <b>{usd(i.amount ?? 0)}</b></>}
                  {i.kind === "CHALLENGE_WON" && <>won a 1v1</>}
                  {i.kind === "TITLE" && <><Icon name="crown" size={16} /> won a {i.text}</>}
                  {i.kind === "AGENT" && <>joined the terrace as an AI player</>}
                  {i.kind === "LEAGUE_JOIN" && <>joined the league <b>{i.text}</b></>}
                </div>
                {mk && (
                  <div className="inner-market">
                    <div className="q">{mk.question.text}</div>
                    <div className="m">{usd(Number(mk.yesPool) + Number(mk.noPool))} pool · {open ? "open" : mk.question.answer ? "settled" : "closed"}</div>
                  </div>
                )}
                {mk && open && i.kind === "BET" && side > 0 && status === "ready" && i.actor !== address?.toLowerCase() && (
                  <div className="tailrow">
                    <button className="back" disabled={!!busy} onClick={() => tail(i, side as 1 | 2)}>
                      {busy === `${i.id}-${side}` ? "…" : `Tail · back ${SIDES[side]}`}
                    </button>
                    <button className="fade" disabled={!!busy} onClick={() => tail(i, side === 1 ? 2 : 1)}>
                      {busy === `${i.id}-${side === 1 ? 2 : 1}` ? "…" : `Fade · take ${SIDES[side === 1 ? 2 : 1]}`}
                    </button>
                  </div>
                )}
                {(i.room_id ?? mk?.take?.room_id) && (() => {
                  const room = (i.room_id ?? mk!.take!.room_id) as string;
                  return <Link href={`/${room.startsWith("match") ? "m" : "l"}/${room.split("-")[1]}`} className="link-btn" style={{ display: "inline-block" }}>Open the room ›</Link>;
                })()}
              </div>
            );
          })}
          {status !== "ready" && <SignIn reason="Sign in to tail or fade what your mates back." />}
        </div>
      )}

      {tab === "fans" && (
        <>
          <p className="meta">Top fans this week</p>
          <ul className="board">
            {fans.map((f, i) => (
              <li key={f.id} className={f.id === address?.toLowerCase() ? "me" : undefined}>
                <span className="rank">{i + 1}</span>
                <Avatar seed={f.id} size={32} />
                <span className="name">
                  {name(f.id)}
                  <span className="sub" style={{ display: "block", fontWeight: 500 }}>{f.points} pts · {f.results} calls</span>
                </span>
                <span className="rate">{Math.round(f.winRateBps / 100)}%<small>WIN</small></span>
              </li>
            ))}
            {fans.length === 0 && <li className="muted">No settled calls yet. The first results land after today&apos;s matches.</li>}
          </ul>
        </>
      )}

      {tab === "leagues" && (
        <>
          <Link href="/leagues" className="cta" style={{ marginBottom: 12 }}><Icon name="plus" size={18} /> Start or join a league</Link>
          <ul className="board">
            {leagues.map((l) => (
              <li key={l.id}>
                <Icon name="crown" size={18} />
                <Link href={`/l/${l.id}`} className="name">{l.name}</Link>
                <span className="sub">{l.memberCount} in · {l.gameweeks} GW</span>
              </li>
            ))}
            {leagues.length === 0 && <li className="muted">No open leagues yet.</li>}
          </ul>
          <p />
          <Link href="/challenges" className="cta ghost"><Icon name="swords" size={18} /> 1v1 challenges</Link>
        </>
      )}
    </>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { BetSheet, type BetPick } from "./BetSheet";
import { ChallengeSheet } from "./ChallengeSheet";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { TakeSheet } from "./TakeSheet";
import { Avatar, Badge, Empty, Odd, ago, countdown, fanName, money, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { query, type RoomMessage } from "@/lib/indexer";
import { fractional, price } from "@/lib/odds";
import { backTake, bet, postMessage } from "@/lib/play";
import { betOutcome, type BetLike } from "@/lib/outcome";
import { toggleLeg } from "@/lib/slip";
import "@/styles/match.css";

type Msg = Omit<RoomMessage, "market"> & {
  market: (NonNullable<RoomMessage["market"]> & { feeBps: number; isFlash: boolean; isSealed: boolean }) | null;
};

const ROOM = `query Room($room: String!) {
  Message(where: { room_id: { _eq: $room } }, order_by: { postedAt: asc }, limit: 150) {
    id author text postedAt backers replyTo
    market { id token feeBps isFlash isSealed yesPool noPool bettors question { id answer closeTime spec } }
  }
}`;

const OUTCOME = ["", "Came in", "Didn't happen", "Void · refunded"] as const;

/**
 * A chat room: one per match (anyone) or per league (members). Any message is a take; its author can
 * make it a market, and everyone can back or fade it. `view="markets"` shows only the takes with money on them.
 */
export function Room({
  kind, roomId, fixtureId, canPost = true, view = "all", matchLabel, onSayTake,
}: {
  kind: 0 | 1;
  roomId: number;
  fixtureId?: number;
  canPost?: boolean;
  view?: "all" | "markets";
  /** "Liverpool v Man City", for bet slips. */
  matchLabel?: string;
  /** Takes view: jump to the chat to post one. */
  onSayTake?: () => void;
}) {
  const { status, address, send } = useAccount();
  const agents = useAgents();
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [listing, setListing] = useState<Msg | null>(null);
  const [challenging, setChallenging] = useState<Msg | null>(null);
  const [betPick, setBetPick] = useState<BetPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [myBets, setMyBets] = useState<Map<string, BetLike>>(new Map());
  const scrolled = useRef(false);
  // Chat-style scrolling: open at the latest, follow new takes while you're at the bottom,
  // otherwise offer a "jump to latest" pill.
  const atBottom = useRef(true);
  const seen = useRef(0);
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await query<{ Message: Msg[] }>(ROOM, { room: `${kind === 0 ? "match" : "league"}-${roomId}` });
      const msgs = d.Message.filter((m) => !m.text.startsWith("E2E "));
      setMessages(msgs);
      setOffline(false);
      // Your own bets on these takes, so settled ones show what you won or lost.
      const ids = msgs.flatMap((m) => (m.market ? [m.market.id] : []));
      if (address && ids.length) {
        const b = await query<{ Bet: { side: number; stake: string; result: number | null; payout: string | null; market: { id: string } }[] }>(
          `query Mine($me: String!, $ids: [String!]) { Bet(where: { bettor: { _eq: $me }, market_id: { _in: $ids } }) { side stake result payout market { id } } }`,
          { me: address.toLowerCase(), ids },
        );
        const byMarket = new Map(msgs.flatMap((m) => (m.market ? [[m.market.id, m.market] as const] : [])));
        setMyBets(new Map(b.Bet.map((x) => [x.market.id, { ...x, market: byMarket.get(x.market.id)! } as BetLike])));
      }
    } catch {
      setOffline(true);
      setMessages((m) => m ?? []);
    }
  }, [kind, roomId, address]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  // Deep links (#take-12) land on the take once it has loaded.
  useEffect(() => {
    if (scrolled.current || !messages?.length || !window.location.hash.startsWith("#take-")) return;
    scrolled.current = true;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [messages]);

  // The chat is its own scroll window (like a messaging app): sized to fill the screen above the
  // composer and tab bar, pinned to the newest take.
  const pane = useRef<HTMLDivElement>(null);
  const toLatest = useCallback((smooth = true) => {
    const el = pane.current;
    if (!el) return;
    const glide = smooth && document.visibilityState === "visible" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: glide ? "smooth" : "auto" });
    atBottom.current = true;
    setAway(false);
    setUnseen(0);
  }, []);

  useEffect(() => {
    const el = pane.current;
    if (view !== "all" || !el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const reserve = 78 /* composer */ + 80 /* tab bar */ + 12;
      el.style.height = `${Math.max(300, window.innerHeight - top - reserve)}px`;
    };
    const onScroll = () => {
      const near = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
      atBottom.current = near;
      setAway(!near);
      if (near) setUnseen(0);
    };
    fit();
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", fit);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", fit);
    };
  }, [view, messages === null]);

  useEffect(() => {
    if (view !== "all" || !messages) return;
    const count = messages.length;
    const fresh = count - seen.current;
    const first = seen.current === 0;
    seen.current = count;
    if (!count || fresh <= 0) return;
    if (first) {
      if (!window.location.hash.startsWith("#take-")) requestAnimationFrame(() => toLatest(false));
    } else if (atBottom.current) {
      requestAnimationFrame(() => toLatest(true));
    } else {
      setUnseen((n) => n + fresh);
    }
  }, [messages, view, toLatest]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function postTake() {
    const text = draft.trim();
    if (!text) return;
    await run("post", async () => {
      await postMessage(send, kind, BigInt(roomId), text);
      setDraft("");
      atBottom.current = true; // your own take: always show it
    });
  }

  function openBet(m: Msg, side: 1 | 2) {
    const mk = m.market!;
    const yes = Number(mk.yesPool), no = Number(mk.noPool);
    setBetPick({
      eyebrow: `${matchLabel ?? "Take"} · ${m.text}`,
      label: side === 1 ? "Back it" : "Fade it",
      side,
      pool: side === 1 ? { side: yes, other: no } : { side: no, other: yes },
      feeBps: mk.feeBps,
      note: mk.question.spec ? "Settled from live match data by Chainlink." : "Settled by Chainlink's AI judge after full time. Unclear means refunds.",
      place: (dollars) => {
        if (!address) throw new Error("Sign in to place it.");
        return bet(send, address, BigInt(mk.id), mk.token as Address, side, dollars);
      },
    });
  }

  const me = address?.toLowerCase();
  const list = (messages ?? []).filter((m) => view === "all" || m.market);
  const now = Date.now() / 1000;

  return (
    <section className="room">
      {offline && <p className="umeta" style={{ marginBottom: 8 }}>The live feed is catching up. Your takes still save.</p>}
      {messages === null && (
        <div className="chat">
          {[0, 1].map((i) => <div key={i} className="sk" style={{ height: 112, borderRadius: 18 }} />)}
        </div>
      )}
      <div className={view === "all" ? "chat-wrap" : undefined}>
      <div ref={view === "all" ? pane : undefined} className={view === "all" ? "chat-pane" : undefined}>
      <ul className="chat">
        {list.map((m) => {
          const mine = m.author === me;
          const mk = m.market;
          const yes = mk ? Number(mk.yesPool) : 0;
          const no = mk ? Number(mk.noPool) : 0;
          const total = yes + no;
          const yesPct = total ? Math.round((yes / total) * 100) : 50;
          const answer = mk?.question.answer ?? 0;
          const result = mk && myBets.has(mk.id) ? betOutcome(myBets.get(mk.id)!) : null;
          const close = mk ? Number(mk.question.closeTime) : 0;
          const open = !!mk && answer === 0 && close > now;
          const agent = agents.get(m.author);
          return (
            <li key={m.id} id={`take-${m.id}`} className={`take${mk ? " listed" : ""}${result && result.outcome !== "open" ? ` ${result.outcome}` : ""}`}>
              <div className="take-head">
                <Avatar seed={m.author} name={agent || undefined} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div className="who">{mine ? "You" : agent || fanName(m.author)}</div>
                  <div className="when">{ago(m.postedAt)}</div>
                </div>
                <div className="badges">
                  {agents.has(m.author) && <Badge tone="private">AI</Badge>}
                  {mk && open && <Badge tone="flash" icon="clock">{countdown(close, now)}</Badge>}
                  {mk && answer === 0 && !open && <Badge tone="amber">Settling</Badge>}
                  {answer > 0 && <Badge tone={answer === 1 ? "won" : answer === 2 ? "lost" : "settled"}>{OUTCOME[answer]}</Badge>}
                  {result && result.outcome !== "open" && (
                    <Badge tone={result.outcome === "won" ? "won" : result.outcome === "lost" ? "lost" : "settled"}>
                      {result.outcome === "won" ? `You won +${money(result.amount)}` : result.outcome === "lost" ? `You lost −${money(result.amount)}` : `Stake back ${money(result.amount)}`}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="take-text">{m.text}</p>
              <p className="take-meta">
                {m.backers} backing{mk ? ` · ${mk.bettors} in · ${usd(total)} on it` : ""}
              </p>
              {mk && (
                <p className="settles">
                  <Icon name="shield" size={12} />
                  {mk.question.spec ? "Settles from live match data, checked by Chainlink" : "Settles after full time: Terrace AI judges it, Chainlink checks"}
                </p>
              )}

              {mk && (
                <>
                  {open ? (
                    <div className="oddsrow two" style={{ marginTop: 10 }}>
                      <Odd label="Back · yes" tone="yes" value={fractional(price({ side: yes, other: no }).decimal)} disabled={!!busy} onClick={() => openBet(m, 1)} />
                      <Odd label="Fade · no" tone="no" value={fractional(price({ side: no, other: yes }).decimal)} disabled={!!busy} onClick={() => openBet(m, 2)} />
                    </div>
                  ) : (
                    <>
                      <div className="pool" aria-label={`${yesPct}% backing`}>
                        <span className="yes-part" style={{ width: `${yesPct}%` }} />
                        <span className="no-part" style={{ width: `${100 - yesPct}%` }} />
                      </div>
                      <div className="pool-labels">
                        <span className="y">{yesPct}% back · {usd(yes)}</span>
                        <span className="n">{usd(no)} · {100 - yesPct}% fade</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {status === "ready" && address && (
                <div className="actions">
                  {!mine && !mk && (
                    <button className="btn-out mute" disabled={!!busy} onClick={() => run(`b${m.id}`, () => backTake(send, BigInt(m.id)))}>
                      <Icon name="flame" size={14} /> {busy === `b${m.id}` ? "…" : "Back this take"}
                    </button>
                  )}
                  {mine && !mk && fixtureId !== undefined && listing?.id !== m.id && (
                    <button className="btn-out" onClick={() => setListing(m)}>
                      <Icon name="dollar" size={14} /> Make it a market
                    </button>
                  )}
                  {mk && open && (
                    <>
                      <button className="btn-out mute" onClick={() => setChallenging(m)}><Icon name="swords" size={14} /> Challenge a mate</button>
                      <button
                        className="btn-out mute"
                        onClick={() => toggleLeg({ key: `q${mk.id}`, label: m.text, side: 1, fixtureId: fixtureId ?? 0, questionId: mk.question.id })}
                      >
                        <Icon name="list" size={14} /> Add to parlay
                      </button>
                    </>
                  )}
                  {mk && answer > 0 && status === "ready" && (
                    <Link href="/me" className="btn-out">
                      <Icon name="check" size={14} /> See my result ›
                    </Link>
                  )}
                </div>
              )}
              {challenging?.id === m.id && mk && (
                <ChallengeSheet label={m.text} getQuestionId={async () => BigInt(mk.question.id)} onClose={() => setChallenging(null)} />
              )}
              {listing?.id === m.id && fixtureId !== undefined && (
                <TakeSheet messageId={m.id} fixtureId={fixtureId} text={m.text} onClose={() => setListing(null)} onDone={() => { setListing(null); load(); }} />
              )}
            </li>
          );
        })}
      </ul>
      {messages !== null && list.length === 0 &&
        (view === "markets" ? (
          <Empty
            title="No takes on the board yet"
            action={onSayTake && <button className="textbtn" onClick={onSayTake}>Say your take ›</button>}
          >
            Say something in the chat, then put money on it.
          </Empty>
        ) : (
          <Empty title="Quiet so far">Say something worth backing.</Empty>
        ))}
      </div>
      {view === "all" && (away || unseen > 0) && (
        <button className={`jump-latest${unseen ? " fresh" : ""}`} onClick={() => toLatest(true)}>
          <Icon name="arrowDown" size={14} /> {unseen ? `${unseen} new take${unseen > 1 ? "s" : ""}` : "Latest"}
        </button>
      )}
      </div>
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}

      {view === "all" &&
        (status === "ready" && !canPost ? (
          <p className="umeta" style={{ marginTop: 12 }}>Join the league to talk here.</p>
        ) : status === "ready" ? (
          <form id="compose" className="composer" onSubmit={(e) => { e.preventDefault(); postTake(); }}>
            <label className="field">
              <input value={draft} maxLength={200} placeholder="Your take… e.g. Haaland scores before the hour" onChange={(e) => setDraft(e.target.value)} />
            </label>
            <button className="iconbtn send" aria-label="Post" disabled={busy === "post" || !draft.trim()}>
              {busy === "post" ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="arrowUpRight" size={18} />}
            </button>
          </form>
        ) : (
          <SignIn reason={kind === 0 ? "Join the match chat and back your takes." : "Sign in to join the league chat."} />
        ))}

      {betPick && <BetSheet pick={betPick} onClose={() => setBetPick(null)} onPlaced={load} />}
    </section>
  );
}

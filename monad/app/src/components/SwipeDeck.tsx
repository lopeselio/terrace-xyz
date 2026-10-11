"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Icon } from "./Icon";
import { TerraceMark } from "./TerraceMark";
import { SignIn } from "./SignIn";
import { Badge, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { bet } from "@/lib/play";
import { useMatches } from "@/lib/useMatches";

/*
 * The swipe deck from the Solana app (SwipeDeck.tsx), for the web:
 *   right → back it (YES)    left → fade it (NO)    up → open the room    down → skip
 * Pointer events drive the drag; a fast flick commits below the distance.
 */
type Card = {
  id: string;
  text: string;
  room_id: string;
  market: { id: string; token: string; yesPool: string; noPool: string; bettors: number; isSealed: boolean; isFlash: boolean; question: { answer: number; closeTime: string; spec: string | null } };
};
type Dir = "yes" | "no" | "detail" | "skip";

const COMMIT_FRACTION = 0.32;
const SWIPE_Y = 110;
const FLING = 0.6; // px per ms

const multiple = (yes: number, no: number, side: 1 | 2, stake: number) => {
  const total = yes + no + stake;
  return total / ((side === 1 ? yes : no) + stake);
};

function countdown(closeTime: number, now: number) {
  const s = Math.max(0, closeTime - now);
  if (s <= 0) return "RESOLVING";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
}

export function SwipeDeck() {
  const { status, address, send } = useAccount();
  const matches = useMatches();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stake, setStake] = useState(5);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<Dir | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const width = useRef(340);

  useEffect(() => {
    query<{ Message: Card[] }>(
      `{ Message(where: { market_id: { _is_null: false } }, order_by: { heat: desc }, limit: 40) {
          id text room_id market { id token yesPool noPool bettors isSealed isFlash question { answer closeTime spec } } } }`,
    )
      .then((d) => {
        const t = Date.now() / 1000;
        setCards(d.Message.filter((c) => !c.text.startsWith("E2E ") && !c.market.isSealed && c.market.question.answer === 0 && Number(c.market.question.closeTime) > t));
      })
      .catch(() => setCards([]));
    const tick = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(tick);
  }, []);

  const card = cards?.[index];
  const next = cards?.[index + 1];

  const commit = useCallback(
    async (dir: Dir) => {
      if (!card || leaving) return;
      if ((dir === "yes" || dir === "no") && status !== "ready") {
        setToast("Sign in to back or fade.");
        setDrag({ x: 0, y: 0, active: false });
        return;
      }
      setLeaving(dir);
      if (dir === "detail") {
        window.location.href = `/m/${card.room_id.split("-")[1]}#take-${card.id}`;
        return;
      }
      if (dir === "yes" || dir === "no") {
        const side = dir === "yes" ? 1 : 2;
        bet(send, address!, BigInt(card.market.id), card.market.token as Address, side, stake)
          .then(() => setToast(`${dir === "yes" ? "Backed" : "Faded"} for $${stake}. Locked in.`))
          .catch((e) => setToast((e as Error).message));
      }
      setTimeout(() => {
        setIndex((i) => i + 1);
        setLeaving(null);
        setDrag({ x: 0, y: 0, active: false });
      }, 260);
    },
    [card, leaving, status, send, address, stake],
  );

  // Pointer drag --------------------------------------------------------------
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    width.current = e.currentTarget.offsetWidth;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    const v = Math.hypot(dx, dy) / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && (Math.abs(dx) > width.current * COMMIT_FRACTION || (v > FLING && Math.abs(dx) > 40))) return commit(dx > 0 ? "yes" : "no");
    if (!horizontal && (Math.abs(dy) > SWIPE_Y || (v > FLING && Math.abs(dy) > 40))) return commit(dy < 0 ? "detail" : "skip");
    setDrag({ x: 0, y: 0, active: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowRight: "yes", ArrowLeft: "no", ArrowUp: "detail", ArrowDown: "skip" };
      if (map[e.key]) commit(map[e.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit]);

  if (cards === null) return <div className="deck-state"><div className="spinner" /> Dealing the cards…</div>;
  if (!card)
    return (
      <div className="deck-state">
        <Icon name="check" size={32} />
        <p className="caught-up">You&apos;re all caught up.</p>
        <p className="muted">New takes land as fans post them. Start one yourself.</p>
        <Link href="/take" className="cta small" style={{ marginTop: 8 }}>Say your take</Link>
      </div>
    );

  const exitX = leaving === "yes" ? 600 : leaving === "no" ? -600 : 0;
  const exitY = leaving === "detail" ? -600 : leaving === "skip" ? 600 : 0;
  const x = leaving ? exitX : drag.x;
  const y = leaving ? exitY : drag.y;
  const rot = x / 18;
  const yesOpacity = Math.max(0, Math.min(1, x / 90));
  const noOpacity = Math.max(0, Math.min(1, -x / 90));

  return (
    <div className="deck">
      <div className="deck-stage">
        {next && <DeckCard card={next} matches={matches} stake={stake} now={now} under />}
        <div
          className="deck-card top"
          style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, transition: drag.active && !leaving ? "none" : "transform 260ms cubic-bezier(.22,1,.36,1)" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <span className="stamp yes" style={{ opacity: yesOpacity }}>BACK</span>
          <span className="stamp no" style={{ opacity: noOpacity }}>FADE</span>
          <DeckCard card={card} matches={matches} stake={stake} now={now} />
        </div>
      </div>

      <div className="chips" style={{ justifyContent: "center", marginTop: 14 }}>
        {[1, 5, 10, 25].map((d) => (
          <button key={d} className={`chip${stake === d ? " on" : ""}`} onClick={() => setStake(d)}>${d}</button>
        ))}
      </div>
      <div className="deck-actions">
        <button className="act no" aria-label="Fade it" onClick={() => commit("no")}><Icon name="close" size={26} /></button>
        <button className="act skip" aria-label="Skip" onClick={() => commit("skip")}><Icon name="arrowDown" size={20} /></button>
        <button className="act detail" aria-label="Open the room" onClick={() => commit("detail")}><Icon name="arrowUpRight" size={20} /></button>
        <button className="act yes" aria-label="Back it" onClick={() => commit("yes")}><Icon name="check" size={28} /></button>
      </div>
      <p className="deck-counter">{index + 1} of {cards.length} · swipe right to back, left to fade</p>
      {toast && <p className="deck-toast" onAnimationEnd={() => setToast(null)}>{toast}</p>}
      {status !== "ready" && <SignIn reason="Sign in to back or fade with a swipe." />}
    </div>
  );
}

function DeckCard({ card, matches, stake, now, under }: { card: Card; matches: ReturnType<typeof useMatches>; stake: number; now: number; under?: boolean }) {
  const m = matches.get(Number(card.room_id.split("-")[1]));
  const yes = Number(card.market.yesPool);
  const no = Number(card.market.noPool);
  const total = yes + no;
  const close = Number(card.market.question.closeTime);
  const inner = (
    <>
      <div className="deck-meta">
        <span className="badge open"><TerraceMark size={13} round /> TERRACE</span>
        <Badge tone="chainlink">{card.market.question.spec ? "MATCH DATA" : "AI JUDGE"}</Badge>
        {card.market.isFlash && <Badge tone="flash">FLASH</Badge>}
        <span className="deck-clock">{countdown(close, now)}</span>
      </div>
      <div className="deck-hero">
        {m ? (
          <div className="crest-pair">
            <span className="crest-col"><img src={m.home.logo} alt="" width={64} height={64} />{m.home.name}</span>
            <span className="vs">vs</span>
            <span className="crest-col"><img src={m.away.logo} alt="" width={64} height={64} />{m.away.name}</span>
          </div>
        ) : (
          <Icon name="ball" size={56} />
        )}
      </div>
      <div className="deck-context">{m ? `${m.home.name} v ${m.away.name}` : "Match room"}</div>
      <div className="deck-statement">{card.text}</div>
      <div className="odds-row">
        <div className="odds no"><span className="lbl">Fade</span><span className="val">{multiple(yes, no, 2, stake * 1e6).toFixed(2)}x</span></div>
        <div className="odds yes"><span className="lbl">Back</span><span className="val">{multiple(yes, no, 1, stake * 1e6).toFixed(2)}x</span></div>
      </div>
      <div className="deck-matched">{card.market.bettors} in · {usd(total)} pool · payout for ${stake}</div>
    </>
  );
  return under ? <div className="deck-card under">{inner}</div> : inner;
}

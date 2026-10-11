"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BetSheet, type BetPick } from "./BetSheet";
import { Icon } from "./Icon";
import { fixtureOf, marketOdds, marketPick, marketTitle, type OpenMarket } from "./MarketCard";
import { Badge, Crest, Odd, countdown, usd } from "./ui";
import { useAccount } from "@/lib/account";
import type { MatchLite } from "@/lib/useMatches";
import "@/styles/markets.css";

/*
 * The swipe deck (handoff "Markets — swipe deck").
 *   right → back (yes)   left → fade (no)   up → open the match   down → skip
 * The card follows the finger 1:1 through refs (never React state); rotation clamp(dx/20, ±12deg).
 * Commit at |dx| > 105px or a fling ≥ 0.35px/ms, then the bet sheet opens on that side:
 * cancelling it puts the card back, placing the bet consumes it.
 */
const COMMIT_X = 105;
const COMMIT_Y = 105;
const FLING = 0.35;
const EASE = "cubic-bezier(.22,1,.36,1)";

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

export function SwipeDeck({ markets, matches, now }: { markets: OpenMarket[]; matches: Map<number, MatchLite>; now: number }) {
  const router = useRouter();
  const { status, address, send } = useAccount();
  const owner = status === "ready" ? address : null;
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pick, setPick] = useState<BetPick | null>(null);
  const placed = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const yes = useRef<HTMLDivElement>(null);
  const no = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; dy: number; crossed: boolean } | null>(null);
  const busy = useRef(false);

  const deck = markets.filter((m) => !m.isFlash && !done.has(m.id) && !skipped.includes(m.id)).slice(0, 40);
  const top = deck[0];
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const paint = (dx: number, dy: number, transition = "none") => {
    const el = card.current;
    if (!el) return;
    const rot = reduce ? 0 : Math.max(-12, Math.min(12, dx / 20));
    el.style.transition = transition;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    if (yes.current) yes.current.style.opacity = String(Math.max(0, Math.min(1, dx / 110)));
    if (no.current) no.current.style.opacity = String(Math.max(0, Math.min(1, -dx / 110)));
  };
  const springHome = () => paint(0, 0, `transform 220ms ${EASE}`);

  // A new top card always starts centred.
  useEffect(() => {
    paint(0, 0);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.id]);

  const commit = useCallback(
    (dir: "yes" | "no" | "detail" | "skip") => {
      if (!top || busy.current) return;
      busy.current = true;
      buzz(18);
      const el = card.current;
      if (dir === "detail") {
        if (el) {
          el.style.transition = `transform 240ms ${EASE}, opacity 240ms`;
          el.style.transform = "translate(0, -460px)";
          el.style.opacity = "0";
        }
        router.push(`/m/${fixtureOf(top)}${top.take ? `#take-${top.take.id}` : ""}`);
        return;
      }
      if (dir === "skip") {
        if (el) {
          el.style.transition = `transform 240ms ${EASE}, opacity 240ms`;
          el.style.transform = "translate(0, 460px)";
          el.style.opacity = "0";
        }
        setTimeout(() => {
          if (el) el.style.opacity = "1";
          setSkipped((s) => [...s, top.id]);
        }, 240);
        return;
      }
      const side = dir === "yes" ? 1 : 2;
      const sign = side === 1 ? 1 : -1;
      if (el) {
        el.style.transition = `transform 240ms ${EASE}, opacity 240ms`;
        el.style.transform = `translate(${sign * 460}px, -40px) rotate(${reduce ? 0 : sign * 18}deg)`;
        el.style.opacity = "0";
      }
      placed.current = false;
      setTimeout(() => setPick(marketPick(top, matches.get(fixtureOf(top)), side, send, owner)), 200);
    },
    [top, matches, send, owner, router, reduce],
  );

  function closeSheet() {
    setPick(null);
    const el = card.current;
    if (placed.current && top) {
      if (el) el.style.opacity = "1";
      setDone((d) => new Set(d).add(top.id));
    } else if (el) {
      // Cancelled: the card comes back to the deck.
      el.style.opacity = "1";
      springHome();
      busy.current = false;
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pick || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const map = { ArrowRight: "yes", ArrowLeft: "no", ArrowUp: "detail", ArrowDown: "skip" } as const;
      const dir = map[e.key as keyof typeof map];
      if (dir) {
        e.preventDefault();
        commit(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, pick]);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy.current || (e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, crossed: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dx = e.clientX - d.x;
    d.dy = e.clientY - d.y;
    const crossed = Math.abs(d.dx) > COMMIT_X;
    if (crossed !== d.crossed) {
      d.crossed = crossed;
      if (crossed) buzz(8);
    }
    paint(d.dx, d.dy);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = Math.hypot(d.dx, d.dy) / Math.max(1, performance.now() - d.t);
    const horizontal = Math.abs(d.dx) >= Math.abs(d.dy);
    if (horizontal && (Math.abs(d.dx) > COMMIT_X || (v >= FLING && Math.abs(d.dx) > 30))) return commit(d.dx > 0 ? "yes" : "no");
    if (!horizontal && (Math.abs(d.dy) > COMMIT_Y || (v >= FLING && Math.abs(d.dy) > 30))) return commit(d.dy < 0 ? "detail" : "skip");
    springHome();
  };

  if (!top) {
    return (
      <>
        <div className="stage">
          <div className="swipecard caught-up">
            <div className="empty" style={{ padding: "60px 12px" }}>
              <h4>You&apos;re all caught up</h4>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
                {markets.length ? "New calls land as fans post takes." : "No open markets right now. Start one with +."}
              </div>
              {skipped.length > 0 && (
                <button className="textbtn" style={{ marginTop: 14 }} onClick={() => setSkipped([])}>Reshuffle skipped</button>
              )}
            </div>
          </div>
        </div>
        <div className="deckacts" style={{ opacity: 0.4 }} aria-hidden>
          <span className="act a-no"><Icon name="close" size={26} /></span>
          <span className="act a-skip"><Icon name="arrowDown" /></span>
          <span className="act a-info"><Icon name="info" /></span>
          <span className="act a-yes"><Icon name="check" size={26} /></span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="stage">
        {deck[2] && <div className="swipecard under2" aria-hidden />}
        {deck[1] && (
          <div className="swipecard under" aria-hidden>
            <Face m={deck[1]} match={matches.get(fixtureOf(deck[1]))} now={now} />
          </div>
        )}
        <div
          key={top.id}
          ref={card}
          className="swipecard top"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="stamp y" ref={yes}>Back</div>
          <div className="stamp n" ref={no}>Fade</div>
          <Face m={top} match={matches.get(fixtureOf(top))} now={now} onSide={(s) => commit(s === 1 ? "yes" : "no")} />
        </div>
      </div>
      <div className="deckacts">
        <button className="act a-no" aria-label="Fade it" onClick={() => commit("no")}><Icon name="close" size={26} /></button>
        <button className="act a-skip" aria-label="Skip" onClick={() => commit("skip")}><Icon name="arrowDown" /></button>
        <button className="act a-info" aria-label="Open the match" onClick={() => commit("detail")}><Icon name="info" /></button>
        <button className="act a-yes" aria-label="Back it" onClick={() => commit("yes")}><Icon name="check" size={26} /></button>
      </div>
      <div className="deckmeta">{deck.length} {deck.length === 1 ? "call" : "calls"} left · swipe left to fade · right to back</div>
      {pick && (
        <BetSheet
          pick={pick}
          onPlaced={() => {
            placed.current = true;
          }}
          onClose={closeSheet}
        />
      )}
    </>
  );
}

function Face({ m, match, now, onSide }: { m: OpenMarket; match?: MatchLite; now: number; onSide?: (side: 1 | 2) => void }) {
  return (
    <>
      <div className="match-top">
        <Badge tone="terrace">Terrace</Badge>
        <Badge tone="chainlink">{m.question.spec || m.question.kind > 0 ? "Match data" : "AI judge"}</Badge>
        <span style={{ marginLeft: "auto" }}><Badge tone="flash" icon="clock">{countdown(Number(m.question.closeTime), now)}</Badge></span>
      </div>
      <div className="face-hero">
        {match ? (
          <div className="row" style={{ gap: 16 }}>
            <div className="crest-col"><Crest lg logo={match.home.logo} name={match.home.name} /><div className="umeta">{match.home.name}</div></div>
            <div className="cond" style={{ fontSize: 15, color: "var(--ink-4)" }}>V</div>
            <div className="crest-col"><Crest lg logo={match.away.logo} name={match.away.name} /><div className="umeta">{match.away.name}</div></div>
          </div>
        ) : (
          <Icon name="ball" size={48} />
        )}
        <div className="match-lg">{match?.league ?? "Football"} · {m.question.kind > 0 ? "Match result" : "Fan take"}</div>
      </div>
      <div className="face-call">{marketTitle(m, match)}</div>
      <div className="oddsrow two" style={{ marginTop: 12 }}>
        <Odd label="Back · yes" value={marketOdds(m, 1)} tone="yes" onClick={() => onSide?.(1)} />
        <Odd label="Fade · no" value={marketOdds(m, 2)} tone="no" onClick={() => onSide?.(2)} />
      </div>
      <div className="kv face-matched">
        <span className="k">Matched</span>
        <span className="v">{usd(Number(m.yesPool) + Number(m.noPool))}</span>
      </div>
    </>
  );
}

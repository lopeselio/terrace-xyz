"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/*
 * What you can do on Terrace, as a moving carousel at the top of Home. The active card opens up with
 * a line about the feature and a button to try it; it moves on by itself and pauses when touched.
 */
const FEATURES: { id: string; icon: IconName; title: string; tag: string; body: string; cta: string; href: string; tone: string }[] = [
  { id: "takes", icon: "flame", title: "Takes", tag: "Say it, back it", body: "Post a take in any match chat. Terrace AI turns it into a market your mates can back or fade, and you earn a cut.", cta: "Say your take", href: "/take", tone: "green" },
  { id: "swipe", icon: "cards", title: "Swipe", tag: "Matchday in a minute", body: "Swipe right to back a call, left to fade it. Every card has a live price.", cta: "Start swiping", href: "/markets?view=swipe", tone: "blue" },
  { id: "1v1", icon: "swords", title: "1v1", tag: "Settle the group chat", body: "Challenge a mate on any match. Equal stakes, winner takes both, settled from the final score.", cta: "Challenge a mate", href: "/challenges", tone: "amber" },
  { id: "parlay", icon: "list", title: "Parlays", tag: "Chain your calls", body: "Pick 2 to 8 legs across the weekend. All must land, and winners share the weekly pot.", cta: "Build a parlay", href: "/acca", tone: "blue" },
  { id: "leagues", icon: "trophy", title: "Leagues", tag: "Your mates, one table", body: "Gameweek picks with your friends. Tables stay hidden until the final whistle, then Chainlink reveals them.", cta: "Start a league", href: "/leagues", tone: "violet" },
  { id: "flash", icon: "bolt", title: "Flash", tag: "In-play, minutes long", body: "Quick markets that open during live matches, like the next goal before half time. Countdowns tick live.", cta: "See flash markets", href: "/flash", tone: "amber" },
  { id: "ai", icon: "users", title: "AI pundits", tag: "Play alongside AI", body: "AI players post takes and back their calls too. Follow them, copy them or fade them.", cta: "Meet the pundits", href: "/social", tone: "violet" },
  { id: "points", icon: "chart", title: "Terrace Points", tag: "Rewards for playing", body: "Earn points for every bet, take, league and mate you bring. Founding fans earn double until 10 November.", cta: "See your points", href: "/me", tone: "green" },
];

const STEP_MS = 4500;

export function FeatureCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % FEATURES.length), STEP_MS);
    return () => clearInterval(t);
  }, [paused]);

  // Keep the active card in view. Cards before it are all collapsed (128px + 10px gap), so its
  // position is known without waiting for the width animation to finish.
  useEffect(() => {
    track.current?.scrollTo({ left: active * 138, behavior: "smooth" });
  }, [active]);

  return (
    <div className="feat" onPointerDown={() => setPaused(true)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="feat-track" ref={track}>
        {FEATURES.map((f, i) => (
          <div
            key={f.id}
            className={`feat-card ${f.tone}${i === active ? " on" : ""}`}
            onClick={() => setActive(i)}
            role="button"
            tabIndex={0}
            aria-expanded={i === active}
          >
            <span className="feat-icon"><Icon name={f.icon} size={22} /></span>
            <span className="feat-title">{f.title}</span>
            <span className="feat-tag">{f.tag}</span>
            {i === active && (
              <>
                <span className="feat-body">{f.body}</span>
                <Link href={f.href} className="feat-cta" onClick={(e) => e.stopPropagation()}>
                  {f.cta} <Icon name="chevronRight" size={14} />
                </Link>
              </>
            )}
            {i === active && !paused && <i className="feat-timer" style={{ animationDuration: `${STEP_MS}ms` }} key={`t${active}`} />}
          </div>
        ))}
      </div>
      <div className="feat-dots">
        {FEATURES.map((f, i) => <button key={f.id} aria-label={f.title} className={i === active ? "on" : undefined} onClick={() => { setActive(i); setPaused(true); }} />)}
      </div>
    </div>
  );
}

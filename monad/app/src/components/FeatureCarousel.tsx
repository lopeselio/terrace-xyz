"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/* Gradient feature cards from the Solana home screen, one per way to play. */
const CARDS: { href: string; title: string; sub: string; icon: IconName; tone: string }[] = [
  { href: "/take", title: "Takes", sub: "Say it, then put money on it", icon: "flame", tone: "g-green" },
  { href: "/acca", title: "Accumulators", sub: "Chain your convictions", icon: "trophy", tone: "g-blue" },
  { href: "/leagues", title: "Leagues", sub: "Your mates, one table", icon: "crown", tone: "g-violet" },
  { href: "/challenges", title: "1v1", sub: "Settle group chat bets", icon: "swords", tone: "g-amber" },
];

export function FeatureCarousel() {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  return (
    <>
      <div
        className="carousel"
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (el) setPage(Math.min(CARDS.length - 1, Math.round(el.scrollLeft / 178)));
        }}
      >
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className={`fc ${c.tone}`}>
            <span className="e"><Icon name={c.icon} size={26} /></span>
            <span className="t">{c.title}</span>
            <span className="s">{c.sub}</span>
          </Link>
        ))}
      </div>
      <div className="dots" aria-hidden>
        {CARDS.map((c, i) => <span key={c.href} className={i === page ? "on" : undefined} />)}
      </div>
    </>
  );
}

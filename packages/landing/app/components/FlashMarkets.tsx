"use client";

import { useState, useEffect } from "react";

const flashMarkets = [
  {
    question: "Next goal in this half?",
    match: "Man City vs Arsenal",
    league: "Premier League",
    yes: 58,
    no: 42,
    expiresIn: 23,
    vol: "$1.2k",
  },
  {
    question: "Bellingham scores before 70 min?",
    match: "Real Madrid vs Bayern",
    league: "Champions League",
    yes: 44,
    no: 56,
    expiresIn: 47,
    vol: "$3.8k",
  },
  {
    question: "Red card in next 15 minutes?",
    match: "El Clásico",
    league: "La Liga",
    yes: 12,
    no: 88,
    expiresIn: 11,
    vol: "$890",
  },
  {
    question: "Penalty awarded by half time?",
    match: "Liverpool vs Chelsea",
    league: "Premier League",
    yes: 31,
    no: 69,
    expiresIn: 38,
    vol: "$2.1k",
  },
];

function Countdown({ minutes }: { minutes: number }) {
  const [secs, setSecs] = useState(minutes * 60);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const urgent = secs < 600;

  return (
    <span
      className={`font-mono font-bold text-sm tabular-nums ${
        urgent ? "text-fire" : "text-white/60"
      }`}
    >
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

function FlashCard({ market }: { market: (typeof flashMarkets)[0] }) {
  const [hovered, setHovered] = useState<"yes" | "no" | null>(null);

  return (
    <div
      className="glass-strong rounded-2xl p-5 border border-white/5 hover:border-pitch/20 transition-all duration-300 group"
      onMouseEnter={() => {}}
      onMouseLeave={() => setHovered(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-fire animate-pulse" />
          <span className="text-[10px] font-bold text-fire tracking-widest uppercase">
            Flash
          </span>
          <span className="text-[10px] text-text-muted">{market.league}</span>
        </div>
        <Countdown minutes={market.expiresIn} />
      </div>

      {/* Match */}
      <p className="text-xs text-text-muted mb-2">{market.match}</p>

      {/* Question */}
      <p className="text-white font-semibold text-sm leading-snug mb-4">
        {market.question}
      </p>

      {/* Odds bar */}
      <div className="h-1.5 rounded-full bg-white/5 mb-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pitch to-pitch/80 rounded-full transition-all duration-500"
          style={{ width: `${market.yes}%` }}
        />
      </div>

      {/* Bet buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`py-2 rounded-xl text-sm font-semibold transition-all ${
            hovered === "yes"
              ? "bg-pitch text-black"
              : "bg-pitch/10 text-pitch hover:bg-pitch/20"
          }`}
          onMouseEnter={() => setHovered("yes")}
          onMouseLeave={() => setHovered(null)}
        >
          YES {market.yes}¢
        </button>
        <button
          className={`py-2 rounded-xl text-sm font-semibold transition-all ${
            hovered === "no"
              ? "bg-red-500 text-white"
              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          }`}
          onMouseEnter={() => setHovered("no")}
          onMouseLeave={() => setHovered(null)}
        >
          NO {market.no}¢
        </button>
      </div>

      <p className="text-[10px] text-text-muted text-center mt-3">
        {market.vol} volume
      </p>
    </div>
  );
}

export default function FlashMarkets() {
  return (
    <section id="markets" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 bg-fire/10 border border-fire/20 rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-fire animate-pulse" />
            <span className="text-xs font-semibold text-fire tracking-wide uppercase">
              Flash Markets
            </span>
          </div>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight leading-tight mb-4">
            Bet the moment.
            <br />
            <span className="text-fire glow-fire">While it&rsquo;s live.</span>
          </h2>
          <p className="text-white/50 text-lg leading-relaxed">
            Flash markets open and close within 15–90 minutes, capturing every
            micro-moment of the match. Next goal. Red card. Who scores next.
            No waiting for full-time.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {flashMarkets.map((m, i) => (
            <FlashCard key={i} market={m} />
          ))}
        </div>

        {/* Bottom highlight */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "⚡",
              title: "15–90 min windows",
              desc: "Markets designed for in-match action. Open, bet, settle, all inside a half.",
            },
            {
              icon: "⏱️",
              title: "Live countdown",
              desc: "Every card shows a live timer. The urgency is part of the game.",
            },
            {
              icon: "🔴",
              title: "Priority sorted",
              desc: "Flash markets always surface first. You never miss a live window.",
            },
          ].map((item) => (
            <div key={item.title} className="glass rounded-xl p-5 flex gap-4">
              <span className="text-2xl flex-shrink-0">{item.icon}</span>
              <div>
                <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

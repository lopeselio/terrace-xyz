"use client";

import { useState } from "react";

const legs = [
  {
    id: 1,
    question: "Man City to win vs Arsenal",
    match: "Man City vs Arsenal · PL",
    yesOdds: 65,
    noOdds: 35,
  },
  {
    id: 2,
    question: "Haaland scores anytime",
    match: "Man City vs Arsenal · PL",
    yesOdds: 58,
    noOdds: 42,
  },
  {
    id: 3,
    question: "Over 2.5 goals",
    match: "Real Madrid vs Bayern · UCL",
    yesOdds: 71,
    noOdds: 29,
  },
  {
    id: 4,
    question: "Bellingham POTM",
    match: "Real Madrid vs Bayern · UCL",
    yesOdds: 44,
    noOdds: 56,
  },
];

function calcMultiplier(picks: Record<number, "yes" | "no">) {
  const selected = Object.entries(picks);
  if (selected.length === 0) return 1;
  return selected.reduce((acc, [id, pick]) => {
    const leg = legs.find((l) => l.id === Number(id));
    if (!leg) return acc;
    const odds = pick === "yes" ? leg.yesOdds : leg.noOdds;
    return acc * (100 / odds);
  }, 1);
}

export default function ParlayBuilder() {
  const [picks, setPicks] = useState<Record<number, "yes" | "no">>({});
  const [stake, setStake] = useState(50);

  const toggle = (id: number, side: "yes" | "no") => {
    setPicks((prev) => {
      if (prev[id] === side) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: side };
    });
  };

  const multiplier = calcMultiplier(picks);
  const payout = stake * multiplier;
  const legCount = Object.keys(picks).length;

  return (
    <section id="parlays" className="py-32 px-6 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-pitch/10 border border-pitch/20 rounded-full px-3 py-1 mb-6">
            <span className="text-xs font-semibold text-pitch tracking-wide uppercase">
              Parlay Builder
            </span>
          </div>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight leading-tight mb-4">
            Chain your
            <span className="text-pitch"> convictions.</span>
          </h2>
          <p className="text-white/50 text-lg">
            Stack up to 8 legs. Each correct pick multiplies your payout.
            All settled on-chain. No house, no middleman.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Leg selector */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            {legs.map((leg) => {
              const picked = picks[leg.id];
              return (
                <div
                  key={leg.id}
                  className={`glass rounded-2xl p-5 border transition-all duration-200 ${
                    picked
                      ? "border-pitch/30 bg-pitch/5"
                      : "border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-1">
                        {leg.match}
                      </p>
                      <p className="text-white font-semibold text-sm leading-snug">
                        {leg.question}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggle(leg.id, "yes")}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          picked === "yes"
                            ? "bg-pitch text-black"
                            : "bg-pitch/10 text-pitch hover:bg-pitch/20"
                        }`}
                      >
                        YES {leg.yesOdds}¢
                      </button>
                      <button
                        onClick={() => toggle(leg.id, "no")}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          picked === "no"
                            ? "bg-red-500 text-white"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        }`}
                      >
                        NO {leg.noOdds}¢
                      </button>
                    </div>
                  </div>
                  {picked && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-pitch" />
                      <span className="text-xs text-pitch font-medium">
                        You picked{" "}
                        <span className="uppercase font-bold">{picked}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Slip */}
          <div className="glass-strong rounded-2xl p-6 border border-white/5 sticky top-24">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pitch flex items-center justify-center text-black text-xs font-black">
                {legCount}
              </span>
              Parlay Slip
            </h3>

            {legCount === 0 && (
              <p className="text-text-muted text-sm text-center py-6">
                Pick YES or NO on any market above
              </p>
            )}

            {legCount > 0 && (
              <>
                <div className="flex flex-col gap-2 mb-5">
                  {Object.entries(picks).map(([id, side]) => {
                    const leg = legs.find((l) => l.id === Number(id));
                    if (!leg) return null;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-white/70 truncate max-w-[70%]">
                          {leg.question}
                        </span>
                        <span
                          className={`font-bold ml-2 ${
                            side === "yes" ? "text-pitch" : "text-red-400"
                          }`}
                        >
                          {side.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-white/5 mb-5" />

                {/* Multiplier display */}
                <div className="text-center mb-4">
                  <div className="text-4xl font-black text-pitch">
                    {multiplier.toFixed(2)}×
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Current multiplier
                  </div>
                </div>
              </>
            )}

            {/* Stake */}
            <div className="mb-4">
              <label className="text-xs text-text-muted mb-2 block">
                Stake (USDC)
              </label>
              <div className="flex gap-2 mb-2">
                {[10, 25, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStake(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      stake === v
                        ? "bg-pitch text-black"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={1}
                max={500}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-full accent-pitch"
              />
            </div>

            {/* Payout */}
            <div className="bg-pitch/5 border border-pitch/20 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Stake</span>
                <span className="text-white font-medium">${stake}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-text-muted">Multiplier</span>
                <span className="text-pitch font-bold">
                  {multiplier.toFixed(2)}×
                </span>
              </div>
              <div className="h-px bg-white/5 my-2" />
              <div className="flex justify-between">
                <span className="text-white font-semibold">Potential win</span>
                <span className="text-pitch font-black text-lg">
                  ${payout.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                legCount >= 2
                  ? "bg-pitch text-black hover:bg-pitch-dim hover:scale-[1.02]"
                  : "bg-white/5 text-text-muted cursor-not-allowed"
              }`}
              disabled={legCount < 2}
            >
              {legCount < 2
                ? `Add ${2 - legCount} more leg${2 - legCount === 1 ? "" : "s"}`
                : "Place Parlay on Solana"}
            </button>
            <p className="text-[10px] text-text-muted text-center mt-2">
              On-chain settlement · USDC payout
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

const steps = [
  {
    actor: "You",
    color: "text-pitch",
    bg: "bg-pitch/10",
    border: "border-pitch/30",
    title: "Issue the challenge",
    detail: "Pick a market, choose your side, set the stake. Your stake is locked automatically. No intermediary holds it.",
    tag: "STEP 01",
  },
  {
    actor: "Them",
    color: "text-sol",
    bg: "bg-sol/10",
    border: "border-sol/30",
    title: "They accept",
    detail: "Your opponent sees the open challenge and locks in equal stake. They automatically take the other side. No negotiating.",
    tag: "STEP 02",
  },
  {
    actor: "Chain",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/30",
    title: "Market settles automatically",
    detail: "The underlying market resolves. Either player taps Settle. The outcome is read and the full pot goes to the winner. No fees, no middleman.",
    tag: "STEP 03",
  },
];

const openChallenges = [
  {
    market: "Will Liverpool win UCL?",
    challenger: "0xf3a…2b1",
    badge: "👑",
    side: "YES",
    stake: "$5",
    id: "3rKGDSxJ",
    ago: "2m ago",
  },
  {
    market: "Man City Top 4 finish?",
    challenger: "0xa9c…7f4",
    badge: "⚡",
    side: "NO",
    stake: "$20",
    id: "CAjZfXvU",
    ago: "6m ago",
  },
  {
    market: "Haaland scores vs Arsenal?",
    challenger: "0x77e…c29",
    badge: "👑",
    side: "YES",
    stake: "$10",
    id: "8mXpQRnT",
    ago: "11m ago",
  },
];

export default function Matchups() {
  const [accepted, setAccepted] = useState<string | null>(null);

  return (
    <section id="matchups" className="py-32 px-6 relative overflow-hidden">
      {/* Accent glow */}
      <div className="absolute top-1/2 right-0 w-[500px] h-[500px] rounded-full bg-pitch/5 blur-3xl pointer-events-none -translate-y-1/2" />

      <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-pitch/10 border border-pitch/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
            <span className="text-xs font-semibold text-pitch tracking-wide uppercase">
              1v1 Matchups
            </span>
          </div>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight mb-4">
            Put your money where
            <br />
            <span className="text-pitch glow-green">your mouth is.</span>
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Challenge any fan directly. Equal stakes, opposing sides, one winner. Pure peer-to-peer 1v1. No house, no spread.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left: flow steps */}
          <div className="flex flex-col gap-4">
            {steps.map((s, i) => (
              <div
                key={s.tag}
                className={`relative glass rounded-2xl p-5 border ${s.border} overflow-hidden group`}
              >
                {/* Faint step number watermark */}
                <span className={`absolute -right-2 -top-3 text-[72px] font-black opacity-[0.04] ${s.color} select-none pointer-events-none`}>
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="flex items-start gap-4">
                  <span className={`text-[10px] font-bold tracking-widest ${s.color} ${s.bg} border ${s.border} rounded-full px-2.5 py-1 flex-shrink-0 mt-0.5`}>
                    {s.tag}
                  </span>
                  <div>
                    <h3 className="text-white font-bold text-sm mb-1">{s.title}</h3>
                    <p className="text-text-muted text-xs leading-relaxed">{s.detail}</p>
                  </div>
                </div>
              </div>
            ))}

            {/* Rules strip */}
            <div className="glass rounded-2xl p-5 border border-white/5 mt-2">
              <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">Key rules</p>
              <ul className="flex flex-col gap-2">
                {[
                  { icon: "⚖️", text: "Equal stake on both sides, not an AMM" },
                  { icon: "🏆", text: "Winner takes 2× their stake" },
                  { icon: "↩️", text: "No response? Challenger reclaims their stake" },
                ].map((r) => (
                  <li key={r.text} className="flex items-center gap-3 text-xs text-white/60">
                    <span className="text-base">{r.icon}</span>
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: live challenges mockup */}
          <div className="glass-strong rounded-2xl overflow-hidden border border-white/5">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex gap-3">
                <button className="text-sm font-semibold text-white border-b-2 border-pitch pb-1">
                  Open Challenges
                </button>
                <button className="text-sm text-text-muted pb-1">Active</button>
                <button className="text-sm text-text-muted pb-1">Settled</button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
                <span className="text-xs text-pitch font-medium">Live</span>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {openChallenges.map((c) => (
                <div key={c.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sol/40 to-pitch/30 flex items-center justify-center text-sm flex-shrink-0">
                      {c.badge}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">{c.challenger}</span>
                        <span className="text-[10px] text-text-muted ml-auto">{c.ago}</span>
                      </div>
                      <p className="text-xs text-white/70 leading-snug mb-2">{c.market}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-pitch/20 text-pitch px-2 py-0.5 rounded-full font-bold">
                          {c.challenger.split("…")[0]}… picked {c.side}
                        </span>
                        <span className="text-[10px] bg-white/5 text-white/50 px-2 py-0.5 rounded-full font-medium">
                          Stake {c.stake} each · Pot {`$${parseInt(c.stake.replace("$", "")) * 2}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pl-12">
                    <span className="text-[10px] text-text-muted">
                      You get <span className="text-sol font-bold">{c.side === "YES" ? "NO" : "YES"}</span> ·{" "}
                      <span className="font-mono text-white/30">{c.id}…</span>
                    </span>
                    <button
                      onClick={() => setAccepted(c.id)}
                      className={`ml-auto text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${
                        accepted === c.id
                          ? "bg-pitch/20 text-pitch border border-pitch/30 cursor-default"
                          : "bg-pitch text-black hover:bg-pitch-dim hover:scale-105"
                      }`}
                    >
                      {accepted === c.id ? "✓ Accepted" : "Accept"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-white/5 text-center">
              <span className="text-xs text-text-muted">
                Stake locked automatically ·{" "}
                <span className="text-pitch">Powered by Solana</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

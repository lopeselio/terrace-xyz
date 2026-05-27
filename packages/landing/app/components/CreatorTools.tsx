"use client";

import { useState } from "react";

export default function CreatorTools() {
  const [fee, setFee] = useState(2);
  const [isFlash, setIsFlash] = useState(false);
  const [question, setQuestion] = useState(
    "Will Bellingham score in the second half?"
  );

  const estimatedVol = 2400;
  const earn = (estimatedVol * fee) / 100;

  return (
    <section id="creators" className="py-32 px-6 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute inset-0 bg-pitch-gradient opacity-30 pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-fire/10 border border-fire/20 rounded-full px-3 py-1 mb-6">
            <span className="text-xs font-semibold text-fire tracking-wide uppercase">
              Creator Economy
            </span>
          </div>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight leading-tight mb-4">
            Your question.
            <br />
            <span className="text-fire">Your market.</span>{" "}
            <span className="text-white">Your fees.</span>
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            Deploy a prediction market in under 30 seconds. Set your fee.
            Watch the volume roll in. Earn from every winning payout,
            automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Create market UI mockup */}
          <div className="glass-strong rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-fire" />
              <span className="text-sm font-semibold">Create Market</span>
            </div>

            <div className="p-6 space-y-5">
              {/* Question */}
              <div>
                <label className="text-xs text-text-muted mb-2 block font-medium uppercase tracking-wider">
                  Your question
                </label>
                <textarea
                  value={question}
                  onChange={(e) =>
                    setQuestion(e.target.value.slice(0, 200))
                  }
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-pitch/50 transition-colors"
                  rows={2}
                />
                <div className="text-right text-[10px] text-text-muted mt-1">
                  {question.length}/200
                </div>
              </div>

              {/* Flash toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    Flash Market
                  </p>
                  <p className="text-xs text-text-muted">
                    15–90 min live window
                  </p>
                </div>
                <button
                  onClick={() => setIsFlash(!isFlash)}
                  className={`w-11 h-6 rounded-full transition-all relative ${
                    isFlash ? "bg-fire" : "bg-white/10"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      isFlash ? "left-5.5 translate-x-full scale-90" : "left-0.5"
                    }`}
                    style={{ left: isFlash ? "22px" : "2px" }}
                  />
                </button>
              </div>

              {/* Expiry presets */}
              <div>
                <label className="text-xs text-text-muted mb-2 block font-medium uppercase tracking-wider">
                  Expiry
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(isFlash
                    ? ["15m", "30m", "45m", "90m"]
                    : ["+1h", "+4h", "+24h", "+7d"]
                  ).map((t, i) => (
                    <button
                      key={t}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                        i === 0
                          ? "bg-pitch text-black"
                          : "bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-text-muted font-medium uppercase tracking-wider">
                    Creator fee
                  </label>
                  <span className="text-sm font-bold text-pitch">{fee}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.5}
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                  className="w-full accent-pitch"
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                  <span>0% (no fee)</span>
                  <span>5% max</span>
                </div>
              </div>

              {/* Earnings estimate */}
              <div className="bg-pitch/5 border border-pitch/20 rounded-xl p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-text-muted">Avg market volume</span>
                  <span className="text-white">
                    ~${estimatedVol.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-text-muted">Your fee rate</span>
                  <span className="text-pitch font-bold">{fee}%</span>
                </div>
                <div className="h-px bg-white/5 my-2" />
                <div className="flex justify-between">
                  <span className="text-white font-semibold">Est. earnings</span>
                  <span className="text-pitch font-black text-lg">
                    ~${earn.toFixed(0)} USDC
                  </span>
                </div>
              </div>

              {/* Deploy button */}
              <button className="w-full bg-fire text-white font-bold py-3 rounded-xl hover:bg-fire-dim transition-all hover:scale-[1.01] text-sm">
                Deploy to Solana
              </button>
            </div>
          </div>

          {/* Right: Value props */}
          <div className="flex flex-col gap-6">
            {[
              {
                icon: "🏗️",
                title: "Open to everyone",
                desc: "Any fan can launch a market. No approval process. Just your question, your fee, your crowd.",
                color: "text-fire",
                bg: "bg-fire/10",
                border: "border-fire/20",
              },
              {
                icon: "💰",
                title: "Automatic fee collection",
                desc: "When your market settles, your creator fee is automatically credited to your account. Enforced by the protocol.",
                color: "text-pitch",
                bg: "bg-pitch/10",
                border: "border-pitch/20",
              },
              {
                icon: "📊",
                title: "Creator dashboard",
                desc: "Track every market you deployed: volume, fee earned, open/settled status, and live expiry countdown.",
                color: "text-sol",
                bg: "bg-sol/10",
                border: "border-sol/20",
              },
              {
                icon: "🔒",
                title: "Private markets (coming soon)",
                desc: "Encrypt your market with Light Protocol. Positions are hidden until settlement. Perfect for group competitions.",
                color: "text-text-muted",
                bg: "bg-white/5",
                border: "border-white/10",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-2xl p-5 border ${item.bg} ${item.border} flex gap-4 hover:scale-[1.01] transition-all`}
              >
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <div>
                  <h3 className={`font-bold mb-1 ${item.color}`}>
                    {item.title}
                  </h3>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

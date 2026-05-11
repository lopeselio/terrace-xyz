"use client";

const badges = [
  {
    tier: "Casual",
    icon: "🎯",
    threshold: "< 50% win rate",
    color: "text-white/60",
    bg: "bg-white/5",
    border: "border-white/10",
    glow: "",
    desc: "Just getting started. Every Legend was once a Casual.",
  },
  {
    tier: "Sharp",
    icon: "⚡",
    threshold: "≥ 50% win rate",
    color: "text-sol",
    bg: "bg-sol/10",
    border: "border-sol/30",
    glow: "shadow-sol/20",
    desc: "Consistent. Disciplined. The market respects your calls.",
  },
  {
    tier: "Legend",
    icon: "👑",
    threshold: "≥ 70% win rate",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/30",
    glow: "shadow-yellow-400/20",
    desc: "Top 5% of all predictors. People follow your bets.",
  },
];

const leaderboard = [
  { rank: 1, name: "0xb3f...4a1", badge: "👑", wr: "76%", bets: 241, pnl: "+$4,820" },
  { rank: 2, name: "0x77e...c29", badge: "👑", wr: "72%", bets: 189, pnl: "+$3,104" },
  { rank: 3, name: "0xaa1...d3f", badge: "⚡", wr: "67%", bets: 312, pnl: "+$2,890" },
  { rank: 4, name: "0x12f...8b7", badge: "⚡", wr: "61%", bets: 97, pnl: "+$1,240" },
  { rank: 5, name: "0x5c9...2e4", badge: "⚡", wr: "54%", bets: 163, pnl: "+$780" },
];

export default function Reputation() {
  return (
    <section id="reputation" className="py-32 px-6 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sol/5 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-sol/10 border border-sol/20 rounded-full px-3 py-1 mb-6">
              <span className="text-xs font-semibold text-sol tracking-wide uppercase">
                On-chain Reputation
              </span>
            </div>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight leading-tight mb-6">
              Your record.
              <br />
              <span className="text-sol">Permanent.</span>
              <br />
              Verifiable.
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-8">
              Every bet, every win, every parlay — written to a Reputation PDA
              on Solana. Your badge tier isn&rsquo;t given. It&rsquo;s earned.
              And everyone can see it.
            </p>

            {/* Badge cards */}
            <div className="flex flex-col gap-3">
              {badges.map((badge) => (
                <div
                  key={badge.tier}
                  className={`flex items-center gap-4 rounded-xl px-4 py-3 border ${badge.bg} ${badge.border} transition-all hover:scale-[1.01]`}
                >
                  <span className="text-2xl">{badge.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${badge.color}`}>
                        {badge.tier}
                      </span>
                      <span className="text-xs text-text-muted">
                        {badge.threshold}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {badge.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Streak indicators */}
            <div className="flex gap-4 mt-6">
              <div className="glass rounded-lg px-4 py-3 flex items-center gap-2">
                <span className="text-fire text-lg">🔥</span>
                <div>
                  <div className="text-white font-bold text-sm">+8W Streak</div>
                  <div className="text-text-muted text-xs">Hot run</div>
                </div>
              </div>
              <div className="glass rounded-lg px-4 py-3 flex items-center gap-2">
                <span className="text-blue-400 text-lg">❄️</span>
                <div>
                  <div className="text-blue-400 font-bold text-sm">
                    −3L Streak
                  </div>
                  <div className="text-text-muted text-xs">Cold spell</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Leaderboard */}
          <div className="glass-strong rounded-2xl overflow-hidden border border-white/5">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pitch animate-pulse" />
                <span className="text-sm font-semibold">Top Predictors</span>
              </div>
              <div className="flex gap-2">
                <button className="text-xs bg-pitch/10 text-pitch px-3 py-1 rounded-full font-medium">
                  Terrace
                </button>
                <button className="text-xs text-text-muted px-3 py-1 rounded-full">
                  Polymarket
                </button>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {leaderboard.map((p) => (
                <div
                  key={p.rank}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-white/2 transition-colors"
                >
                  <span
                    className={`w-6 text-center text-sm font-mono ${
                      p.rank <= 3 ? "text-pitch font-bold" : "text-text-muted"
                    }`}
                  >
                    {p.rank}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sol/40 to-pitch/40 flex items-center justify-center text-sm font-bold">
                    {p.badge}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {p.bets} calls
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-pitch">{p.wr}</div>
                    <div className="text-xs text-pitch/70">{p.pnl}</div>
                  </div>
                  <button className="text-xs border border-white/10 text-white/60 px-3 py-1 rounded-full hover:border-pitch/40 hover:text-pitch transition-all ml-2">
                    Follow
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-white/5 text-center">
              <span className="text-xs text-text-muted">
                Updated live from on-chain PDAs ·{" "}
                <span className="text-pitch">Solana devnet</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

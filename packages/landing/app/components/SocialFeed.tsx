"use client";

const feedItems = [
  {
    type: "parlay_win",
    user: "0xf3a...2b1",
    badge: "👑",
    badgeColor: "text-yellow-400",
    time: "2m ago",
    content: {
      title: "Won 4-leg parlay",
      detail: "Man City win · Haaland scores · Over 2.5 · Bellingham POTM",
      profit: "+$340",
    },
  },
  {
    type: "bet",
    user: "0xa9c...7f4",
    badge: "⚡",
    badgeColor: "text-sol",
    time: "5m ago",
    content: {
      title: 'Backed YES on "Saka POTM vs Real Madrid?"',
      detail: "Champions League · $50 · 44¢",
      profit: null,
    },
  },
  {
    type: "market_created",
    user: "0x77e...c29",
    badge: "👑",
    badgeColor: "text-yellow-400",
    time: "8m ago",
    content: {
      title: 'Created "Penalty awarded in El Clásico first half?"',
      detail: "Flash market · Expires in 34 min · Creator fee 2%",
      profit: null,
    },
  },
  {
    type: "bet",
    user: "0xd1e...4c9",
    badge: "🎯",
    badgeColor: "text-white/60",
    time: "11m ago",
    content: {
      title: 'Backed NO on "Man United top 4 this season"',
      detail: "Premier League · $25 · 71¢",
      profit: null,
    },
  },
  {
    type: "settled",
    user: "system",
    badge: "⚖️",
    badgeColor: "text-pitch",
    time: "15m ago",
    content: {
      title: '"Liverpool to win the PL title?" settled YES',
      detail: "74 bettors · $12.4k total volume",
      profit: null,
    },
  },
];

const typeConfig: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  parlay_win: { label: "PARLAY WIN", color: "text-pitch", icon: "🔥" },
  bet: { label: "BET PLACED", color: "text-sol", icon: "📊" },
  market_created: { label: "NEW MARKET", color: "text-fire", icon: "🏗️" },
  settled: { label: "SETTLED", color: "text-pitch", icon: "⚖️" },
};

function FeedCard({ item }: { item: (typeof feedItems)[0] }) {
  const config = typeConfig[item.type] || typeConfig.bet;
  return (
    <div className="glass rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sol/40 to-pitch/30 flex items-center justify-center text-sm flex-shrink-0">
          {item.user === "system" ? "⚖️" : item.badge}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {item.user !== "system" && (
              <span className="text-sm font-semibold text-white">
                {item.user}
              </span>
            )}
            <span
              className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/5 ${config.color}`}
            >
              {config.icon} {config.label}
            </span>
            <span className="text-xs text-text-muted ml-auto">{item.time}</span>
          </div>

          {/* Content */}
          <p className="text-sm text-white/80 leading-snug">
            {item.content.title}
          </p>
          <p className="text-xs text-text-muted mt-1">{item.content.detail}</p>

          {/* Profit badge */}
          {item.content.profit && (
            <div className="mt-2 inline-flex items-center gap-1 bg-pitch/10 border border-pitch/20 rounded-full px-3 py-1">
              <span className="text-pitch font-black text-sm">
                {item.content.profit}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SocialFeed() {
  return (
    <section id="social" className="py-32 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Feed mockup */}
          <div className="glass-strong rounded-2xl overflow-hidden border border-white/5">
            {/* Feed header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex gap-4">
                <button className="text-sm font-semibold text-white border-b-2 border-pitch pb-1">
                  Following
                </button>
                <button className="text-sm text-text-muted pb-1">
                  Discover
                </button>
                <button className="text-sm text-text-muted pb-1">Fans</button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
                <span className="text-xs text-pitch font-medium">Live</span>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-3 max-h-[480px] overflow-hidden relative">
              {feedItems.map((item, i) => (
                <FeedCard key={i} item={item} />
              ))}
              {/* Fade out bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-surface-2 to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Right: Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-pitch/10 border border-pitch/20 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
              <span className="text-xs font-semibold text-pitch tracking-wide uppercase">
                Social Layer
              </span>
            </div>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight leading-tight mb-6">
              Follow the
              <br />
              <span className="text-pitch">sharpest</span>
              <br />
              predictors.
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-8">
              Every bet, win, and market creation streams live. Follow
              top predictors and get notified the second they back a take. The
              crowd&rsquo;s wisdom, real-time.
            </p>

            <div className="flex flex-col gap-4">
              {[
                {
                  icon: "📡",
                  title: "Real-time Helius WebSocket feed",
                  desc: "Live events stream to your feed instantly. No delays, no polling.",
                },
                {
                  icon: "👥",
                  title: "Following feed",
                  desc: "Your personal feed shows only people you follow: their bets, wins, markets.",
                },
                {
                  icon: "🔔",
                  title: "Push notifications",
                  desc: "Get notified when a Sharp or Legend you follow places a bet.",
                },
                {
                  icon: "🏆",
                  title: "Merged leaderboard",
                  desc: "Terrace natives and Polymarket players ranked by real P&L and win rate.",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">
                    {item.icon}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white text-sm">
                      {item.title}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

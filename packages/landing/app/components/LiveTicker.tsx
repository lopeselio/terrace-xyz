"use client";

const events = [
  { type: "bet", user: "0xf3a...2b1", action: "backed YES", market: "Haaland scores vs Arsenal", amount: "$42" },
  { type: "win", user: "0xa9c...7f4", action: "won parlay 3.2×", market: "PL Weekend Bundle", amount: "+$186" },
  { type: "market", user: "0xd1e...4c9", action: "created market", market: "Saka POTM vs Real Madrid?", amount: null },
  { type: "bet", user: "0x88b...1e3", action: "backed NO", market: "Man City clean sheet tonight", amount: "$15" },
  { type: "rep", user: "0x55c...8a2", action: "earned", market: "Legend badge", amount: "70%+ WR" },
  { type: "win", user: "0x3f7...9d1", action: "claimed winnings", market: "Champions League Final market", amount: "+$230" },
  { type: "bet", user: "0xb2a...6e5", action: "backed YES", market: "Bellingham scores first half", amount: "$25" },
  { type: "market", user: "0x71d...3b8", action: "created flash market", market: "Next goal in 45 mins?", amount: null },
  { type: "win", user: "0xc4f...0a7", action: "won 5-leg parlay", market: "Gameweek 38 mega parlay", amount: "+$720" },
  { type: "bet", user: "0xe6b...5c2", action: "backed YES", market: "Liverpool top 4 this season", amount: "$100" },
];

const typeStyles: Record<string, { dot: string; label: string; text: string }> = {
  bet: { dot: "bg-sol", label: "BET", text: "text-sol" },
  win: { dot: "bg-pitch", label: "WIN", text: "text-pitch" },
  market: { dot: "bg-fire", label: "NEW", text: "text-fire" },
  rep: { dot: "bg-yellow-400", label: "REP", text: "text-yellow-400" },
};

function TickerItem({ event }: { event: (typeof events)[0] }) {
  const style = typeStyles[event.type];
  return (
    <div className="flex items-center gap-3 px-6 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
      <span className={`text-xs font-mono font-bold ${style.text}`}>
        {style.label}
      </span>
      <span className="text-xs text-white font-medium">{event.user}</span>
      <span className="text-xs text-text-muted">{event.action}</span>
      <span className="text-xs text-white/80 font-medium">
        &ldquo;{event.market}&rdquo;
      </span>
      {event.amount && (
        <span
          className={`text-xs font-semibold ${
            event.type === "win" ? "text-pitch" : "text-white/60"
          }`}
        >
          {event.amount}
        </span>
      )}
    </div>
  );
}

export default function LiveTicker() {
  const doubled = [...events, ...events];

  return (
    <div className="relative border-y border-white/5 bg-surface overflow-hidden py-3">
      {/* Live badge */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 bg-black/80 pr-4 pl-2 py-1 rounded-r-full border-r border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
        <span className="text-[10px] font-bold text-pitch tracking-widest uppercase">
          Live
        </span>
      </div>

      {/* Gradient fades */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-surface to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-surface to-transparent z-10" />

      {/* Scrolling content */}
      <div className="flex animate-ticker pl-24">
        {doubled.map((event, i) => (
          <TickerItem key={i} event={event} />
        ))}
      </div>
    </div>
  );
}

import { TerraceMark, PolymarketLogo } from "./BrandIcons";

const leagues = [
  { name: "Premier League", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", markets: 48 },
  { name: "Champions League", flag: "🇪🇺", markets: 36 },
  { name: "La Liga", flag: "🇪🇸", markets: 29 },
  { name: "Bundesliga", flag: "🇩🇪", markets: 22 },
  { name: "Serie A", flag: "🇮🇹", markets: 18 },
  { name: "Ligue 1", flag: "🇫🇷", markets: 14 },
  { name: "Europa League", flag: "🌍", markets: 11 },
];

const compareItems = [
  { feature: "Instant settlement", terrace: true, betfair: false, polymarket: true, sportradar: false },
  { feature: "Open market creation", terrace: true, betfair: false, polymarket: false, sportradar: false },
  { feature: "Flash / in-match markets", terrace: true, betfair: true, polymarket: false, sportradar: false },
  { feature: "Social feed + follow", terrace: true, betfair: false, polymarket: false, sportradar: false },
  { feature: "Verified reputation badges", terrace: true, betfair: false, polymarket: false, sportradar: false },
  { feature: "Multi-leg parlay builder", terrace: true, betfair: true, polymarket: false, sportradar: false },
  { feature: "USDC settlement (no fiat)", terrace: true, betfair: false, polymarket: true, sportradar: false },
  { feature: "Creator fee economy", terrace: true, betfair: false, polymarket: false, sportradar: false },
  { feature: "No KYC for base access", terrace: true, betfair: false, polymarket: false, sportradar: false },
];

export default function Leagues() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Leagues strip */}
        <div className="mb-24">
          <p className="text-center text-xs text-text-muted font-semibold tracking-widest uppercase mb-8">
            Prediction markets across all major competitions
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {leagues.map((l) => (
              <div
                key={l.name}
                className="glass rounded-full px-4 py-2 flex items-center gap-2 border border-white/5 hover:border-white/10 transition-all"
              >
                <span>{l.flag}</span>
                <span className="text-sm text-white/80">{l.name}</span>
                <span className="text-xs text-pitch font-semibold">
                  {l.markets}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison table */}
        <div>
          <div className="text-center mb-12">
            <h2 className="text-[clamp(2rem,5vw,3rem)] font-black tracking-tight mb-4">
              Why Terrace is{" "}
              <span className="text-pitch">different</span>
            </h2>
            <p className="text-white/50">
              Not a sportsbook. Not a prediction market aggregator. A social
              prediction layer — owned by the crowd.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-text-muted py-3 pr-6 font-medium">
                    Feature
                  </th>
                  <th className="text-center py-3 px-4">
                    <div className="flex flex-col items-center gap-1">
                      <TerraceMark size={28} />
                      <span className="text-xs font-bold text-pitch">
                        Terrace
                      </span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4">
                    <span className="text-xs font-medium text-text-muted">
                      Betfair
                    </span>
                  </th>
                  <th className="text-center py-3 px-4">
                    <div className="flex flex-col items-center gap-1">
                      <PolymarketLogo size={28} />
                      <span className="text-xs font-medium text-text-muted">
                        Polymarket
                      </span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4">
                    <span className="text-xs font-medium text-text-muted">
                      Sportradar
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {compareItems.map((row) => (
                  <tr
                    key={row.feature}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 pr-6 text-sm text-white/70">
                      {row.feature}
                    </td>
                    {[row.terrace, row.betfair, row.polymarket, row.sportradar].map(
                      (val, i) => (
                        <td key={i} className="text-center py-3 px-4">
                          {val ? (
                            <span
                              className={`text-base ${
                                i === 0 ? "text-pitch" : "text-white/40"
                              }`}
                            >
                              ✓
                            </span>
                          ) : (
                            <span className="text-text-muted text-base">—</span>
                          )}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

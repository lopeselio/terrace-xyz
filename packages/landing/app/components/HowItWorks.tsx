import { HeliusMark, PolymarketLogo, JupiterLogo, PrivyLogo, SolanaMarkSVG, GeminiLogo } from "./BrandIcons";

const steps = [
  {
    n: "01",
    title: "Connect your wallet",
    desc: "Use Phantom, Solflare, or any Solana wallet via Mobile Wallet Adapter. Or sign in with email. We create an embedded Solana wallet automatically via Privy.",
    icon: "🔑",
    color: "text-sol",
    border: "border-sol/20",
  },
  {
    n: "02",
    title: "Browse or create markets",
    desc: "Explore pre-match markets, flash in-play windows, and Polymarket sports feeds, or deploy your own question with a custom creator fee in under 30 seconds.",
    icon: "🎯",
    color: "text-pitch",
    border: "border-pitch/20",
  },
  {
    n: "03",
    title: "Back your take",
    desc: "Back your pick on any market. Chain multiple legs into a parlay for multiplied payouts. Your positions are yours. Always.",
    icon: "⚡",
    color: "text-fire",
    border: "border-fire/20",
  },
  {
    n: "04",
    title: "Win. Build rep. Repeat.",
    desc: "Correct calls build your permanent reputation. Win rate, streak, badge tier: all verifiable. Earn the Legend crown. People will follow your bets.",
    icon: "👑",
    color: "text-yellow-400",
    border: "border-yellow-400/20",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-20 pointer-events-none" />
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-16">
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-tight mb-4">
            How Terrace works
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            From sign-up to a permanent reputation. The full loop,
            on Solana.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <div
              key={step.n}
              className={`glass rounded-2xl p-6 border ${step.border} relative overflow-hidden group hover:scale-[1.02] transition-all`}
            >
              {/* Step number background */}
              <div
                className={`absolute -top-4 -right-2 text-[80px] font-black opacity-5 ${step.color} pointer-events-none select-none`}
              >
                {step.n}
              </div>

              <span className="text-3xl mb-4 block">{step.icon}</span>
              <div className={`text-xs font-bold tracking-widest ${step.color} mb-2`}>
                STEP {step.n}
              </div>
              <h3 className="text-white font-bold text-base mb-3 leading-tight">
                {step.title}
              </h3>
              <p className="text-text-muted text-sm leading-relaxed">
                {step.desc}
              </p>

              {/* Connector arrow */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 z-10 text-white/20 text-xl">
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tech stack strip */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-5 text-sm text-text-muted">
          <span className="flex items-center gap-2">
            <SolanaMarkSVG size={16} />
            Solana · 400ms finality
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-2">
            <HeliusMark size={16} />
            Helius RPC + WebSockets
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-2">
            <JupiterLogo size={16} />
            Jupiter swaps
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-2">
            <PolymarketLogo size={16} />
            Polymarket feed
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-2">
            <PrivyLogo size={16} />
            Privy embedded wallets
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-2">
            <GeminiLogo size={16} />
            Gemini AI intelligence
          </span>
        </div>
      </div>
    </section>
  );
}

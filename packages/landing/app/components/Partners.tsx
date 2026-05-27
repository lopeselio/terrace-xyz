import {
  HeliusMark,
  PolymarketLogo,
  JupiterLogo,
  PrivyLogo,
  ArciumLogo,
  GeminiLogo,
  SolanaMarkSVG,
  SolanaMobileLogo,
} from "./BrandIcons";

type Partner = {
  name: string;
  blurb: string;
  Icon: (props: { size?: number }) => JSX.Element;
};

const partners: Partner[] = [
  {
    name: "Arcium",
    blurb: "Encrypted MPC for private fan leagues. Scores stay sealed until reveal.",
    Icon: ArciumLogo,
  },
  {
    name: "Helius",
    blurb: "Solana RPC + websockets powering real-time markets and matchups.",
    Icon: HeliusMark,
  },
  {
    name: "Privy",
    blurb: "Embedded wallets and email/social login for non-crypto-native fans.",
    Icon: PrivyLogo,
  },
  {
    name: "Polymarket",
    blurb: "Pre-match sports markets piped into the Terrace feed.",
    Icon: PolymarketLogo,
  },
  {
    name: "Jupiter Predict",
    blurb: "Aggregated prediction-market liquidity across Solana.",
    Icon: JupiterLogo,
  },
  {
    name: "Google Gemini",
    blurb: "AI surfaces flash markets and writes match recaps in seconds.",
    Icon: GeminiLogo,
  },
  {
    name: "Solana",
    blurb: "Sub-second settlement on the fastest chain for sports money.",
    Icon: SolanaMarkSVG,
  },
  {
    name: "Solana Mobile",
    blurb: "First-class Seeker support. Mobile Wallet Adapter, dApp store ready.",
    Icon: SolanaMobileLogo,
  },
];

export default function Partners() {
  return (
    <section id="partners" className="py-24 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs tracking-[0.3em] uppercase text-white/50">
            We work with
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <h2 className="text-3xl md:text-4xl font-extrabold text-center tracking-tight">
          Built on the best in Solana.
        </h2>
        <p className="text-center text-white/55 mt-3 max-w-xl mx-auto">
          Terrace plugs into the infra and liquidity protocols that actually move
          on-chain sports forward.
        </p>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {partners.map(({ name, blurb, Icon }) => (
            <div
              key={name}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition px-5 py-5 flex items-start gap-4"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-white">{name}</div>
                <div className="text-sm text-white/55 mt-1 leading-snug">{blurb}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

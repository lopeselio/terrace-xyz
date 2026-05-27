"use client";

import { useEffect, useRef } from "react";
import { SolanaMarkSVG } from "./BrandIcons";

const stats = [
  { value: "100%", label: "Onchain settlement" },
  { value: "<1s", label: "Solana finality" },
  { value: "0%", label: "House edge on Terrace" },
  { value: "8-leg", label: "Max parlay multiplier" },
];

function FloatingCard({
  className,
  style,
  children,
}: {
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute glass-strong rounded-2xl p-4 shadow-2xl ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export default function Hero() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!glowRef.current) return;
      const rect = glowRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      glowRef.current.style.setProperty("--mx", `${x}%`);
      glowRef.current.style.setProperty("--my", `${y}%`);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-16 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 bg-grid-pattern bg-grid opacity-40"
        style={{ maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)" }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-hero-radial pointer-events-none" />

      {/* Mouse-following glow */}
      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(600px circle at var(--mx, 50%) var(--my, 50%), rgba(0,255,135,0.06), transparent 70%)",
        }}
      />

      {/* Floating decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-pitch/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-sol/5 blur-3xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-pitch/10 border border-pitch/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
          <span className="text-xs font-semibold text-pitch tracking-wide uppercase flex items-center gap-1.5">
            Built on <SolanaMarkSVG size={14} /> Solana · Powered by the Fans from the Terrace
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[clamp(2.8rem,8vw,6rem)] font-black leading-[0.95] tracking-tighter mb-6 text-balance">
          Your reputation.
          <br />
          <span className="text-pitch glow-green">Your market.</span>
          <br />
          Onchain.
        </h1>

        {/* Sub-headline */}
        <p className="text-[clamp(1rem,2.5vw,1.4rem)] text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Terrace is the social sports prediction layer football deserves.
          open markets, live flash bets, parlay chains, and a
          reputation that follows you everywhere.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-4 flex-wrap mb-20">
          <a
            href="#waitlist"
            className="bg-pitch text-black font-bold px-8 py-3.5 rounded-xl hover:bg-pitch-dim transition-all hover:scale-105 text-base shadow-lg shadow-pitch/20"
          >
            Join the Terrace
          </a>
          <a
            href="#markets"
            className="glass border border-white/10 text-white font-medium px-8 py-3.5 rounded-xl hover:border-white/20 transition-all text-base"
          >
            Explore Markets
          </a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-xl px-4 py-4">
              <div className="text-2xl font-black text-white mb-1">
                {s.value}
              </div>
              <div className="text-xs text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating UI cards */}
      <div className="relative w-full max-w-5xl mx-auto mt-20 h-32 hidden lg:block">
        <FloatingCard className="left-0 top-0 w-64 animate-float">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-black flex-shrink-0">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 leading-snug">
                &ldquo;Haaland to score 2+ goals tonight?&rdquo;
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] bg-pitch/20 text-pitch px-2 py-0.5 rounded-full font-semibold">
                  YES 62¢
                </span>
                <span className="text-[10px] text-text-muted">$2.4k vol</span>
              </div>
            </div>
          </div>
        </FloatingCard>

        <FloatingCard className="right-0 top-0 w-56 animate-float" style={{ animationDelay: "2s" }}>
          <div className="text-center">
            <div className="text-2xl mb-1">👑</div>
            <div className="text-white font-bold text-sm">Legend</div>
            <div className="text-pitch text-xs mt-1">74% win rate</div>
            <div className="text-text-muted text-[10px] mt-0.5">182 calls</div>
          </div>
        </FloatingCard>
      </div>
    </section>
  );
}

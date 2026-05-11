"use client";

import { useState } from "react";
import { TelegramLogo, DiscordLogo } from "./BrandIcons";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("failed");
      setSubmitted(true);
    } catch {
      alert("Something went wrong. Try again or DM us on Telegram.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="waitlist"
      className="py-32 px-6 relative overflow-hidden"
    >
      {/* Glow background */}
      <div className="absolute inset-0 bg-hero-radial pointer-events-none opacity-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-pitch/8 blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto relative text-center">
        <div className="inline-flex items-center gap-2 bg-pitch/10 border border-pitch/20 rounded-full px-3 py-1 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse" />
          <span className="text-xs font-semibold text-pitch tracking-wide uppercase">
            Early Access
          </span>
        </div>

        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-tighter leading-[0.95] mb-6">
          Your rep starts
          <br />
          <span className="text-pitch glow-green">today.</span>
        </h2>

        <p className="text-white/50 text-xl leading-relaxed mb-12 max-w-xl mx-auto">
          Join the waitlist for early access. First 1,000 users get a
          Founding Fan badge when we launch.
        </p>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-text-muted focus:outline-none focus:border-pitch/50 transition-colors text-base"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-pitch text-black font-bold px-7 py-3.5 rounded-xl hover:bg-pitch-dim transition-all hover:scale-105 text-base disabled:opacity-50 disabled:scale-100 whitespace-nowrap shadow-lg shadow-pitch/20"
            >
              {loading ? "Joining..." : "Join Terrace"}
            </button>
          </form>
        ) : (
          <div className="glass-strong rounded-2xl px-8 py-6 border border-pitch/30 max-w-md mx-auto">
            <div className="text-3xl mb-3">✅</div>
            <h3 className="text-white font-bold text-lg mb-1">
              You&rsquo;re on the list!
            </h3>
            <p className="text-text-muted text-sm">
              We&rsquo;ll reach out when Terrace opens. Follow us on Telegram
              or Discord for updates.
            </p>
          </div>
        )}

        <p className="text-text-muted text-xs mt-4">
          No spam. Just a ping when the Terrace opens.
        </p>

        {/* Social links */}
        <div className="flex items-center justify-center gap-6 mt-12">
          <a
            href="#"
            className="text-text-muted hover:text-white transition-colors text-sm flex items-center gap-2"
          >
            <span>𝕏</span> Twitter
          </a>
          <a
            href="https://discord.com/users/lopeselio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-white transition-colors text-sm flex items-center gap-2"
          >
            <DiscordLogo size={16} /> Discord
          </a>
          <a
            href="https://t.me/ElioCodes"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-white transition-colors text-sm flex items-center gap-2"
          >
            <TelegramLogo size={16} /> Telegram
          </a>
        </div>
      </div>
    </section>
  );
}

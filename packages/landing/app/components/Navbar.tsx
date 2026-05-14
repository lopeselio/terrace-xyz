"use client";

import { useState, useEffect } from "react";
import { TerraceMark } from "./BrandIcons";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-black/80 backdrop-blur-xl border-b border-white/5"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <TerraceMark size={28} />
          <span className="font-bold text-white text-lg tracking-tight">
            terrace
          </span>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8">
          {["Markets", "Reputation", "Parlays", "Matchups", "Social", "Creators"].map(
            (item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm text-text-muted hover:text-white transition-colors"
              >
                {item}
              </a>
            )
          )}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a
            href="/architecture.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400/50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Frontier Demo
          </a>
          <a
            href="/pitch-deck.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Pitch Deck
          </a>
          <a
            href="#waitlist"
            className="bg-pitch text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-pitch-dim transition-colors"
          >
            Join Waitlist
          </a>
        </div>
      </div>
    </nav>
  );
}

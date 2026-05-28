"use client";

import { useState, useEffect } from "react";
import { TerraceMark } from "./BrandIcons";

const SECTION_LINKS = [
  "Markets",
  "Reputation",
  "Parlays",
  "Matchups",
  "Social",
  "Creators",
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
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
          {SECTION_LINKS.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm text-text-muted hover:text-white transition-colors"
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="/architecture.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Frontier Demo"
            title="Frontier Demo"
            className="inline-flex items-center gap-1.5 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400/50 text-sm font-medium px-2.5 sm:px-4 py-2 rounded-lg transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="hidden sm:inline">Frontier Demo</span>
          </a>
          <a
            href="/pitch-deck.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Pitch Deck"
            title="Pitch Deck"
            className="inline-flex items-center gap-1.5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 text-sm font-medium px-2.5 sm:px-4 py-2 rounded-lg transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="hidden sm:inline">Pitch Deck</span>
          </a>
          <a
            href="#waitlist"
            className="bg-pitch text-black text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg hover:bg-pitch-dim transition-colors whitespace-nowrap"
          >
            Join Waitlist
          </a>

          {/* Mobile burger */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMenuOpen((v) => !v)}
            className="sm:hidden relative w-10 h-10 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/80 hover:text-white hover:border-white/20 transition-colors"
          >
            <span className="sr-only">Menu</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <div
        id="mobile-nav-panel"
        className={`sm:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          menuOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-6 pt-2 flex flex-col gap-3 bg-black/80 backdrop-blur-xl border-b border-white/5">
          <div className="flex flex-col gap-1 pt-2">
            {SECTION_LINKS.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={closeMenu}
                className="text-base text-white/70 hover:text-white py-2 transition-colors"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="h-px bg-white/5 my-1" />

          <a
            href="/architecture.html"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="inline-flex items-center gap-2 border border-emerald-500/30 text-emerald-400 text-sm font-medium px-4 py-3 rounded-lg"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Frontier Demo
          </a>
          <a
            href="/pitch-deck.html"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="inline-flex items-center gap-2 border border-white/10 text-white/80 text-sm font-medium px-4 py-3 rounded-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Pitch Deck
          </a>
        </div>
      </div>
    </nav>
  );
}

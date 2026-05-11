"use client";
import { TelegramLogo, DiscordLogo } from "./BrandIcons";

export default function Founder() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <p className="text-center text-xs text-text-muted font-semibold tracking-widest uppercase mb-12">
          Meet the builder
        </p>

        <div className="glass rounded-3xl border border-white/8 p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Photo */}
          <div className="flex-shrink-0">
            <img
              src="/founder-elio.jpg"
              alt="Elio Jordan Lopes"
              className="w-28 h-28 md:w-36 md:h-36 rounded-full object-cover border-2 border-pitch/30"
            />
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl font-black text-white tracking-tight mb-1">
              Elio Jordan Lopes
            </h3>
            <p className="text-pitch text-sm font-bold mb-3">
              Full Stack Solana &amp; Games Developer
            </p>
            <p className="text-white/60 text-sm leading-relaxed mb-6 max-w-xl">
              CoFounder of <span className="text-white/80 font-semibold">IntoTheVerse Games</span>,
              building Cryptara Conquest on Solana. The same obsession with
              true digital ownership that drives the games is what's behind Terrace.
            </p>

            {/* Contact handles */}
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <a
                href="https://t.me/ElioCodes"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 glass border border-white/10 hover:border-white/20 rounded-full px-4 py-2 transition-colors"
              >
                <TelegramLogo size={18} />
                <span className="text-sm font-semibold text-white/80">@ElioCodes</span>
                <span className="text-xs text-text-muted">Telegram</span>
              </a>
              <a
                href="https://discord.com/users/lopeselio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 glass border border-white/10 hover:border-white/20 rounded-full px-4 py-2 transition-colors"
              >
                <DiscordLogo size={18} />
                <span className="text-sm font-semibold text-white/80">lopeselio</span>
                <span className="text-xs text-text-muted">Discord</span>
              </a>
              <a
                href="https://x.com/ElioCodes"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 glass border border-white/10 hover:border-white/20 rounded-full px-4 py-2 transition-colors"
              >
                <span className="text-sm font-bold text-white/80">𝕏</span>
                <span className="text-sm font-semibold text-white/80">@ElioCodes</span>
                <span className="text-xs text-text-muted">Twitter / X</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

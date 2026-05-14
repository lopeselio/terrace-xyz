import { TerraceMark, HeliusMark, SolanaMarkSVG } from "./BrandIcons";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <TerraceMark size={28} />
            <span className="font-bold text-white">terrace</span>
            <span className="text-text-muted text-sm ml-2">
              · Social Sports Predictions on Solana
            </span>
          </div>

          {/* Links */}
          <div className="flex gap-6 text-sm text-text-muted">
            {[
              { label: "Terms", href: "#" },
              { label: "Privacy", href: "#" },
              { label: "Docs", href: "#" },
              { label: "GitHub", href: "#" },
              { label: "Twitter", href: "https://x.com/terracedotsol" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="hover:text-white transition-colors"
                {...(href !== "#" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-text-muted">
          <p>
            © 2025 Terrace. All activity is final. Not financial advice.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-pitch animate-pulse flex-shrink-0" />
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              Built on
              <span className="inline-flex items-center gap-1">
                <SolanaMarkSVG size={14} />
                <span className="text-sol font-medium">Solana</span>
              </span>
              ·
              Powered by
              <span className="inline-flex items-center gap-1">
                <HeliusMark size={14} />
                <span className="text-pitch font-medium">Helius</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

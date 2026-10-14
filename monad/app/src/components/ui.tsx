import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChainlinkMark } from "./ChainlinkMark";
import { Icon, type IconName } from "./Icon";
import { fanName, hash } from "@/lib/names";

export { fanName, handle } from "@/lib/names";

/* Terrace Night primitives from the revamp handoff (design-system/handoff/styles.css). */

const AV_COLORS = ["#1d4ed8", "#7c2d12", "#166534", "#4c1d95", "#831843", "#0e7490", "#a16207", "#b91c1c"];

/** Monogram on a per-fan colour (no photos). */
export function Avatar({ seed, name, size = 38 }: { seed: string; name?: string; size?: number }) {
  const label = (name ?? fanName(seed)).replace(/\(AI\)/, "").trim().split(/\s+/);
  const mono = ((label[0]?.[0] ?? "") + (label[1]?.[0] ?? "")).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, background: AV_COLORS[hash(seed.toLowerCase()) % AV_COLORS.length], fontSize: size * 0.42 }}>
      {mono}
    </span>
  );
}

export type BadgeTone = "live" | "min" | "open" | "won" | "lost" | "flash" | "amber" | "sealed" | "private" | "settled" | "chainlink" | "terrace";
const TONE: Record<BadgeTone, string> = {
  live: "b-live", min: "b-min", open: "b-open", won: "b-won", lost: "b-lost", flash: "b-flash", amber: "b-flash",
  sealed: "b-private", private: "b-private", settled: "b-settled", chainlink: "b-chainlink", terrace: "b-terrace",
};
export function Badge({ tone, icon, children }: { tone: BadgeTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`badge ${TONE[tone]}`}>
      {tone === "live" && <i className="livedot" />}
      {tone === "chainlink" || tone === "sealed" ? <ChainlinkMark size={12} /> : icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/* "sealed" and "chainlink" badges carry the Chainlink mark: CRE settles every market and opens sealed picks. */

/** Condensed uppercase section head, with an optional "more ›" link. */
export function SectionHead({ title, more, href, color, children }: { title: string; more?: string; href?: string; color?: string; children?: ReactNode }) {
  return (
    <div className="sec-hd">
      <h3 style={color ? { color } : undefined}>{title}</h3>
      {children}
      {more && href && (
        <Link href={href} className="more">
          {more} <Icon name="chevronRight" size={14} />
        </Link>
      )}
    </div>
  );
}

/** Club crest: the real badge when we have it, else the 3-letter code on a dark tile. */
export function Crest({ logo, name, lg }: { logo?: string; name: string; lg?: boolean }) {
  return <span className={`crest${lg ? " crest-lg" : ""}`}>{logo ? <img src={logo} alt="" /> : name.slice(0, 3).toUpperCase()}</span>;
}

type FixtureFace = { league?: string; leagueLogo?: string; home: { name: string; logo: string }; away: { name: string; logo: string } };

/** Both club crests with the competition's logo tucked in the corner: gives a text card a face. */
export function FixtureArt({ m, size = 34 }: { m?: FixtureFace | null; size?: number }) {
  if (!m) return null;
  return (
    <span className="fx-art" style={{ ["--fx" as string]: `${size}px` }} aria-hidden>
      <span className="crest-pair">
        <Crest logo={m.home.logo} name={m.home.name} />
        <Crest logo={m.away.logo} name={m.away.name} />
      </span>
      {m.leagueLogo && <span className="fx-league"><img src={m.leagueLogo} alt="" /></span>}
    </span>
  );
}

/** "[league] Home v Away" for a card's meta line, optionally with small crests. */
export function FixtureTag({ m, tail, crests }: { m?: FixtureFace | null; tail?: ReactNode; crests?: boolean }) {
  if (!m) return null;
  return (
    <span className="fx-tag">
      {m.leagueLogo && <span className="fx-tag-league"><img src={m.leagueLogo} alt={m.league ?? ""} /></span>}
      {crests && <FixtureArt m={{ ...m, leagueLogo: undefined }} size={18} />}
      <span className="fx-tag-text">{m.home.name} v {m.away.name}{tail}</span>
    </span>
  );
}

/** The core control: a label over a price. */
export function Odd({
  label, value, tone, on, up, small, disabled, onClick,
}: { label?: string; value: ReactNode; tone?: "yes" | "no"; on?: boolean; up?: boolean; small?: boolean; disabled?: boolean; onClick?: () => void }) {
  const cls = ["odd", tone === "yes" && "odd-yes", tone === "no" && "odd-no", tone === "no" && "no", on && "on", up && "up", small && "sm"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {label && <span className="lbl">{label}</span>}
      <span className="val">{value}</span>
    </button>
  );
}

/** Segmented control. `sub` is the quieter grey variant used inside screens. */
export function Seg<T extends string>({
  options, value, onChange, sub,
}: { options: { id: T; label: ReactNode; icon?: IconName }[]; value: T; onChange: (v: T) => void; sub?: boolean }) {
  return (
    <div className={`seg${sub ? " sub" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : undefined} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

/**
 * Bottom sheet: scrim, grabber, springs up from +24px. Escape or a scrim tap closes it.
 * Rendered into <body> so a blurred or transformed parent (like the sticky header) can't trap it.
 */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="sheetwrap" role="dialog" aria-modal>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="grabber" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Sheet title row with a close button. */
export function SheetHead({ eyebrow, title, onClose }: { eyebrow?: ReactNode; title: ReactNode; onClose: () => void }) {
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <div className="sheet-title">{title}</div>
      </div>
      <button className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
    </div>
  );
}

/** Skeletons shaped like the real thing: crest square, title bar, three 52px odds blocks. */
export function SkeletonCards({ n = 3, odds = 3 }: { n?: number; odds?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card" style={{ borderColor: "var(--line-hair)" }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="sk" style={{ width: 34, height: 34, borderRadius: 9 }} />
            <div className="sk" style={{ height: 12, flex: 1 }} />
          </div>
          <div className={`oddsrow${odds === 2 ? " two" : ""}`}>
            {Array.from({ length: odds }, (_, j) => <div key={j} className="sk" style={{ height: 52 }} />)}
          </div>
        </div>
      ))}
    </>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h4>{title}</h4>
      {children && <div style={{ fontSize: 12.5, fontWeight: 600 }}>{children}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/** Square quick-action tile (Home and Profile "Play" rows). */
export function Tile({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <Link href={href} className="stat tile card-tap">
      <Icon name={icon} size={22} />
      <div className="k">{children}</div>
    </Link>
  );
}

/** Dollars from 6-decimal units: "$14.22" (two decimals, as the design does money). */
export const money = (raw: string | number | bigint) => `$${(Number(raw) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dollars, short: "$10" or "$2.50". */
export const usd = (raw: string | number | bigint) => {
  const n = Number(raw) / 1e6;
  return `$${n % 1 ? n.toFixed(2) : n.toLocaleString("en-US")}`;
};

export function ago(unix: number | string) {
  const s = Math.max(0, Date.now() / 1000 - Number(unix));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "2h 14m", "6m 40s", "1d 3h" until a unix time. */
export function countdown(unix: number, now = Date.now() / 1000) {
  const s = Math.max(0, Math.floor(unix - now));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/** A league's logo on a small light tile (league marks are drawn for light backgrounds). */
export function LeagueLogo({ m, size = 18, withName }: { m?: { league?: string; leagueLogo?: string } | null; size?: number; withName?: boolean }) {
  if (!m?.leagueLogo) return <span className="match-lg">{m?.league ?? "Football"}</span>;
  return (
    <span className="league-logo" title={m.league}>
      <span className="league-tile" style={{ width: size + 4, height: size + 4 }}>
        <img src={m.leagueLogo} alt={m.league ?? "League"} width={size} height={size} />
      </span>
      {withName && <span className="match-lg">{m.league}</span>}
    </span>
  );
}

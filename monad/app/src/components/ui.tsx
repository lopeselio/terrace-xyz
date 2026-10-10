import type { ReactNode } from "react";

/* Terrace Night primitives, matching the Solana app's components/ui.tsx. */

const AV_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#ca8a04", "#dc2626"];
const ADJ = ["Loud", "Calm", "Golden", "Late", "Wild", "Cool", "Sharp", "Bold", "Lucky", "Steady", "Fierce", "Quiet", "Clinical", "Brave", "Cheeky", "Cold"];
const NOUN = ["Ultra", "Keeper", "Striker", "Winger", "Gaffer", "Pundit", "Skipper", "Sweeper", "Number 9", "Terrace", "Volley", "Nutmeg", "Rabona", "Chip", "Header", "Libero"];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** A friendly, stable name for an account: fans never see a hex address. */
export function fanName(address: string, isAgent = false) {
  const h = hash(address.toLowerCase());
  const name = `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
  return isAgent ? `${name} (AI)` : name;
}

export function Avatar({ seed, name, size = 34 }: { seed: string; name?: string; size?: number }) {
  const label = (name ?? fanName(seed)).replace(/\(AI\)/, "").trim().split(/\s+/);
  const mono = ((label[0]?.[0] ?? "") + (label[1]?.[0] ?? "")).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, background: AV_COLORS[hash(seed.toLowerCase()) % AV_COLORS.length], fontSize: size * 0.42 }}>
      {mono}
    </span>
  );
}

export type BadgeTone = "live" | "open" | "won" | "lost" | "flash" | "amber" | "sealed" | "settled" | "chainlink";
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function SectionHead({ title, more, href }: { title: string; more?: string; href?: string }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {more && href && <a href={href}>{more} ›</a>}
    </div>
  );
}

export const usd = (raw: string | number | bigint) => {
  const n = Number(raw) / 1e6;
  return `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;
};

export function ago(unix: number | string) {
  const s = Math.max(0, Date.now() / 1000 - Number(unix));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

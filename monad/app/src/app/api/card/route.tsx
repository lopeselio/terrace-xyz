import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { matchday, type Matchday } from "@/lib/server/matchday";
import { font } from "@/lib/server/og";

/*
 * A fan's matchday card, the link preview for /live?fan=…: their record today in big type, then the
 * games with how each one went (or stands). Built from the same position logic as the Game day screen.
 */
const money = (raw: number) => {
  const n = Math.abs(raw) / 1e6;
  return `$${n % 1 ? n.toFixed(2) : n.toLocaleString("en-US")}`;
};
const signed = (raw: number) => `${raw >= 0 ? "+" : "−"}${money(raw)}`;
const TONE: Record<string, { label: string; fg: string; bg: string }> = {
  won: { label: "WON", fg: "#4ade80", bg: "#052e16" },
  winning: { label: "WINNING", fg: "#4ade80", bg: "#052e16" },
  lost: { label: "LOST", fg: "#f87171", bg: "#3b0a0a" },
  losing: { label: "LOSING", fg: "#f87171", bg: "#3b0a0a" },
  refund: { label: "STAKE BACK", fg: "#9ca3af", bg: "#1a1a1a" },
  due: { label: "AWAITING", fg: "#fbbf24", bg: "#2a1605" },
  live: { label: "IN PLAY", fg: "#f87171", bg: "#3b0a0a" },
};

function headline(d: Matchday): { big: string; small: string } {
  if (d.won + d.lost > 0) return { big: `${d.won} FROM ${d.won + d.lost}`, small: `${signed(d.net)} on the day` };
  if (d.winning + d.losing > 0) return { big: `${d.winning} WINNING`, small: `${signed(d.net)} if it ends now` };
  if (d.games.some((g) => g.clock && !g.clock.endsWith("'"))) return { big: "FULL TIME", small: "Results on the way" };
  return { big: "MATCHDAY", small: "Bets on, kick-off soon" };
}

export async function GET(req: Request) {
  const fan = new URL(req.url).searchParams.get("fan") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(fan)) return new Response("fan required", { status: 400 });
  const [d, cond, body] = await Promise.all([matchday(fan), font("Barlow Condensed", 800), font("Barlow", 600)]);
  const fonts = [
    ...(cond ? [{ name: "Cond", data: cond, weight: 800 as const }] : []),
    ...(body ? [{ name: "Barlow", data: body, weight: 600 as const }] : []),
  ];
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/icons/icon-512.png"))).toString("base64")}`;
  const h = headline(d);
  const up = d.net >= 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#f9fafb", padding: "56px 64px", fontFamily: "Barlow", position: "relative", gap: 48 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: `radial-gradient(ellipse 55% 75% at 20% 60%, ${up ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.2)"}, transparent 70%)` }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={64} height={64} alt="" />
            <div style={{ fontFamily: "Cond", fontSize: 40, fontWeight: 800, letterSpacing: 1, display: "flex" }}>TERRACE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, color: "#9ca3af" }}>{d.name}&apos;s matchday</span>
            <span style={{ fontFamily: "Cond", fontSize: 112, fontWeight: 800, lineHeight: 0.95, letterSpacing: -1, marginTop: 8 }}>{h.big}</span>
            <span style={{ fontFamily: "Cond", fontSize: 54, fontWeight: 800, color: up ? "#22c55e" : "#f87171", marginTop: 6 }}>{h.small}</span>
          </div>
          <span style={{ fontSize: 22, color: "#6b7280" }}>play.terrace.social · test money</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, flex: 1 }}>
          {d.games.map((g, i) => {
            const t = TONE[g.standing];
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", background: "#111", border: "1.5px solid #262626", borderRadius: 20, padding: "16px 20px", boxShadow: t ? `inset 5px 0 0 ${t.fg}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#9ca3af", background: "#1a1a1a", borderRadius: 8, padding: "3px 8px" }}>{g.clock || "—"}</span>
                  <span style={{ fontSize: 24, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{g.home} {g.score} {g.away}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <span style={{ fontSize: 19, color: "#9ca3af", flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{g.pick.length > 46 ? `${g.pick.slice(0, 45)}…` : g.pick}</span>
                  {t && <span style={{ fontSize: 15, fontWeight: 800, color: t.fg, background: t.bg, borderRadius: 8, padding: "3px 9px" }}>{t.label}</span>}
                  {g.amount !== 0 && <span style={{ fontFamily: "Cond", fontSize: 30, fontWeight: 800, color: g.amount > 0 ? "#22c55e" : "#f87171" }}>{signed(g.amount)}</span>}
                </div>
              </div>
            );
          })}
          {d.games.length === 0 && <span style={{ fontSize: 28, color: "#9ca3af" }}>Every bet beside the live score.</span>}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

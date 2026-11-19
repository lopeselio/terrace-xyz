import { ImageResponse } from "next/og";
import { font } from "@/lib/server/og";
import { sharedTake } from "@/lib/server/share";

/* Link preview for /b/<market>: the take in big type, the match, and Back / Fade with their odds. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("market") ?? "";
  const [t, cond, body] = await Promise.all([sharedTake(id), font("Barlow Condensed", 800), font("Barlow", 600)]);
  if (!t) return new Response("not found", { status: 404 });
  const fonts = [...(cond ? [{ name: "Cond", data: cond, weight: 800 as const }] : []), ...(body ? [{ name: "Barlow", data: body, weight: 600 as const }] : [])];
  const pill = (label: string, odds: string, bg: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 18, background: bg, borderRadius: 24, padding: "18px 34px" }}>
      <span style={{ fontFamily: "Cond", fontSize: 54, fontWeight: 800 }}>{label}</span>
      <span style={{ fontFamily: "Cond", fontSize: 54, fontWeight: 800, opacity: 0.85 }}>{odds}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1C2433", color: "#F7F8F5", padding: "56px 64px", fontFamily: "Barlow" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#8EC5EA" }}>
          <span style={{ fontFamily: "Cond", fontWeight: 800, letterSpacing: 1 }}>TERRACE</span>
          <span>{t.match}</span>
        </div>
        <div style={{ display: "flex", fontFamily: "Cond", fontSize: t.text.length > 60 ? 70 : 92, fontWeight: 800, lineHeight: 1, color: "#F4C542" }}>“{t.text}”</div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {pill("BACK", t.back, "#7A1F3D")}
          {pill("FADE", t.fade, "#2c3a52")}
          <span style={{ fontSize: 26, color: "#9ca3af", marginLeft: 12 }}>{t.bettors ? `${t.bettors} in · $${t.pot.toFixed(0)} pot` : "Be first in"}</span>
        </div>
        <span style={{ fontSize: 22, color: "#9ca3af" }}>{t.ruled ? "Settled from the match data by Chainlink" : "Settled by Chainlink's AI judge"} · test money</span>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}

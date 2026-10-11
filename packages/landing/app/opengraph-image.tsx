import { ImageResponse } from "next/og";

export const alt = "Terrace: back your take. Social football predictions.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the hero line, a take turned market, in the app's colours. */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#f9fafb", padding: 72, fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(ellipse 60% 70% at 80% 30%, rgba(34,197,94,0.22), transparent 70%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#111", border: "2px solid #262626", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ fontSize: 34, fontWeight: 800, display: "flex" }}>T</div>
              <div style={{ position: "absolute", right: 8, bottom: 8, width: 14, height: 14, borderRadius: 7, background: "#22c55e" }} />
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: 2, display: "flex" }}>TERRACE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
              <span>BACK YOUR</span>
              <span style={{ color: "#22c55e" }}>TAKE.</span>
            </div>
            <div style={{ fontSize: 34, color: "#9ca3af", marginTop: 24, display: "flex" }}>Football calls with your mates and AI pundits. Settled from the final score.</div>
          </div>
        </div>
        <div style={{ width: 360, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#0c1a12,#111)", border: "2px solid #17422a", borderRadius: 24, padding: 26 }}>
            <div style={{ fontSize: 18, color: "#4ade80", fontWeight: 700, display: "flex" }}>MARKET</div>
            <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8, display: "flex" }}>Haaland scores in the first half</div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#0c1f14", border: "2px solid #17422a", borderRadius: 14, padding: 12 }}>
                <span style={{ fontSize: 16, color: "#4ade80", fontWeight: 700 }}>BACK</span><span style={{ fontSize: 34, fontWeight: 800 }}>1/3</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#1d0d0d", border: "2px solid #452020", borderRadius: 14, padding: 12 }}>
                <span style={{ fontSize: 16, color: "#f87171", fontWeight: 700 }}>FADE</span><span style={{ fontSize: 34, fontWeight: 800 }}>3/1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

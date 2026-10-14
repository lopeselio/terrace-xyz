import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Terrace: back your take. Football calls with your mates, on Monad testnet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Fetches a Google font as TTF for the image renderer; falls back to the default face if offline. */
async function font(family: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, { headers: { "user-agent": "curl/8" } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Link preview for play.terrace.social: the Terrace mark, the hero line and a take turned market. */
export default async function OpengraphImage() {
  const [cond, body] = await Promise.all([font("Barlow Condensed", 800), font("Barlow", 600)]);
  const fonts = [
    ...(cond ? [{ name: "Cond", data: cond, weight: 800 as const }] : []),
    ...(body ? [{ name: "Barlow", data: body, weight: 600 as const }] : []),
  ];
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/icons/icon-512.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#f9fafb", padding: 72, fontFamily: "Barlow", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(ellipse 60% 70% at 80% 30%, rgba(34,197,94,0.22), transparent 70%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={84} height={84} alt="" />
            <div style={{ fontFamily: "Cond", fontSize: 52, fontWeight: 800, letterSpacing: 1, display: "flex" }}>TERRACE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Cond", fontSize: 150, fontWeight: 800, lineHeight: 0.9, letterSpacing: -1, display: "flex", flexDirection: "column" }}>
              <span>BACK YOUR</span>
              <span style={{ color: "#22c55e" }}>TAKE.</span>
            </div>
            <div style={{ fontSize: 32, color: "#9ca3af", marginTop: 24, display: "flex" }}>Football calls with your mates. Free to play with $100 in test dollars.</div>
          </div>
        </div>
        <div style={{ width: 360, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#0c1a12,#111)", border: "2px solid #17422a", borderRadius: 24, padding: 26 }}>
            <div style={{ fontSize: 18, color: "#4ade80", fontWeight: 700, display: "flex" }}>MARKET</div>
            <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8, display: "flex" }}>Haaland scores before half-time</div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#0c1f14", border: "2px solid #17422a", borderRadius: 14, padding: 12 }}>
                <span style={{ fontSize: 16, color: "#4ade80", fontWeight: 700 }}>BACK</span><span style={{ fontFamily: "Cond", fontSize: 40, fontWeight: 800 }}>1/3</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#1d0d0d", border: "2px solid #452020", borderRadius: 14, padding: 12 }}>
                <span style={{ fontSize: 16, color: "#f87171", fontWeight: 700 }}>FADE</span><span style={{ fontFamily: "Cond", fontSize: 40, fontWeight: 800 }}>3/1</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "#4ade80" }}>play.terrace.social</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

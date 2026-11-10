import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { font } from "@/lib/server/og";

export const alt = "Terrace: back your take. The group chat for football calls, where your mates back it or fade it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AV = { blue: "#1d4ed8", rust: "#7c2d12", green: "#166534", violet: "#4c1d95", pink: "#831843" };

function Av({ c, t, size = 44 }: { c: string; t: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 600, color: "#fff", flexShrink: 0 }}>{t}</div>
  );
}

function Msg({ c, t, name, children }: { c: string; t: string; name: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Av c={c} t={t} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 17, color: "#9ca3af" }}>{name}</span>
        <div style={{ display: "flex", background: "#1a1a1a", border: "1.5px solid #262626", borderRadius: "4px 18px 18px 18px", padding: "10px 16px", fontSize: 22, maxWidth: 330 }}>{children}</div>
      </div>
    </div>
  );
}

/** Link preview for play.terrace.social: the hero line beside a match chat where one message became a take. */
export default async function OpengraphImage() {
  const [cond, body] = await Promise.all([font("Barlow Condensed", 800), font("Barlow", 600)]);
  const fonts = [
    ...(cond ? [{ name: "Cond", data: cond, weight: 800 as const }] : []),
    ...(body ? [{ name: "Barlow", data: body, weight: 600 as const }] : []),
  ];
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/icons/icon-512.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#f9fafb", padding: "64px 64px 64px 72px", fontFamily: "Barlow", position: "relative", gap: 40 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(ellipse 55% 75% at 82% 45%, rgba(34,197,94,0.2), transparent 70%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={80} height={80} alt="" />
            <div style={{ fontFamily: "Cond", fontSize: 50, fontWeight: 800, letterSpacing: 1, display: "flex" }}>TERRACE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Cond", fontSize: 124, fontWeight: 800, lineHeight: 0.9, whiteSpace: "nowrap", letterSpacing: -1, display: "flex", flexDirection: "column" }}>
              <span>BACK YOUR</span>
              <span style={{ color: "#22c55e" }}>TAKE.</span>
            </div>
            <div style={{ fontSize: 29, color: "#9ca3af", marginTop: 22, display: "flex", lineHeight: 1.3 }}>The group chat for football calls. Say it, and your mates back it or fade it.</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#4ade80", marginTop: 22, display: "flex" }}>play.terrace.social</div>
          </div>
        </div>
        <div style={{ width: 430, display: "flex", flexDirection: "column", background: "#111111", border: "2px solid #262626", borderRadius: 28, padding: 24, gap: 18, alignSelf: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 16, borderBottom: "1.5px solid #1e1e1e" }}>
            <div style={{ display: "flex" }}>
              <Av c={AV.blue} t="LU" size={36} />
              <div style={{ display: "flex", marginLeft: -10 }}><Av c={AV.green} t="GR" size={36} /></div>
              <div style={{ display: "flex", marginLeft: -10 }}><Av c={AV.pink} t="CK" size={36} /></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontFamily: "Cond", fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>MATCHDAY LADS</span>
              <span style={{ fontSize: 16, color: "#6b7280", whiteSpace: "nowrap" }}>Liverpool v City · 6 mates</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: "#f87171", background: "#3b0a0a", borderRadius: 99, padding: "5px 12px" }}><div style={{ width: 8, height: 8, borderRadius: 8, background: "#ef4444", display: "flex" }} />LIVE</div>
          </div>
          <Msg c={AV.blue} t="LU" name="Loud Ultra">City look sharp tonight</Msg>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Av c={AV.green} t="GR" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span style={{ fontSize: 17, color: "#9ca3af" }}>Golden Rabona</span>
              <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#0c1a12,#111)", border: "2px solid #17422a", borderRadius: "4px 18px 18px 18px", padding: "12px 16px 14px" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", letterSpacing: 1 }}>TAKE</span>
                <span style={{ fontSize: 25, fontWeight: 600, marginTop: 4 }}>Haaland scores in the first half</span>
                <div style={{ display: "flex", height: 8, borderRadius: 8, marginTop: 14, overflow: "hidden" }}>
                  <div style={{ width: "67%", background: "#22c55e", display: "flex" }} />
                  <div style={{ width: "33%", background: "#ef4444", display: "flex" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 16, fontWeight: 700 }}>
                  <span style={{ color: "#4ade80" }}>4 mates backing</span>
                  <span style={{ color: "#f87171" }}>2 fading</span>
                </div>
              </div>
            </div>
          </div>
          <Msg c={AV.pink} t="CK" name="Calm Keeper">Fading that. Van Dijk has him in his pocket</Msg>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

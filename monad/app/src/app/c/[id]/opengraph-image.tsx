import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// WhatsApp / iMessage preview for a challenge link
export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#7A1F3D", color: "#fff" }}>
        <div
          style={{
            height: 48,
            display: "flex",
            backgroundImage: "repeating-linear-gradient(-45deg, #7A1F3D 0 40px, #8EC5EA 40px 80px)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 72px", gap: 24 }}>
          <div style={{ fontSize: 44, opacity: 0.85 }}>Terrace</div>
          <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1 }}>You've been challenged.</div>
          <div style={{ fontSize: 40, opacity: 0.9 }}>Call the scores before kickoff. Free to play.</div>
        </div>
      </div>
    ),
    size,
  );
}

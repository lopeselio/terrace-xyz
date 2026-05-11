import { useId } from "react";

export const JUPITER_LOGO_URI = "https://cryptologos.cc/logos/jupiter-ag-jup-logo.png";

export function HeliusMark({ size = 18 }: { size?: number }) {
  const gradId = useId();
  const fill = `url(#${gradId})`;
  return (
    <svg width={size} height={size} viewBox="0 0 119 118" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E35930" />
          <stop offset="1" stopColor="#E84125" />
        </linearGradient>
      </defs>
      <path fill={fill} d="M74.6261 24.7253C69.9876 22.7665 64.8892 21.6871 59.531 21.6871C54.1727 21.6871 49.0743 22.7665 44.4358 24.7253L58.3013 0.709587C58.8412 -0.229856 60.2007 -0.229856 60.7406 0.709587L74.6161 24.7253H74.6261Z" />
      <path fill={fill} d="M40.7468 26.5242C31.6098 31.5812 24.742 40.2161 22.0128 50.54L11.7061 24.2856C11.3063 23.2762 12.156 22.2168 13.2257 22.3767L40.7468 26.5242Z" />
      <path fill={fill} d="M28.9906 84.4099L0.999611 75.7751C-0.0400563 75.4552 -0.33996 74.126 0.449787 73.3965L21.2431 54.1079C20.9032 56.1767 20.7233 58.3054 20.7233 60.4741C20.7233 69.5088 23.8123 77.8238 28.9906 84.4099Z" />
      <path fill={fill} d="M58.951 99.2611L34.4089 115.981C33.5091 116.591 32.2895 116.011 32.2096 114.922L30.0203 85.6492C37.018 93.8443 47.3747 99.0812 58.951 99.2511V99.2611Z" />
      <path fill={fill} d="M88.9513 85.7692L86.772 114.892C86.692 115.971 85.4724 116.561 84.5727 115.951L60.0806 99.2612C71.6269 99.1013 81.9536 93.9043 88.9513 85.7692Z" />
      <path fill={fill} d="M118.042 75.6851L90.1711 84.28C95.2895 77.7139 98.3385 69.4488 98.3385 60.4741C98.3385 58.2754 98.1486 56.1167 97.7987 54.0179L118.582 73.2965C119.382 74.0361 119.072 75.3653 118.042 75.6751V75.6851Z" />
      <path fill={fill} d="M107.355 24.3356L97.0588 50.5801C94.3396 40.2662 87.4918 31.6413 78.3848 26.5643L105.836 22.4268C106.906 22.2668 107.755 23.3262 107.355 24.3356Z" />
      <path fill={fill} d="M59.5307 107.636C53.8026 107.636 49.1641 112.273 49.1641 118H69.9074C69.9074 112.273 65.2689 107.636 59.5407 107.636H59.5307Z" />
      <path fill={fill} d="M97.4388 90.6563C93.8699 95.1336 94.5997 101.66 99.0782 105.228L112.004 89.0172C107.526 85.4494 100.998 86.1789 97.4288 90.6563H97.4388Z" />
      <path fill={fill} d="M105.936 50.57C107.206 56.1567 112.774 59.6446 118.352 58.3653L113.733 38.1473C108.145 39.4166 104.656 44.9833 105.936 50.56V50.57Z" />
      <path fill={fill} d="M80.4942 18.8588C85.6525 21.3473 91.8505 19.1786 94.3397 14.0116L75.6557 5.01697C73.1665 10.1739 75.3358 16.3702 80.5042 18.8588H80.4942Z" />
      <path fill={fill} d="M38.0978 18.8588C43.2561 16.3702 45.4254 10.1739 42.9362 5.01697L24.2522 14.0116C26.7414 19.1686 32.9394 21.3373 38.0978 18.8488V18.8588Z" />
      <path fill={fill} d="M13.3958 50.57C14.6654 44.9833 11.1765 39.4266 5.58826 38.1573L0.979736 58.3754C6.56795 59.6446 12.1262 56.1567 13.3958 50.57Z" />
      <path fill={fill} d="M8.49731 89.0172L21.4332 105.228C25.9117 101.66 26.6415 95.1336 23.0726 90.6563C19.5038 86.1789 12.9759 85.4494 8.49731 89.0172Z" />
    </svg>
  );
}

export function TerraceMark({ size = 28 }: { size?: number }) {
  const radius = Math.round(size * 0.28);
  const dotSize = Math.round(size * 0.28);
  const fontSize = Math.round(size * 0.48);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#111",
        border: "1px solid #333",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 700, color: "#fff", fontSize, lineHeight: 1 }}>T</span>
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: "#22c55e",
          position: "absolute",
          bottom: "12%",
          right: "10%",
        }}
      />
    </div>
  );
}

export function PolymarketLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/polymarket-logo.png"
      alt="Polymarket"
      width={size}
      height={size}
      style={{ borderRadius: size / 2, objectFit: "cover" }}
    />
  );
}

export function JupiterLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src={JUPITER_LOGO_URI}
      alt="Jupiter"
      width={size}
      height={size}
      style={{ borderRadius: size / 2, objectFit: "cover" }}
    />
  );
}

export function PrivyLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/privy-logo.png"
      alt="Privy"
      width={size}
      height={size}
      style={{ borderRadius: Math.round(size * 0.22), objectFit: "cover" }}
    />
  );
}

export function SolanaLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/solana-logo.png"
      alt="Solana"
      width={size}
      height={size}
      style={{ borderRadius: size / 2, objectFit: "cover" }}
    />
  );
}

export function GeminiLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/gemini-logo.png"
      alt="Gemini AI"
      width={size}
      height={size}
      style={{ objectFit: "cover" }}
    />
  );
}

export function TelegramLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/telegram-logo.png"
      alt="Telegram"
      width={size}
      height={size}
      style={{ borderRadius: "50%", flexShrink: 0 }}
    />
  );
}

export function DiscordLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/discord-logo.png"
      alt="Discord"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    />
  );
}

export function SolanaMarkSVG({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/solana-logo.png"
      alt="Solana"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    />
  );
}

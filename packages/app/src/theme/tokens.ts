// ---------------------------------------------------------------------------
// Terrace Night — design tokens (single source of truth).
// Mirrors design-system styles.css :root variables. Do not hardcode these hexes
// elsewhere; import from here so the palette has one home.
// ---------------------------------------------------------------------------

export const color = {
  // canvas
  canvas: "#0a0a0a",
  surface: "#111111",
  raised: "#1a1a1a",
  deep: "#0d0d0d",
  sunken: "#080808",
  line: "#262626",
  lineSoft: "#1e1e1e",
  lineHair: "#171717",

  // conviction — back (YES)
  green: "#22c55e",
  greenInk: "#4ade80",
  greenDeep: "#052e16",
  greenMid: "#14532d",
  greenGlow: "rgba(34,197,94,0.14)",

  // fade (NO)
  red: "#ef4444",
  redInk: "#f87171",
  redDeep: "#3b0a0a",
  redMid: "#450a0a",

  // signals
  amber: "#f59e0b",
  amberInk: "#fbbf24",
  amberDeep: "#2a1605",
  violet: "#a78bfa",
  violetInk: "#c4b5fd",
  violetDeep: "#2e1065",
  blue: "#60a5fa",
  blueDeep: "#12263f",

  // ink
  ink: "#f9fafb",
  ink2: "#9ca3af",
  ink3: "#6b7280",
  ink4: "#4b5563",
  ink5: "#374151",

  // CTA ink-on-green
  onGreen: "#04180c",
} as const;

// Font families. Barlow / Barlow Condensed are bundled via expo-font (see
// theme/fonts.ts); until the .ttf files land these fall back to the system face.
export const font = {
  sans: "Barlow",
  sansMed: "Barlow-Medium",
  sansSemi: "Barlow-SemiBold",
  sansBold: "Barlow-Bold",
  cond: "BarlowCondensed-SemiBold",
  condBold: "BarlowCondensed-Bold",
  condXBold: "BarlowCondensed-ExtraBold",
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  sheet: 28,
  pill: 999,
} as const;

export const space = { xs: 4, sm: 8, md: 12, gutter: 16, lg: 24, xl: 32 } as const;

export const layout = {
  gutter: 16,
  tabbarH: 62,
  tabbarSafe: 18,
  headerH: 54,
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  lift: {
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
} as const;

// Shared easing for Animated timing (approx cubic-bezier(.22,1,.36,1)).
export const motion = {
  enterMs: 260,
  skeletonMs: 380,
  springBackMs: 220,
  exitMs: 240,
} as const;

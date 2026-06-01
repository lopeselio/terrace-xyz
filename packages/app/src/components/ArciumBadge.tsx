import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";

const arciumLogo = require("../assets/arcium-logo.png");

// ── Inline pill badge ─────────────────────────────────────────────────────────
//
// Default label is "Private League" — fan-friendly. The Arcium logo stays as
// a subtle credential. Callers may override the label (e.g. for non-league
// surfaces that still want a "Private" chip) but should avoid acronyms.

export function ArciumBadge({ label = "Private League" }: { label?: string }) {
  return (
    <View style={pill.root}>
      <Image source={arciumLogo} style={pill.logo} />
      <Text style={pill.text}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a0a40",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
    borderWidth: 1,
    borderColor: "#5b21b6",
  },
  logo: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    color: "#c4b5fd",
    letterSpacing: 0.3,
  },
});

// ── Full privacy banner with branch-tree visual ───────────────────────────────
//
//   [A]
//    │
//    ├─● 🔒 Your positions are end-to-end encrypted
//    ├─● 👁 Hidden from everyone until market settlement
//    └─● ⚡ Outcome revealed by Multi-Party Computation
//

interface BannerProps {
  subtitle?: string;
  bullets?: string[];
}

const DEFAULT_BULLETS = [
  "🔒  Your pick stays yours. Nobody else gets a peek.",
  "👁  Hidden from your friends, your league, and the house.",
  "⚡  Only revealed when the final whistle blows.",
];

const SETTLED_BULLETS = [
  "✅  Full-time. The result is in.",
  "🔒  Every pick stayed under wraps the whole match.",
  "💰  Called it right? Claim your winnings below.",
];

export function ArciumPrivacyBanner({
  subtitle = "Powered by Arcium · picks stay sealed",
  bullets = DEFAULT_BULLETS,
}: BannerProps) {
  return (
    <View style={bn.container}>
      {/* ── Root row: logo + header ── */}
      <View style={bn.headerRow}>
        <Image source={arciumLogo} style={bn.logoLg} />
        <View style={bn.headerText}>
          <Text style={bn.title}>Private League</Text>
          <Text style={bn.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {/* ── Branch tree ── */}
      <View style={bn.treeWrap}>
        {/* Vertical stem from logo centre */}
        <View style={bn.stem} />

        {bullets.map((bullet, i) => (
          <View key={i} style={bn.branchRow}>
            {/* Horizontal branch */}
            <View style={bn.branchH} />
            {/* Dot at junction */}
            <View style={[bn.dot, i === bullets.length - 1 && bn.dotLast]} />
            <Text style={bn.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Variant for settled markets
export function ArciumSettledBanner() {
  return (
    <ArciumPrivacyBanner
      subtitle="Final whistle. Time to see who called it."
      bullets={SETTLED_BULLETS}
    />
  );
}

const PURPLE_STEM  = "#4c1d95";
const PURPLE_DOT   = "#7c3aed";
const PURPLE_TITLE = "#e9d5ff";
const PURPLE_SUB   = "#7c3aed";
const PURPLE_BULLET = "#a78bfa";

const bn = StyleSheet.create({
  container: {
    backgroundColor: "#0b0520",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3b1278",
    padding: 14,
    marginBottom: 14,
    overflow: "hidden",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  logoLg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: PURPLE_TITLE,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    color: PURPLE_SUB,
    marginTop: 2,
    fontWeight: "500",
  },

  treeWrap: {
    marginLeft: 17,       // align stem under logo centre (logo is 36px, so centre = 18, pad=14, net 18-1=17)
    paddingTop: 4,
    gap: 0,
  },
  stem: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 10,
    width: 2,
    backgroundColor: PURPLE_STEM,
    borderRadius: 1,
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    gap: 6,
  },
  branchH: {
    width: 16,
    height: 2,
    backgroundColor: PURPLE_STEM,
    marginLeft: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE_DOT,
  },
  dotLast: {
    backgroundColor: "#5b21b6",
  },
  bulletText: {
    fontSize: 12,
    color: PURPLE_BULLET,
    lineHeight: 18,
    flex: 1,
  },
});

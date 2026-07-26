import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { UnifiedMarket } from "@terrace/sdk";
import { TeamBadge } from "./MatchGroupCard";
import { TerraceMark, PolyJupLogos } from "../components/BrandIcons";

// ---------------------------------------------------------------------------
// The swipe deck — a Tinder-style stack for discovering active matchday
// markets. Each card is a single YES/NO statement.
//   right → back YES        left  → fade / take NO
//   up    → open detail      down  → skip
// Built on core Animated + PanResponder (no reanimated / gesture-handler in
// the app deps), so it runs on the Seeker dev build unchanged.
// ---------------------------------------------------------------------------

const SWIPE_Y = 130; // vertical commit threshold
const CARD_H = 430;

type Dir = "yes" | "no" | "detail" | "skip";

// --- helpers ---------------------------------------------------------------

function splitEventTitle(title: string): [string, string] {
  const parts = title.split(/\s+vs\.?\s+/i);
  return parts.length >= 2 ? [parts[0].trim(), parts[1].trim()] : [title, ""];
}

function formatVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}K`;
  return `$${usdc.toFixed(0)}`;
}

function countdownLabel(expiry: Date | null): string {
  if (!expiry) return "";
  const diff = expiry.getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const totalSecs = Math.floor(diff / 1_000);
  const d = Math.floor(totalSecs / 86_400);
  const h = Math.floor((totalSecs % 86_400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useCountdown(expiry: Date | null): string {
  const [label, setLabel] = useState(() => countdownLabel(expiry));
  useEffect(() => {
    const id = setInterval(() => setLabel(countdownLabel(expiry)), 1_000);
    return () => clearInterval(id);
  }, [expiry]);
  return label;
}

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(style).catch(() => {});
}

// --- card face -------------------------------------------------------------

function CardFace({ market }: { market: UnifiedMarket }) {
  const eventTitle = market.jupiterEventTitle ?? "";
  const [homeTeam, awayTeam] = splitEventTitle(eventTitle || market.question);
  const isHeadToHead = !!awayTeam;
  const statement = market.jupiterEventTitle ? market.question : market.question;
  const countdown = useCountdown(market.expiry);
  const yesPct = market.yesPrice > 0 ? Math.round(market.yesPrice * 100) : null;
  const noPct = market.noPrice > 0 ? Math.round(market.noPrice * 100) : yesPct != null ? 100 - yesPct : null;
  const [imgError, setImgError] = useState(false);
  const showImage = !!market.imageUrl && !imgError && !isHeadToHead;

  return (
    <View style={styles.cardInner}>
      {/* Top meta row */}
      <View style={styles.metaRow}>
        <View style={market.source === "native" ? styles.srcNative : styles.srcPoly}>
          {market.source === "native" ? <TerraceMark size={10} /> : <PolyJupLogos size={10} />}
          <Text style={market.source === "native" ? styles.srcNativeText : styles.srcPolyText}>
            {market.source === "native" ? "Terrace" : "Polymarket"}
          </Text>
        </View>
        {market.isPrivate && (
          <View style={styles.privateTag}>
            <Text style={styles.privateTagText}>🔒 Private</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {!!countdown && (
          <View style={styles.clockTag}>
            <Text style={styles.clockText}>⏱ {countdown}</Text>
          </View>
        )}
      </View>

      {/* Crest hero */}
      <View style={styles.hero}>
        {isHeadToHead ? (
          <View style={styles.crestPair}>
            <View style={styles.crestCol}>
              <TeamBadge name={homeTeam} size={72} />
              <Text style={styles.crestName} numberOfLines={1}>{homeTeam}</Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.crestCol}>
              <TeamBadge name={awayTeam} size={72} />
              <Text style={styles.crestName} numberOfLines={1}>{awayTeam}</Text>
            </View>
          </View>
        ) : showImage ? (
          <Image
            source={{ uri: market.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={styles.crestSolo}>
            <TeamBadge name={homeTeam} size={84} />
          </View>
        )}
      </View>

      {/* Statement */}
      {!!market.jupiterEventTitle && (
        <Text style={styles.context} numberOfLines={1}>{market.jupiterEventTitle}</Text>
      )}
      <Text style={styles.statement} numberOfLines={3}>{statement}</Text>

      {/* Odds + pool */}
      <View style={styles.footRow}>
        <View style={styles.oddsChip}>
          <Text style={styles.oddsYes}>YES {yesPct != null ? `${yesPct}¢` : "—"}</Text>
          <Text style={styles.oddsDivider}>·</Text>
          <Text style={styles.oddsNo}>NO {noPct != null ? `${noPct}¢` : "—"}</Text>
        </View>
        {market.totalVolumeUsdc > 0 && (
          <Text style={styles.pool}>🏆 {formatVol(market.totalVolumeUsdc)} pool</Text>
        )}
      </View>
    </View>
  );
}

// --- animated card wrapper -------------------------------------------------

interface CardProps {
  market: UnifiedMarket;
  isTop: boolean;
  width: number;
  swipeX: number;
  onSwipe: (dir: Dir, market: UnifiedMarket) => void;
}

function SwipeCard({ market, isTop, width, swipeX, onSwipe }: CardProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const cue = useRef<Dir | null>(null);

  const reset = () =>
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();

  const flyOff = (dir: Dir) => {
    const to =
      dir === "yes" ? { x: width * 1.4, y: 0 } :
      dir === "no" ? { x: -width * 1.4, y: 0 } :
      dir === "skip" ? { x: 0, y: CARD_H * 1.6 } :
      { x: 0, y: 0 };
    haptic(dir === "detail" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    if (dir === "detail") {
      onSwipe("detail", market);
      reset();
      return;
    }
    Animated.timing(pan, { toValue: to, duration: 220, useNativeDriver: false }).start(() =>
      onSwipe(dir, market),
    );
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy });
        const next: Dir | null =
          g.dx > 40 ? "yes" : g.dx < -40 ? "no" : g.dy < -40 ? "detail" : g.dy > 40 ? "skip" : null;
        if (next !== cue.current) {
          cue.current = next;
          if (next && next !== "detail") haptic(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_e, g) => {
        cue.current = null;
        if (g.dx > swipeX) flyOff("yes");
        else if (g.dx < -swipeX) flyOff("no");
        else if (g.dy < -SWIPE_Y) flyOff("detail");
        else if (g.dy > SWIPE_Y) flyOff("skip");
        else reset();
      },
      onPanResponderTerminate: () => reset(),
    }),
  ).current;

  const rotate = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ["-12deg", "0deg", "12deg"],
  });
  const yesOpacity = pan.x.interpolate({ inputRange: [0, swipeX], outputRange: [0, 1], extrapolate: "clamp" });
  const noOpacity = pan.x.interpolate({ inputRange: [-swipeX, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const detailOpacity = pan.y.interpolate({ inputRange: [-SWIPE_Y, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const skipOpacity = pan.y.interpolate({ inputRange: [0, SWIPE_Y], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: width - 36,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
        },
      ]}
      {...(isTop ? responder.panHandlers : {})}
    >
      {/* Directional stamps */}
      <Animated.View style={[styles.stamp, styles.stampYes, { opacity: yesOpacity }]}>
        <Text style={styles.stampTextYes}>YES</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampNo, { opacity: noOpacity }]}>
        <Text style={styles.stampTextNo}>NO</Text>
      </Animated.View>
      <Animated.View style={[styles.hintTop, { opacity: detailOpacity }]}>
        <Text style={styles.hintText}>▲ DETAILS</Text>
      </Animated.View>
      <Animated.View style={[styles.hintBottom, { opacity: skipOpacity }]}>
        <Text style={styles.hintText}>SKIP ▼</Text>
      </Animated.View>

      <CardFace market={market} />
    </Animated.View>
  );
}

// --- deck ------------------------------------------------------------------

interface Props {
  markets: UnifiedMarket[];
  onBet: (market: UnifiedMarket, isYes: boolean) => void;
  onDetail: (marketId: string) => void;
}

export function SwipeDeck({ markets, onBet, onDetail }: Props) {
  const { width } = useWindowDimensions();
  const swipeX = width * 0.28; // horizontal commit threshold
  // Only swipeable statements: open, non-flash markets. Highest-pool first so
  // the juiciest matchday calls surface at the top of the deck.
  const deck = useMemo(
    () =>
      markets
        .filter((m) => m.status === "Open" && !m.isFlash)
        .sort((a, b) => b.totalVolumeUsdc - a.totalVolumeUsdc)
        .slice(0, 40),
    [markets],
  );

  const [index, setIndex] = useState(0);
  // Reset the cursor if the underlying deck identity changes (refresh/filter)
  const deckKey = deck.map((m) => m.id).join("|");
  useEffect(() => { setIndex(0); }, [deckKey]);

  const handleSwipe = (dir: Dir, market: UnifiedMarket) => {
    if (dir === "detail") { onDetail(market.id); return; }
    if (dir === "yes") onBet(market, true);
    else if (dir === "no") onBet(market, false);
    // yes / no / skip all advance the deck
    setIndex((i) => i + 1);
  };

  const remaining = deck.length - index;

  if (deck.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🎴</Text>
        <Text style={styles.emptyTitle}>No open markets to swipe</Text>
        <Text style={styles.emptySub}>Pull to refresh or create the first one from the + tab</Text>
      </View>
    );
  }

  if (remaining <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🏁</Text>
        <Text style={styles.emptyTitle}>You've seen every matchday call</Text>
        <Text style={styles.emptySub}>Tap replay to run the deck again</Text>
        <TouchableOpacity style={styles.replayBtn} onPress={() => setIndex(0)} activeOpacity={0.85}>
          <Text style={styles.replayText}>↻ Replay deck</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const top = deck[index];
  const under = deck[index + 1];

  return (
    <View style={styles.deckWrap}>
      <View style={styles.stage}>
        {/* Card beneath (peek) */}
        {under && (
          <View style={[styles.card, styles.cardUnder, { width: width - 36 }]} pointerEvents="none">
            <CardFace market={under} />
          </View>
        )}
        {/* Top card — keyed so a fresh Animated.Value mounts per card */}
        <SwipeCard key={top.id} market={top} isTop width={width} swipeX={swipeX} onSwipe={handleSwipe} />
      </View>

      {/* Action bar — tap equivalents of the swipe gestures */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actBtn, styles.actNo]} onPress={() => handleSwipe("no", top)} activeOpacity={0.8}>
          <Text style={styles.actNoText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actBtn, styles.actSkip]} onPress={() => handleSwipe("skip", top)} activeOpacity={0.8}>
          <Text style={styles.actSkipText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actBtn, styles.actDetail]} onPress={() => handleSwipe("detail", top)} activeOpacity={0.8}>
          <Text style={styles.actDetailText}>ℹ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actBtn, styles.actYes]} onPress={() => handleSwipe("yes", top)} activeOpacity={0.8}>
          <Text style={styles.actYesText}>✓</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter}>{remaining} live {remaining === 1 ? "call" : "calls"} left · ← fade · back →</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  deckWrap: { paddingTop: 6, paddingBottom: 14 },
  stage: { height: CARD_H + 16, marginHorizontal: 18, alignItems: "center", justifyContent: "center" },

  card: {
    position: "absolute",
    height: CARD_H,
    backgroundColor: "#111",
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: "#262626",
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardUnder: { transform: [{ scale: 0.94 }, { translateY: 14 }], opacity: 0.6 },
  cardInner: { flex: 1 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  srcNative: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#052e16", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  srcNativeText: { fontSize: 10, fontWeight: "700", color: "#4ade80" },
  srcPoly: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1e3a5f", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  srcPolyText: { fontSize: 10, fontWeight: "700", color: "#60a5fa" },
  privateTag: { backgroundColor: "#2e1065", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  privateTagText: { fontSize: 10, fontWeight: "700", color: "#c4b5fd" },
  clockTag: { backgroundColor: "#1a1a1a", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 0.5, borderColor: "#2a2a2a" },
  clockText: { fontSize: 11, fontWeight: "700", color: "#f59e0b", fontVariant: ["tabular-nums"] },

  hero: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 150 },
  crestPair: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  crestCol: { alignItems: "center", gap: 8, width: 108 },
  crestName: { fontSize: 12, fontWeight: "600", color: "#d1d5db" },
  vs: { fontSize: 13, fontWeight: "700", color: "#4b5563" },
  crestSolo: { alignItems: "center" },
  heroImage: { width: 150, height: 150, borderRadius: 18, backgroundColor: "#1a1a1a" },

  context: { fontSize: 12, color: "#6b7280", fontWeight: "600", marginTop: 4 },
  statement: { fontSize: 20, fontWeight: "800", color: "#f9fafb", lineHeight: 26, marginTop: 4, letterSpacing: -0.3 },

  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  oddsChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0d0d0d", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 0.5, borderColor: "#1f1f1f" },
  oddsYes: { fontSize: 13, fontWeight: "800", color: "#22c55e" },
  oddsDivider: { fontSize: 13, color: "#374151" },
  oddsNo: { fontSize: 13, fontWeight: "800", color: "#ef4444" },
  pool: { fontSize: 12, fontWeight: "600", color: "#9ca3af" },

  // Stamps
  stamp: { position: "absolute", top: 26, zIndex: 10, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, transform: [{ rotate: "-14deg" }] },
  stampYes: { left: 22, borderColor: "#22c55e" },
  stampNo: { right: 22, borderColor: "#ef4444", transform: [{ rotate: "14deg" }] },
  stampTextYes: { fontSize: 30, fontWeight: "900", color: "#22c55e", letterSpacing: 1 },
  stampTextNo: { fontSize: 30, fontWeight: "900", color: "#ef4444", letterSpacing: 1 },
  hintTop: { position: "absolute", top: 20, alignSelf: "center", zIndex: 10, backgroundColor: "rgba(96,165,250,0.15)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  hintBottom: { position: "absolute", bottom: 20, alignSelf: "center", zIndex: 10, backgroundColor: "rgba(107,114,128,0.15)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  hintText: { fontSize: 13, fontWeight: "800", color: "#93c5fd", letterSpacing: 1 },

  // Action bar
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 18 },
  actBtn: { alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1.5 },
  actNo: { width: 58, height: 58, backgroundColor: "#1a0a0a", borderColor: "#ef4444" },
  actNoText: { fontSize: 24, fontWeight: "800", color: "#ef4444" },
  actSkip: { width: 46, height: 46, backgroundColor: "#141414", borderColor: "#374151" },
  actSkipText: { fontSize: 20, fontWeight: "800", color: "#6b7280" },
  actDetail: { width: 46, height: 46, backgroundColor: "#0b1a2e", borderColor: "#3b82f6" },
  actDetailText: { fontSize: 20, fontWeight: "800", color: "#60a5fa" },
  actYes: { width: 58, height: 58, backgroundColor: "#052e16", borderColor: "#22c55e" },
  actYesText: { fontSize: 26, fontWeight: "800", color: "#22c55e" },

  counter: { textAlign: "center", fontSize: 11, color: "#4b5563", marginTop: 12, fontWeight: "600" },

  // Empty / done
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#fff", textAlign: "center" },
  emptySub: { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 20 },
  replayBtn: { marginTop: 16, backgroundColor: "#22c55e", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  replayText: { fontSize: 14, fontWeight: "700", color: "#000" },
});

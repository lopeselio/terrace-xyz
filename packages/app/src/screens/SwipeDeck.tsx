import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  useWindowDimensions,
  AccessibilityInfo,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { UnifiedMarket } from "@terrace/sdk";
import { TeamBadge } from "./MatchGroupCard";
import { TerraceMark, PolyJupLogos } from "../components/BrandIcons";

// ---------------------------------------------------------------------------
// The swipe deck — a Tinder-style stack for triaging open markets.
//   right → back YES        left  → fade / take NO
//   up    → open detail      down  → skip
// Built on core Animated + PanResponder (no reanimated / gesture-handler in
// the app deps), so it runs on the Seeker dev build unchanged.
//
// Used on Home (Trending → Swipe) and as the default view of the Markets tab.
// ---------------------------------------------------------------------------

const DEFAULT_CARD_H = 430;
const SWIPE_Y = 120; // vertical commit distance
const COMMIT_FRACTION = 0.32; // horizontal commit = 32% of card width
const FLING_VELOCITY = 0.35; // px/ms — a fast flick commits below the distance

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

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => active && setRm(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setRm);
    return () => { active = false; sub.remove(); };
  }, []);
  return rm;
}

// --- card face (presentational, fed by one market) -------------------------

export function CardFace({ market }: { market: UnifiedMarket }) {
  const eventTitle = market.jupiterEventTitle ?? "";
  const [homeTeam, awayTeam] = splitEventTitle(eventTitle || market.question);
  const isHeadToHead = !!awayTeam;
  const countdown = useCountdown(market.expiry);
  const yesPct = market.yesPrice > 0 ? Math.round(market.yesPrice * 100) : null;
  const noPct = market.noPrice > 0 ? Math.round(market.noPrice * 100) : yesPct != null ? 100 - yesPct : null;
  const [imgError, setImgError] = useState(false);
  const showImage = !!market.imageUrl && !imgError && !isHeadToHead;

  return (
    <View style={styles.cardInner}>
      {/* Meta row */}
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
              <TeamBadge name={homeTeam} size={68} />
              <Text style={styles.crestName} numberOfLines={1}>{homeTeam}</Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.crestCol}>
              <TeamBadge name={awayTeam} size={68} />
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

      {/* Context + statement */}
      {!!market.jupiterEventTitle && (
        <Text style={styles.context} numberOfLines={1}>{market.jupiterEventTitle}</Text>
      )}
      <Text style={styles.statement} numberOfLines={2}>{market.question}</Text>

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

// --- animated card (gesture wrapper) ---------------------------------------

interface CardProps {
  market: UnifiedMarket;
  isTop: boolean;
  width: number;
  cardHeight: number;
  reduceMotion: boolean;
  /** yes/no springs back instead of flying off (parent advances on bet confirm) */
  deferHorizontal: boolean;
  onSwipe: (dir: Dir, market: UnifiedMarket) => void;
}

export const SwipeCard = forwardRef<{ flyOff: (dir: Dir) => void }, CardProps>(function SwipeCard(
  { market, isTop, width, cardHeight, reduceMotion, deferHorizontal, onSwipe },
  ref,
) {
  const pan = useRef(new Animated.ValueXY()).current;
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0.96)).current;
  const cue = useRef<Dir | null>(null);
  const commitX = COMMIT_FRACTION * width;

  useEffect(() => {
    if (reduceMotion) { entrance.setValue(1); return; }
    Animated.spring(entrance, { toValue: 1, useNativeDriver: false, friction: 7, tension: 80 }).start();
  }, [entrance, reduceMotion]);

  const reset = () =>
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();

  const flyOff = (dir: Dir) => {
    const to =
      dir === "yes" ? { x: width * 1.4, y: 0 } :
      dir === "no" ? { x: -width * 1.4, y: 0 } :
      dir === "skip" ? { x: 0, y: cardHeight * 1.6 } :
      { x: 0, y: 0 };
    Animated.timing(pan, { toValue: to, duration: reduceMotion ? 100 : 180, useNativeDriver: false })
      .start(() => onSwipe(dir, market));
  };

  // Let the parent fly this card off imperatively (e.g. after a bet confirms).
  useImperativeHandle(ref, () => ({ flyOff }), [width, cardHeight, reduceMotion]);

  const commitHorizontal = (dir: "yes" | "no") => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    if (deferHorizontal) {
      // Notify the parent to open the sheet, then spring back — the card only
      // leaves the deck if the bet is confirmed (parent calls flyOff()).
      onSwipe(dir, market);
      reset();
    } else {
      flyOff(dir);
    }
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
          if (next) haptic(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_e, g) => {
        cue.current = null;
        const flingX = Math.abs(g.vx) >= FLING_VELOCITY;
        if (g.dx > commitX || (flingX && g.vx > 0 && g.dx > 20)) commitHorizontal("yes");
        else if (g.dx < -commitX || (flingX && g.vx < 0 && g.dx < -20)) commitHorizontal("no");
        else if (g.dy < -SWIPE_Y) { haptic(Haptics.ImpactFeedbackStyle.Light); onSwipe("detail", market); reset(); }
        else if (g.dy > SWIPE_Y) { haptic(Haptics.ImpactFeedbackStyle.Medium); flyOff("skip"); }
        else reset();
      },
      onPanResponderTerminate: () => reset(),
    }),
  ).current;

  const rotate = reduceMotion
    ? "0deg"
    : pan.x.interpolate({ inputRange: [-240, 0, 240], outputRange: ["-12deg", "0deg", "12deg"], extrapolate: "clamp" });
  const yesOpacity = pan.x.interpolate({ inputRange: [0, commitX], outputRange: [0, 1], extrapolate: "clamp" });
  const noOpacity = pan.x.interpolate({ inputRange: [-commitX, 0], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: width - 36,
          height: cardHeight,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale: entrance }],
        },
      ]}
      {...(isTop ? responder.panHandlers : {})}
    >
      <Animated.View style={[styles.stamp, styles.stampYes, { opacity: yesOpacity }]}>
        <Text style={styles.stampTextYes}>YES</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampNo, { opacity: noOpacity }]}>
        <Text style={styles.stampTextNo}>NO</Text>
      </Animated.View>
      <CardFace market={market} />
    </Animated.View>
  );
});

// --- deck ------------------------------------------------------------------

export interface SwipeDeckHandle {
  /** Fly the current top card off and advance (call after a backed/faded bet confirms). */
  commitTop: (dir?: "yes" | "no") => void;
}

interface Props {
  markets: UnifiedMarket[];
  onBet: (market: UnifiedMarket, isYes: boolean) => void;
  onDetail: (marketId: string) => void;
  /** Card/stage height. Home uses 430; the Markets tab uses 360. */
  cardHeight?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /**
   * When true, a yes/no swipe opens the bet sheet but does NOT advance the deck
   * until the parent confirms via ref.commitTop(). A cancelled sheet keeps the
   * card. When false (Home), yes/no advances immediately.
   */
  deferAdvance?: boolean;
}

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { markets, onBet, onDetail, cardHeight = DEFAULT_CARD_H, loading = false, error = null, onRetry, deferAdvance = false },
  ref,
) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const topCardRef = useRef<{ flyOff: (dir: Dir) => void }>(null);

  // Open, non-flash markets, highest pool first, capped at 40.
  const baseDeck = useMemo(
    () =>
      markets
        .filter((m) => m.status === "Open" && !m.isFlash)
        .sort((a, b) => b.totalVolumeUsdc - a.totalVolumeUsdc)
        .slice(0, 40),
    [markets],
  );

  const [override, setOverride] = useState<UnifiedMarket[] | null>(null);
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);

  const deck = override ?? baseDeck;
  const deckKey = baseDeck.map((m) => m.id).join("|");
  // Reset the session whenever the underlying markets change (refresh / filter).
  useEffect(() => { setOverride(null); setIndex(0); setSkipped([]); }, [deckKey]);

  const top = deck[index];
  const under = deck[index + 1];
  const remaining = deck.length - index;
  const exhausted = !loading && !error && deck.length > 0 && remaining <= 0;

  const advance = () => setIndex((i) => i + 1);

  useImperativeHandle(ref, () => ({
    commitTop: (dir: "yes" | "no" = "yes") => { topCardRef.current?.flyOff(dir); },
  }), []);

  // Prefetch the next few crest/event images.
  useEffect(() => {
    for (let i = index; i < Math.min(index + 5, deck.length); i++) {
      const uri = deck[i]?.imageUrl;
      if (uri) Image.prefetch(uri).catch(() => {});
    }
  }, [index, deckKey]);

  const handleSwipe = (dir: Dir, market: UnifiedMarket) => {
    if (dir === "detail") { onDetail(market.id); return; }
    if (dir === "yes" || dir === "no") {
      onBet(market, dir === "yes");
      if (!deferAdvance) advance();
      return;
    }
    // skip
    setSkipped((s) => [...s, market.id]);
    advance();
  };

  const reshuffle = () => {
    const again = baseDeck.filter((m) => skipped.includes(m.id));
    if (again.length === 0) return;
    setOverride(again);
    setIndex(0);
    setSkipped([]);
  };

  // Buttons behave exactly like the matching gesture.
  const tapBet = (isYes: boolean) => {
    if (!top) return;
    onBet(top, isYes);
    // deferAdvance: the parent advances via commitTop() once the bet confirms.
    if (!deferAdvance) advance();
  };
  const tapDetail = () => { if (top) onDetail(top.id); };
  const tapSkip = () => { if (top) { topCardRef.current?.flyOff("skip"); } };

  // ── Stage content by state ──────────────────────────────────────────────
  let stage: React.ReactNode;
  if (loading) {
    stage = <SkeletonCard width={width} cardHeight={cardHeight} />;
  } else if (error) {
    stage = (
      <View style={[styles.stateBox, { height: cardHeight }]}>
        <Text style={styles.errorText}>{error}</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
            <Text style={styles.linkBtn}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else if (deck.length === 0) {
    stage = (
      <View style={[styles.stateBox, { height: cardHeight }]}>
        <Text style={styles.emptyEmoji}>🎴</Text>
        <Text style={styles.emptyTitle}>No open markets</Text>
        <Text style={styles.emptySub}>Pull to refresh or create one from the + tab</Text>
      </View>
    );
  } else if (exhausted) {
    stage = (
      <View style={[styles.stateBox, { height: cardHeight }]}>
        <Text style={styles.caughtUp}>You're all caught up</Text>
        <Text style={styles.emptySub}>You've triaged every open market</Text>
        {skipped.length > 0 && (
          <TouchableOpacity onPress={reshuffle} activeOpacity={0.7}>
            <Text style={styles.linkBtn}>Reshuffle skipped ({skipped.length})</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else {
    stage = (
      <>
        {under && (
          <View style={[styles.card, styles.cardUnder, { width: width - 36, height: cardHeight }]} pointerEvents="none">
            <CardFace market={under} />
          </View>
        )}
        <SwipeCard
          ref={topCardRef}
          key={top.id}
          market={top}
          isTop
          width={width}
          cardHeight={cardHeight}
          reduceMotion={reduceMotion}
          deferHorizontal={deferAdvance}
          onSwipe={handleSwipe}
        />
      </>
    );
  }

  const actionsDisabled = loading || !!error || !top;

  return (
    <View style={styles.deckWrap}>
      <View style={[styles.stage, { height: cardHeight + 16 }]}>{stage}</View>

      {/* Action row — tap equivalents of the swipe gestures */}
      <View style={[styles.actions, actionsDisabled && styles.actionsDisabled]} pointerEvents={actionsDisabled ? "none" : "auto"}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fade" style={[styles.actBtn, styles.actNo]} onPress={() => tapBet(false)} activeOpacity={0.8}>
          <Text style={styles.actNoText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip" style={[styles.actBtn, styles.actSkip]} onPress={tapSkip} activeOpacity={0.8}>
          <Text style={styles.actSkipText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Details" style={[styles.actBtn, styles.actDetail]} onPress={tapDetail} activeOpacity={0.8}>
          <Text style={styles.actDetailText}>ℹ</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={[styles.actBtn, styles.actYes]} onPress={() => tapBet(true)} activeOpacity={0.8}>
          <Text style={styles.actYesText}>✓</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter}>
        {Math.max(0, remaining)} live {remaining === 1 ? "call" : "calls"} left · ← fade · back →
      </Text>
    </View>
  );
});

// --- loading skeleton ------------------------------------------------------

function SkeletonCard({ width, cardHeight }: { width: number; cardHeight: number }) {
  const shimmer = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0.4, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const block = (style: object) => <Animated.View style={[styles.skelBlock, style, { opacity: shimmer }]} />;
  return (
    <View style={[styles.card, { width: width - 36, height: cardHeight }]}>
      {block({ width: 90, height: 20, borderRadius: 8 })}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 14 }}>
          {block({ width: 68, height: 68, borderRadius: 18 })}
          {block({ width: 68, height: 68, borderRadius: 18 })}
        </View>
      </View>
      {block({ width: "70%", height: 22, borderRadius: 6 })}
      <View style={{ height: 12 }} />
      {block({ width: 150, height: 30, borderRadius: 10 })}
    </View>
  );
}

const styles = StyleSheet.create({
  deckWrap: { paddingTop: 4 },
  stage: { marginHorizontal: 18, alignItems: "center", justifyContent: "center" },

  card: {
    position: "absolute",
    backgroundColor: "#111",
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: "#262626",
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardUnder: { transform: [{ scale: 0.94 }, { translateY: 12 }], opacity: 0.5 },
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

  hero: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 130 },
  crestPair: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  crestCol: { alignItems: "center", gap: 8, width: 104 },
  crestName: { fontSize: 12, fontWeight: "600", color: "#d1d5db" },
  vs: { fontSize: 13, fontWeight: "700", color: "#4b5563" },
  crestSolo: { alignItems: "center" },
  heroImage: { width: 140, height: 140, borderRadius: 18, backgroundColor: "#1a1a1a" },

  context: { fontSize: 12, color: "#6b7280", fontWeight: "600", marginTop: 4 },
  statement: { fontSize: 20, fontWeight: "800", color: "#f9fafb", lineHeight: 26, marginTop: 3, letterSpacing: -0.3 },

  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  oddsChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0d0d0d", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 0.5, borderColor: "#1f1f1f" },
  oddsYes: { fontSize: 13, fontWeight: "800", color: "#22c55e" },
  oddsDivider: { fontSize: 13, color: "#374151" },
  oddsNo: { fontSize: 13, fontWeight: "800", color: "#ef4444" },
  pool: { fontSize: 12, fontWeight: "600", color: "#9ca3af" },

  // Stamps
  stamp: { position: "absolute", zIndex: 10, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  stampYes: { top: 26, left: 22, borderColor: "#22c55e", transform: [{ rotate: "-14deg" }] },
  stampNo: { top: 24, right: 22, borderColor: "#ef4444", transform: [{ rotate: "14deg" }] },
  stampTextYes: { fontSize: 28, fontWeight: "900", color: "#22c55e", letterSpacing: 1 },
  stampTextNo: { fontSize: 28, fontWeight: "900", color: "#ef4444", letterSpacing: 1 },

  // Action bar
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 16 },
  actionsDisabled: { opacity: 0.4 },
  actBtn: { alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1.5 },
  actNo: { width: 58, height: 58, backgroundColor: "#1a0a0a", borderColor: "#ef4444" },
  actNoText: { fontSize: 24, fontWeight: "800", color: "#ef4444" },
  actSkip: { width: 46, height: 46, backgroundColor: "#141414", borderColor: "#374151" },
  actSkipText: { fontSize: 20, fontWeight: "800", color: "#6b7280" },
  actDetail: { width: 46, height: 46, backgroundColor: "#0b1a2e", borderColor: "#3b82f6" },
  actDetailText: { fontSize: 20, fontWeight: "800", color: "#60a5fa" },
  actYes: { width: 58, height: 58, backgroundColor: "#052e16", borderColor: "#22c55e" },
  actYesText: { fontSize: 26, fontWeight: "800", color: "#22c55e" },

  counter: { textAlign: "center", fontSize: 11, color: "#4b5563", marginTop: 12, marginBottom: 4, fontWeight: "600" },

  // States
  stateBox: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#fff", textAlign: "center" },
  caughtUp: { fontSize: 19, fontWeight: "800", color: "#f9fafb", textAlign: "center", letterSpacing: -0.3 },
  emptySub: { fontSize: 12, fontWeight: "600", color: "#6b7280", textAlign: "center", lineHeight: 18 },
  errorText: { fontSize: 13, color: "#f87171", textAlign: "center" },
  linkBtn: { fontSize: 14, fontWeight: "700", color: "#4ade80", marginTop: 8 },
  skelBlock: { backgroundColor: "#1a1a1a", borderRadius: 8 },
});

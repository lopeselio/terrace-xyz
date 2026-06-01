import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { Confetti } from "./Confetti";
import { cueWin } from "../utils/cues";

type Props = {
  visible: boolean;
  /** The market question for the bet the user just scored. */
  marketQuestion: string;
  /** How many other unscored eligible bets are still in YOUR BETS THIS GW. */
  remainingCount: number;
  /**
   * Private bets are validated inside the Arcium MPC circuit — the on-chain
   * tx always succeeds but the encrypted score only actually increments if
   * the user picked the winning side. So the celebration copy is different:
   * "Pick locked in, score updates if you called it right" for private,
   * "+1 LEAGUE POINT" for public bets where the on-chain side rejects losers.
   */
  isPrivateBet?: boolean;
  /** Close the modal but stay on the league sheet. */
  onDismiss: () => void;
  /** Optional: close modal + close league sheet so the user can find more markets. */
  onFindMoreMarkets?: () => void;
};

const SUPPORT_LINES = [
  "Keep the run going.",
  "On a roll, mate.",
  "That's another one in the back of the net.",
  "Eyes on the next one.",
  "Goal of the season material.",
];

const FINISHED_LINES = [
  "Top of the table material.",
  "Full sweep — all wins logged.",
  "Hat-trick territory.",
  "Player of the gameweek vibes.",
];

/**
 * Fan-friendly celebration for "+1 league point" events. Same visual language
 * as BetPlacedCelebrationModal so the app's success moments feel coherent.
 *
 * Two states:
 *   remainingCount > 0  →  "X more wins to score" + nudge to score next
 *   remainingCount === 0 →  "All done!" + nudge to back more markets
 */
export function ScoreWinCelebrationModal({
  visible,
  marketQuestion,
  remainingCount,
  isPrivateBet = false,
  onDismiss,
  onFindMoreMarkets,
}: Props) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Trophy/medal swing — slight rotation + small pop, repeats.
  const trophyRot = useRef(new Animated.Value(0)).current;
  const trophyScale = useRef(new Animated.Value(1)).current;
  // Big +1 burst — scales up and fades slightly above the card on open.
  const burstY = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;

  // Pick supportive line — fresh per open. Different pool when finished.
  const lineRef = useRef("");
  const isFinished = remainingCount <= 0;

  useEffect(() => {
    if (!visible) return;
    cueWin();
    const pool = isFinished ? FINISHED_LINES : SUPPORT_LINES;
    lineRef.current = pool[Math.floor(Math.random() * pool.length)];

    scale.setValue(0.8);
    opacity.setValue(0);
    burstY.setValue(0);
    burstOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      // +1 burst rises up over ~700ms then fades
      Animated.sequence([
        Animated.parallel([
          Animated.timing(burstOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(burstY, { toValue: -28, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.timing(burstOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // Trophy gentle swing loop
    trophyRot.setValue(0);
    trophyScale.setValue(1);
    const swing = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(trophyRot, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(trophyScale, { toValue: 1.05, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(trophyRot, { toValue: -1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(trophyScale, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.timing(trophyRot, { toValue: 0, duration: 350, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    swing.start();
    return () => swing.stop();
  }, [visible, scale, opacity, trophyRot, trophyScale, burstY, burstOpacity, isFinished]);

  const trophyRotation = trophyRot.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-9deg", "0deg", "9deg"],
  });

  // Stable confetti trigger — using Date.now() here re-fires Confetti on
  // every parent re-render and blocks the JS thread for several seconds.
  // A bare boolean / constant means Confetti only re-runs when visible flips.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.backdrop} onPress={onDismiss}>
        <Confetti trigger={visible ? 1 : null} />
        <Pressable onPress={() => {}}>
          <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
            {/* Trophy with subtle swing */}
            <Animated.Text
              style={[
                s.trophy,
                { transform: [{ rotate: trophyRotation }, { scale: trophyScale }] },
              ]}
            >
              {isFinished ? "🏆" : "🥇"}
            </Animated.Text>

            {/* +1 burst rising above the trophy */}
            <Animated.Text
              style={[s.plusBurst, { opacity: burstOpacity, transform: [{ translateY: burstY }] }]}
            >
              +1
            </Animated.Text>

            <Text style={s.kicker}>
              {isPrivateBet ? "PICK LOCKED IN" : "+1 LEAGUE POINT"}
            </Text>
            <Text style={s.headline}>
              {isFinished ? "All picks counted!" : isPrivateBet ? "Sealed with Arcium." : "Your win is in."}
            </Text>

            {/* Bet that was just scored */}
            <View style={s.summaryBox}>
              <Text style={s.summaryQuestion} numberOfLines={3}>{marketQuestion}</Text>
              <View style={s.summaryRow}>
                <View style={s.scoredPill}>
                  <Text style={s.scoredPillText}>
                    {isPrivateBet ? "🔒 SEALED" : "✅ SCORED"}
                  </Text>
                </View>
                <Text style={s.deltaText}>{isPrivateBet ? "+1 if right" : "+1 pt"}</Text>
              </View>
            </View>

            {/* Honesty note for private bets — the on-chain side can't know
                if the user picked right; only the MPC circuit does. The score
                only actually increments if the bet was on the winning side,
                revealed at gameweek end. */}
            {isPrivateBet && (
              <Text style={s.mpcNote}>
                Scores update only if you called it right. Find out at full-time.
              </Text>
            )}

            {/* Counter + direction */}
            {!isFinished ? (
              <>
                <View style={s.remainingBox}>
                  <Text style={s.remainingNumber}>{remainingCount}</Text>
                  <Text style={s.remainingLabel}>
                    {remainingCount === 1 ? "more win to score" : "more wins to score"} this gameweek
                  </Text>
                </View>
                <Text style={s.support}>{lineRef.current}</Text>
                <TouchableOpacity style={s.cta} onPress={onDismiss} activeOpacity={0.85}>
                  <Text style={s.ctaText}>⚡ Score next win</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.allDoneNote}>
                  Every winning bet you placed has been scored for GW points. Back more markets to load up for next gameweek.
                </Text>
                <Text style={s.support}>{lineRef.current}</Text>
                {onFindMoreMarkets && (
                  <TouchableOpacity style={s.cta} onPress={onFindMoreMarkets} activeOpacity={0.85}>
                    <Text style={s.ctaText}>🔥 Find more markets</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity style={s.secondaryCta} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={s.secondaryCtaText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: 320,
    maxWidth: "100%",
    backgroundColor: "#0f1115",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 24,
    alignItems: "center",
  },
  trophy: {
    fontSize: 64,
    lineHeight: 72,
    marginBottom: 2,
  },
  plusBurst: {
    position: "absolute",
    top: 18,
    fontSize: 32,
    fontWeight: "900",
    color: "#22c55e",
    textShadowColor: "rgba(34,197,94,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  kicker: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginTop: 4,
  },
  headline: {
    color: "#f9fafb",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  summaryBox: {
    width: "100%",
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#1f1f1f",
    padding: 14,
    marginTop: 16,
  },
  summaryQuestion: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  scoredPill: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderColor: "#22c55e",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  scoredPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: "#22c55e" },
  deltaText: {
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  remainingBox: {
    width: "100%",
    backgroundColor: "rgba(34,197,94,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    padding: 12,
    marginTop: 14,
    alignItems: "center",
  },
  remainingNumber: {
    color: "#4ade80",
    fontSize: 30,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  remainingLabel: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  allDoneNote: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  mpcNote: {
    color: "#a855f7",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  support: {
    color: "#9ca3af",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  cta: {
    marginTop: 16,
    backgroundColor: "#22c55e",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    width: "100%",
    alignItems: "center",
  },
  ctaText: { color: "#0a0a0a", fontSize: 15, fontWeight: "800" },
  secondaryCta: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryCtaText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
});

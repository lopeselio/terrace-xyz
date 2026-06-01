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
  Linking,
} from "react-native";
import { Confetti } from "./Confetti";
import { cueSuccess } from "../utils/cues";

type Props = {
  visible: boolean;
  /** Market title — e.g. "Germany vs England — both teams to score" */
  marketQuestion: string;
  /** Which side the user backed */
  outcomeLabel: "YES" | "NO";
  /** Stake in human USDC, e.g. 1.5 */
  stakeUsdc: number | null;
  /** True if this was an Arcium-encrypted private bet */
  isPrivate: boolean;
  /** Transaction signature — used to build the explorer URL */
  txSignature: string | null;
  /** Close the modal but stay on the same market. */
  onDismiss: () => void;
  /** Close the modal AND the parent bet sheet so the user returns to the markets list. */
  onBackAnother?: () => void;
};

const FINGERS_CROSSED_COPY = [
  "Fingers crossed, mate.",
  "Now we wait for the final whistle.",
  "Sit tight — kick-off's coming.",
  "Your pick is locked in.",
  "May the goals fall your way.",
];

function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

/**
 * Fan-friendly post-bet celebration. Replaces the inline "✅ Bet placed!" strip
 * with a real moment: bouncing ball, confetti, supportive copy, and a hidden
 * "view on explorer" affordance for the crypto-curious. Tap outside to dismiss.
 */
export function BetPlacedCelebrationModal({
  visible,
  marketQuestion,
  outcomeLabel,
  stakeUsdc,
  isPrivate,
  txSignature,
  onDismiss,
  onBackAnother,
}: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Ball anim: rises a touch then settles. Repeats while modal is open.
  const ballY = useRef(new Animated.Value(0)).current;
  const ballRot = useRef(new Animated.Value(0)).current;
  // Pick a supportive line, fresh per open.
  const lineRef = useRef(FINGERS_CROSSED_COPY[Math.floor(Math.random() * FINGERS_CROSSED_COPY.length)]);

  useEffect(() => {
    if (!visible) return;
    cueSuccess();
    lineRef.current = FINGERS_CROSSED_COPY[Math.floor(Math.random() * FINGERS_CROSSED_COPY.length)];
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    // Bouncing ball loop
    ballY.setValue(0);
    ballRot.setValue(0);
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ballY, { toValue: -12, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(ballRot, { toValue: 1, duration: 480, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ballY, { toValue: 0, duration: 320, easing: Easing.bounce, useNativeDriver: true }),
          Animated.timing(ballRot, { toValue: 2, duration: 320, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ]),
    );
    bounce.start();
    return () => bounce.stop();
  }, [visible, scale, opacity, ballY, ballRot]);

  const ballRotation = ballRot.interpolate({
    inputRange: [0, 2],
    outputRange: ["0deg", "360deg"],
  });

  const handleOpenExplorer = () => {
    if (txSignature) Linking.openURL(explorerUrl(txSignature)).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Backdrop — tap outside dismisses the modal (but not the parent sheet). */}
      <Pressable style={s.backdrop} onPress={onDismiss}>
        <Confetti trigger={visible ? 1 : null} />
        {/* Stop propagation so taps on the card don't dismiss. */}
        <Pressable onPress={() => {}}>
          <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
            {/* Bouncing ball */}
            <Animated.Text
              style={[
                s.ball,
                { transform: [{ translateY: ballY }, { rotate: ballRotation }] },
              ]}
            >
              ⚽
            </Animated.Text>

            <Text style={s.kicker}>BET PLACED</Text>
            <Text style={s.headline}>You&apos;re in the game.</Text>

            {/* Bet summary card */}
            <View style={s.summaryBox}>
              <Text style={s.summaryQuestion} numberOfLines={3}>{marketQuestion}</Text>
              <View style={s.summaryRow}>
                <View style={[s.pill, outcomeLabel === "YES" ? s.pillYes : s.pillNo]}>
                  <Text style={[s.pillText, outcomeLabel === "YES" ? s.pillTextYes : s.pillTextNo]}>
                    {outcomeLabel === "YES" ? "✅ CALLING IT" : "❌ NOT HAPPENING"}
                  </Text>
                </View>
                {stakeUsdc !== null && (
                  <Text style={s.stake}>{stakeUsdc.toFixed(2)} USDC</Text>
                )}
              </View>
            </View>

            {isPrivate && (
              <Text style={s.privateLine}>
                🔒 Locked in private. Nobody sees your call until the final whistle.
              </Text>
            )}

            <Text style={s.support}>{lineRef.current}</Text>

            {/* Primary CTA — close modal AND parent sheet, return to markets */}
            {onBackAnother && (
              <TouchableOpacity style={s.cta} onPress={onBackAnother} activeOpacity={0.85}>
                <Text style={s.ctaText}>⚡ Back another match</Text>
              </TouchableOpacity>
            )}

            {/* Secondary — stay on this market */}
            <TouchableOpacity style={s.secondaryCta} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={s.secondaryCtaText}>Stay here</Text>
            </TouchableOpacity>

            {/* Discreet tx view — for the crypto-curious only */}
            {txSignature && (
              <TouchableOpacity
                style={s.txLink}
                onPress={handleOpenExplorer}
                activeOpacity={0.6}
                accessibilityLabel="View transaction on Solana Explorer"
              >
                <Text style={s.txLinkIcon}>🔗</Text>
                <Text style={s.txLinkText}>View on chain</Text>
              </TouchableOpacity>
            )}
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
  ball: {
    fontSize: 64,
    lineHeight: 72,
    marginBottom: 6,
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
    marginTop: 18,
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
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillYes: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "#22c55e" },
  pillNo:  { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "#ef4444" },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  pillTextYes: { color: "#22c55e" },
  pillTextNo:  { color: "#ef4444" },
  stake: {
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  privateLine: {
    color: "#a855f7",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
  },
  support: {
    color: "#9ca3af",
    fontSize: 13,
    textAlign: "center",
    marginTop: 14,
    fontStyle: "italic",
  },
  cta: {
    marginTop: 20,
    backgroundColor: "#22c55e",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    width: "100%",
    alignItems: "center",
  },
  ctaText: { color: "#0a0a0a", fontSize: 15, fontWeight: "800" },
  secondaryCta: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryCtaText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
  txLink: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0.7,
  },
  txLinkIcon: { fontSize: 11 },
  txLinkText: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});

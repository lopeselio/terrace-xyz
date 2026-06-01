import React, { useEffect, useRef } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from "react-native";
import { Confetti } from "./Confetti";
import { cueWin } from "../utils/cues";

type Props = {
  visible: boolean;
  gameweek: number;
  score: number;
  onDismiss: () => void;
};

/**
 * One-shot celebration shown after the reveal_member_score callback writes the
 * decrypted score to LeagueMember on-chain. Tells the user the exact GW points
 * they just earned. The owner (LeagueScreen) gates firing per (league, gw) so
 * it doesn't re-pop every time the panel re-renders.
 */
export function RevealCelebrationModal({ visible, gameweek, score, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    cueWin();
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={s.backdrop}>
        {/* Confetti is keyed off the visible gameweek so each reveal triggers
            a fresh burst. Renders behind the card via the absolute layer. */}
        <Confetti trigger={visible ? gameweek : null} />
        <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
          <Text style={s.emoji}>{score === 0 ? "🤷" : "🎉"}</Text>
          <Text style={s.kicker}>YOU SCORED</Text>
          <Text style={s.score}>{score}</Text>
          <Text style={s.unit}>{score === 1 ? "point" : "points"}</Text>
          <Text style={s.context}>in Gameweek {gameweek}</Text>

          {/* Arcium MPC explainer — what just happened, in plain English. */}
          <View style={s.explainerBox}>
            <Text style={s.explainerKicker}>🔒 Sealed → 🔓 Revealed</Text>
            <Text style={s.explainerText}>
              Your picks have been counted in private all gameweek. Arcium MPC
              just decoded only YOUR total — the league still can&apos;t see it
              until they reveal theirs.
            </Text>
          </View>

          {score === 0 && (
            <Text style={s.zeroHint}>
              No points this week. Back another match next gameweek — long
              season ahead.
            </Text>
          )}

          <TouchableOpacity style={s.cta} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={s.ctaText}>{score === 0 ? "Onwards →" : "Nice. Continue →"}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0f1115",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 28,
    alignItems: "center",
  },
  emoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  kicker: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  score: {
    color: "#22c55e",
    fontSize: 72,
    fontWeight: "800",
    lineHeight: 80,
    marginTop: 4,
  },
  unit: {
    color: "#22c55e",
    fontSize: 16,
    fontWeight: "600",
    marginTop: -4,
  },
  context: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  sub: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
  explainerBox: {
    width: "100%",
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  explainerKicker: {
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  explainerText: {
    color: "#a78bfa",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
  zeroHint: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
    lineHeight: 17,
    paddingHorizontal: 6,
  },
  cta: {
    marginTop: 22,
    backgroundColor: "#22c55e",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  ctaText: {
    color: "#0a0a0a",
    fontSize: 15,
    fontWeight: "700",
  },
});

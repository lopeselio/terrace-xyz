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
import { JerseyAvatar } from "./JerseyAvatar";
import { cueWin } from "../utils/cues";

type Props = {
  visible: boolean;
  /** Pubkey of the winning member */
  winnerPubkey: string;
  /** Short truncated label for the winner (e.g. "6Gr3R…KZuq" or "You") */
  winnerLabel: string;
  /** The winning gameweek number */
  gameweek: number;
  /** Winning score */
  winnerScore: number;
  /** Total members who revealed for this gameweek */
  totalMembers: number;
  /** True if the local user is the winner — celebration text shifts */
  isMe: boolean;
  onDismiss: () => void;
};

const CHAMPION_LINES = [
  "Tactical genius.",
  "Read the game perfectly.",
  "Take a bow.",
  "Player of the gameweek.",
  "Form is permanent, class is temporary — you have both.",
];

const RUNNER_UP_LINES = [
  "Better luck next gameweek.",
  "Long season ahead.",
  "On to the next one.",
  "Back the right horse next time.",
];

/**
 * Crowns the gameweek winner once all (or enough) members have revealed.
 * Mirrors the celebration language of the bet/score modals so the app's
 * success moments feel coherent. Differentiates "you won" vs "they won".
 */
export function GameweekWinnerModal({
  visible,
  winnerPubkey,
  winnerLabel,
  gameweek,
  winnerScore,
  totalMembers,
  isMe,
  onDismiss,
}: Props) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const trophyBob = useRef(new Animated.Value(0)).current;
  const lineRef = useRef("");

  useEffect(() => {
    if (!visible) return;
    cueWin();
    const pool = isMe ? CHAMPION_LINES : RUNNER_UP_LINES;
    lineRef.current = pool[Math.floor(Math.random() * pool.length)];

    scale.setValue(0.8);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
    ]).start();

    trophyBob.setValue(0);
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(trophyBob, { toValue: -6, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(trophyBob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bob.start();
    return () => bob.stop();
  }, [visible, scale, opacity, trophyBob, isMe]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.backdrop} onPress={onDismiss}>
        <Confetti trigger={visible ? 1 : null} />
        <Pressable onPress={() => {}}>
          <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
            <Animated.Text style={[s.trophy, { transform: [{ translateY: trophyBob }] }]}>
              🏆
            </Animated.Text>

            <Text style={s.kicker}>GAMEWEEK {gameweek} CHAMPION</Text>

            {/* Winner identity block */}
            <View style={s.winnerBlock}>
              <JerseyAvatar pubkey={winnerPubkey} size={56} />
              <View style={s.winnerMeta}>
                <Text style={s.winnerName}>{isMe ? "YOU" : winnerLabel}</Text>
                <Text style={s.winnerScore}>
                  {winnerScore} {winnerScore === 1 ? "pt" : "pts"}
                </Text>
              </View>
            </View>

            <Text style={s.subtext}>
              {totalMembers} {totalMembers === 1 ? "member" : "members"} revealed · GW{gameweek} on the books
            </Text>

            <Text style={s.support}>{lineRef.current}</Text>

            <TouchableOpacity style={[s.cta, isMe ? s.ctaWin : s.ctaNeutral]} onPress={onDismiss} activeOpacity={0.85}>
              <Text style={[s.ctaText, isMe ? s.ctaTextWin : s.ctaTextNeutral]}>
                {isMe ? "🏆 Take the crown" : "On to GW " + (gameweek + 1)}
              </Text>
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
    backgroundColor: "rgba(0,0,0,0.78)",
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
    borderColor: "#fbbf24",
    padding: 24,
    alignItems: "center",
  },
  trophy: {
    fontSize: 72,
    lineHeight: 80,
    marginBottom: 4,
  },
  kicker: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginTop: 4,
    textAlign: "center",
  },
  winnerBlock: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    width: "100%",
    gap: 14,
  },
  winnerMeta: {
    flex: 1,
  },
  winnerName: {
    color: "#fbbf24",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: "monospace",
  },
  winnerScore: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  subtext: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 12,
    textAlign: "center",
  },
  support: {
    color: "#d1d5db",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  cta: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    width: "100%",
    alignItems: "center",
  },
  ctaWin: {
    backgroundColor: "#fbbf24",
  },
  ctaNeutral: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  ctaText: { fontSize: 15, fontWeight: "800" },
  ctaTextWin: { color: "#0a0a0a" },
  ctaTextNeutral: { color: "#d1d5db" },
});

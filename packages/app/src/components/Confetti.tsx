import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";

/**
 * Lightweight confetti burst — no extra deps, no native bindings. Renders
 * `count` colored squares that fall from above the visible area while
 * drifting horizontally and rotating. Fires once each time `trigger` flips
 * to a new value (we key the burst by `trigger` so repeat fires work).
 *
 * Mounted at the top of celebration surfaces (RevealCelebrationModal,
 * matchup-win banner, bet-claim success). When `trigger === null` the
 * component is inert and renders nothing — safe to leave mounted.
 */

type ConfettiProps = {
  // Toggle this to anything truthy/unique to fire a fresh burst.
  trigger: unknown;
  count?: number;
  durationMs?: number;
  // If set, confetti is clipped to this height (e.g. inside a modal card).
  // Defaults to the device window height.
  height?: number;
};

const PALETTE = ["#22c55e", "#fbbf24", "#6366f1", "#8b5cf6", "#06b6d4", "#f43f5e"];

const { width: SCREEN_W } = Dimensions.get("window");

export function Confetti({ trigger, count = 50, durationMs = 2200, height }: ConfettiProps) {
  const containerHeight = height ?? Dimensions.get("window").height;
  // Generate the static per-piece props once per burst (keyed by trigger).
  const pieces = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      key: `${String(trigger)}-${i}`,
      color: PALETTE[i % PALETTE.length],
      size: 6 + Math.random() * 6,
      startX: Math.random() * SCREEN_W,
      driftX: (Math.random() - 0.5) * 120,
      endY: containerHeight + 60,
      delay: Math.random() * 300,
      duration: durationMs * (0.8 + Math.random() * 0.4),
      rotations: 2 + Math.random() * 4,
      // half the pieces are squares, half are thin rectangles
      ratio: Math.random() < 0.5 ? 1 : 0.4,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, count, containerHeight, durationMs]);

  if (trigger == null) return null;

  return (
    <View pointerEvents="none" style={[styles.layer, { height: containerHeight }]}>
      {pieces.map(({ key, ...rest }) => (
        <Piece key={key} {...rest} />
      ))}
    </View>
  );
}

type PieceProps = {
  color: string;
  size: number;
  startX: number;
  driftX: number;
  endY: number;
  delay: number;
  duration: number;
  rotations: number;
  ratio: number;
};

function Piece({ color, size, startX, driftX, endY, delay, duration, rotations, ratio }: PieceProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, duration, delay]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, endY],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, driftX],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${rotations * 360}deg`],
  });
  // Hold full opacity through the fall, fade in the last 15%
  const opacity = progress.interpolate({
    inputRange: [0, 0.05, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: startX,
        top: 0,
        width: size,
        height: size * ratio,
        backgroundColor: color,
        borderRadius: 1,
        transform: [{ translateX }, { translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});

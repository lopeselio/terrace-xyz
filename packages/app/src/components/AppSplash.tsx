import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

const TERRACE_LOGO = require("../assets/terrace-logo.png");

/**
 * Full-screen splash overlay rendered on top of the app on launch.
 *
 * Hands off from the native cold-start splash (configured in app.json) and
 * stays up while the JS bundle settles — feels like one continuous animation
 * instead of "native splash → black flash → app". Fades + scales out after
 * the parent unmounts it (typically ~1.2s after first render).
 */
export function AppSplash({ visible }: { visible: boolean }) {
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const wordmarkY = useRef(new Animated.Value(8)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;

  // Subtle reveal of the wordmark a beat after mount.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 450,
        delay: 220,
        useNativeDriver: true,
      }),
      Animated.timing(wordmarkY, {
        toValue: 0,
        duration: 450,
        delay: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [wordmarkOpacity, wordmarkY]);

  // Fade + slight zoom-in once the parent says hide. We don't unmount
  // ourselves — the parent owns the lifecycle so timing stays predictable.
  useEffect(() => {
    if (visible) return;
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.04, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [visible, fade, scale]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[s.root, { opacity: fade, transform: [{ scale }] }]}
    >
      <Image source={TERRACE_LOGO} style={s.logo} resizeMode="contain" />
      <Animated.Text
        style={[
          s.wordmark,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkY }] },
        ]}
      >
        Terrace
      </Animated.Text>
      <Animated.Text
        style={[
          s.tagline,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkY }] },
        ]}
      >
        Back your take.
      </Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 18,
  },
  wordmark: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tagline: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 6,
  },
});

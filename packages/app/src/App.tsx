import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useWallet } from "./hooks/useWallet";
import { MarketListScreen } from "./screens/MarketListScreen";

export default function App() {
  const { publicKey, connected, connecting, connect, disconnect } = useWallet();
  const [markets] = useState([]);

  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.logo}>Terrace</Text>

        {connected ? (
          <TouchableOpacity style={styles.walletBtn} onPress={disconnect}>
            <Text style={styles.walletBtnText}>{shortKey}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.walletBtn, styles.connectBtn]}
            onPress={connect}
            disabled={connecting}
          >
            <Text style={styles.walletBtnText}>
              {connecting ? "Connecting…" : "Connect"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {!connected ? (
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Football prediction markets</Text>
          <Text style={styles.heroSub}>
            Bet on match outcomes with USDC on Solana.
          </Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={connect}>
            <Text style={styles.ctaBtnText}>Get started</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <MarketListScreen
          markets={markets}
          loading={false}
          onSelectMarket={(addr) => console.log("selected market:", addr)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  logo: {
    color: "#22c55e",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  walletBtn: {
    backgroundColor: "#1f2937",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  connectBtn: {
    backgroundColor: "#22c55e",
  },
  walletBtnText: {
    color: "#f9fafb",
    fontSize: 13,
    fontWeight: "600",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  heroTitle: {
    color: "#f9fafb",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  heroSub: {
    color: "#9ca3af",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  ctaBtn: {
    marginTop: 16,
    backgroundColor: "#22c55e",
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  ctaBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

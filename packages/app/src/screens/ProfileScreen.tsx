import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

// ---------------------------------------------------------------------------
// Badge tier logic
// ---------------------------------------------------------------------------

export type BadgeTier = "Casual" | "Sharp" | "Legend";

export function getBadgeTier(winRate: number): BadgeTier {
  if (winRate >= 0.70) return "Legend";
  if (winRate >= 0.50) return "Sharp";
  return "Casual";
}

const BADGE_META: Record<BadgeTier, { icon: string; color: string; bg: string }> = {
  Casual: { icon: "🎯", color: "#9ca3af", bg: "#1f2937" },
  Sharp:  { icon: "⚡", color: "#60a5fa", bg: "#1e3a5f" },
  Legend: { icon: "👑", color: "#f59e0b", bg: "#451a03" },
};

// ---------------------------------------------------------------------------
// Streak display
// ---------------------------------------------------------------------------

function streakLabel(streak: number): string {
  if (streak === 0) return "—";
  if (streak > 0)   return `🔥 ${streak}W`;
  return `❄️ ${Math.abs(streak)}L`;
}

function streakColor(streak: number): string {
  if (streak > 0) return "#f97316";
  if (streak < 0) return "#60a5fa";
  return "#6b7280";
}

// ---------------------------------------------------------------------------
// Stat cell
// ---------------------------------------------------------------------------

function StatCell({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reputation bar — the core differentiator from Kickr
// ---------------------------------------------------------------------------

interface RepBarProps {
  winRate: number;    // 0–1
  streak: number;     // positive = win streak, negative = loss streak
  totalCalls: number;
}

function RepBar({ winRate, streak, totalCalls }: RepBarProps) {
  const tier = getBadgeTier(winRate);
  const badge = BADGE_META[tier];

  return (
    <View style={styles.repSection}>
      <Text style={styles.sectionLabel}>REPUTATION</Text>

      <View style={styles.repRow}>
        {/* Win rate */}
        <View style={[styles.repCell, styles.repCellBorder]}>
          <Text style={styles.repValueLarge}>{Math.round(winRate * 100)}%</Text>
          <Text style={styles.repCellLabel}>Win rate</Text>
          <Text style={styles.repCellSub}>{totalCalls} calls</Text>
        </View>

        {/* Streak */}
        <View style={[styles.repCell, styles.repCellBorder]}>
          <Text style={[styles.repValueLarge, { color: streakColor(streak) }]}>
            {streakLabel(streak)}
          </Text>
          <Text style={styles.repCellLabel}>Streak</Text>
        </View>

        {/* Badge tier */}
        <View style={[styles.repCell, { backgroundColor: badge.bg, borderRadius: 12 }]}>
          <Text style={styles.repBadgeIcon}>{badge.icon}</Text>
          <Text style={[styles.repBadgeTier, { color: badge.color }]}>{tier}</Text>
          <Text style={styles.repCellLabel}>Badge</Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Profile screen
// ---------------------------------------------------------------------------

type HistoryTab = "Active" | "History";

interface Props {
  walletPubkey: string | null;
  /** Call this to trigger wallet connect flow */
  onConnectWallet: () => void;
}

export function ProfileScreen({ walletPubkey, onConnectWallet }: Props) {
  const [tab, setTab] = useState<HistoryTab>("Active");

  // Stub reputation data — will be wired to Jupiter profile API + on-chain
  // Reputation PDA in Phase 2/3.
  const STUB_REP = {
    winRate: 0.68,
    streak: 5,
    totalCalls: 123,
    winningCalls: 84,
    volumeUsdc: 139.30,
    trades: 40,
    openPositions: 7,
  };

  if (!walletPubkey) {
    return (
      <View style={styles.root}>
        <View style={styles.disconnectedHero}>
          <Text style={styles.disconnectedEmoji}>👤</Text>
          <Text style={styles.disconnectedTitle}>Your record lives here</Text>
          <Text style={styles.disconnectedSub}>
            Connect a wallet to track your win rate, badge tier, and prediction history.
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={onConnectWallet}>
            <Text style={styles.connectBtnText}>Connect wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const shortKey = `${walletPubkey.slice(0, 6)}…${walletPubkey.slice(-4)}`;
  const initial = walletPubkey.slice(0, 1).toUpperCase();

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* ── Header ──────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Profile</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Text>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ── Identity ────────────────────────────── */}
      <View style={styles.identityRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.identityMeta}>
          <Text style={styles.username}>@{walletPubkey.slice(0, 8).toLowerCase()}</Text>
          <View style={styles.addressRow}>
            <Text style={styles.address}>📋 {shortKey}</Text>
          </View>
        </View>
      </View>

      {/* ── Reputation bar ──────────────────────── */}
      <RepBar
        winRate={STUB_REP.winRate}
        streak={STUB_REP.streak}
        totalCalls={STUB_REP.totalCalls}
      />

      {/* ── Performance stats ───────────────────── */}
      <View style={styles.perfSection}>
        <Text style={styles.sectionLabel}>PERFORMANCE</Text>
        <View style={styles.perfRow}>
          <StatCell
            label="Volume"
            value={`$${STUB_REP.volumeUsdc.toFixed(2)}`}
          />
          <StatCell label="Trades" value={String(STUB_REP.trades)} />
          <StatCell
            label="Open"
            value={String(STUB_REP.openPositions)}
            valueColor="#22c55e"
          />
        </View>
      </View>

      {/* ── Active / History tabs ────────────────── */}
      <View style={styles.tabSection}>
        <View style={styles.tabBar}>
          {(["Active", "History"] as HistoryTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stub position list */}
        <View style={styles.stubPositions}>
          <Text style={styles.stubEmoji}>📊</Text>
          <Text style={styles.stubTitle}>
            {tab === "Active" ? "No open positions" : "No history yet"}
          </Text>
          <Text style={styles.stubSub}>
            {tab === "Active"
              ? "Back a market to see your active positions here"
              : "Your settled bets will appear here"}
          </Text>
        </View>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },

  // Disconnected state
  disconnectedHero: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, marginTop: 100 },
  disconnectedEmoji: { fontSize: 48 },
  disconnectedTitle: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  disconnectedSub:   { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  connectBtn:        { backgroundColor: "#22c55e", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  connectBtnText:    { fontSize: 15, fontWeight: "700", color: "#000" },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: "#fff" },
  settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: "#111", borderRadius: 16, marginHorizontal: 18, marginBottom: 12 },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1d4ed8", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#fff" },
  identityMeta:  { flex: 1 },
  username:      { fontSize: 15, fontWeight: "600", color: "#fff" },
  addressRow:    { flexDirection: "row", alignItems: "center", marginTop: 2 },
  address:       { fontSize: 11, color: "#6b7280" },

  // Reputation bar
  repSection: { marginHorizontal: 18, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "600", color: "#4b5563", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  repRow: { flexDirection: "row", backgroundColor: "#111", borderRadius: 16, overflow: "hidden" },
  repCell: { flex: 1, alignItems: "center", paddingVertical: 16, gap: 3 },
  repCellBorder: { borderRightWidth: 0.5, borderRightColor: "#1e1e1e" },
  repValueLarge: { fontSize: 20, fontWeight: "800", color: "#f9fafb" },
  repCellLabel:  { fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  repCellSub:    { fontSize: 9, color: "#4b5563" },
  repBadgeIcon:  { fontSize: 20 },
  repBadgeTier:  { fontSize: 13, fontWeight: "700" },

  // Performance
  perfSection: { marginHorizontal: 18, marginBottom: 16 },
  perfRow: { flexDirection: "row", backgroundColor: "#111", borderRadius: 16, overflow: "hidden" },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 2, borderRightWidth: 0.5, borderRightColor: "#1e1e1e" },
  statValue: { fontSize: 17, fontWeight: "700", color: "#f9fafb" },
  statSub:   { fontSize: 9, color: "#4b5563" },
  statLabel: { fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 },

  // Tabs
  tabSection: { marginHorizontal: 18 },
  tabBar: { flexDirection: "row", backgroundColor: "#111", borderRadius: 12, padding: 3, marginBottom: 16 },
  tabBtn:         { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabBtnActive:   { backgroundColor: "#1e1e1e" },
  tabBtnText:     { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  tabBtnTextActive: { color: "#f9fafb" },

  // Stub positions
  stubPositions: { alignItems: "center", paddingVertical: 40, gap: 8 },
  stubEmoji: { fontSize: 32 },
  stubTitle: { fontSize: 15, fontWeight: "600", color: "#9ca3af" },
  stubSub:   { fontSize: 13, color: "#4b5563", textAlign: "center", lineHeight: 20 },
});

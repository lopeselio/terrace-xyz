import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { BadgeTier, Bet, Parlay } from "@terrace/sdk";
import { useReputation } from "../hooks/useReputation";
import { useBets } from "../hooks/useBets";
import { useParlay } from "../hooks/useParlay";

// ---------------------------------------------------------------------------
// Badge tier logic
// ---------------------------------------------------------------------------

function getBadgeTier(winRate: number): BadgeTier {
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
  winRate: number;      // 0–1
  streak: number;       // positive = win streak, negative = loss streak
  totalCalls: number;
  badgeTier?: BadgeTier; // on-chain value; falls back to local computation
}

function RepBar({ winRate, streak, totalCalls, badgeTier }: RepBarProps) {
  const tier = badgeTier ?? getBadgeTier(winRate);
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
// Active & History position lists
// ---------------------------------------------------------------------------

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsdc(lamports: bigint) {
  return (Number(lamports) / 1_000_000).toFixed(2);
}

function BetRow({ bet }: { bet: Bet }) {
  return (
    <View style={pos.row}>
      <View style={pos.rowLeft}>
        <Text style={pos.marketAddr}>{shortAddr(bet.market)}</Text>
        <View style={[pos.outcomePill, bet.outcome === 0 ? pos.yesPill : pos.noPill]}>
          <Text style={pos.outcomePillText}>{bet.outcome === 0 ? "YES" : "NO"}</Text>
        </View>
      </View>
      <View style={pos.rowRight}>
        <Text style={pos.amount}>{fmtUsdc(bet.amount)} USDC</Text>
        {bet.claimed && <Text style={pos.claimedTag}>Claimed</Text>}
      </View>
    </View>
  );
}

function ParlayRow({
  parlay,
  onSettle,
  onClaim,
}: {
  parlay: Parlay;
  onSettle?: () => void;
  onClaim?: () => void;
}) {
  const statusColor: Record<string, string> = {
    Open: "#6b7280", Won: "#22c55e", Lost: "#ef4444",
    Claimed: "#9ca3af", Cancelled: "#9ca3af",
  };
  return (
    <View style={pos.parlayRow}>
      <View style={pos.parlayHeader}>
        <Text style={pos.parlayTitle}>{parlay.legs.length}-leg parlay</Text>
        <Text style={[pos.parlayStatus, { color: statusColor[parlay.status] ?? "#9ca3af" }]}>
          {parlay.status}
        </Text>
      </View>
      <Text style={pos.parlayStake}>Stake: {fmtUsdc(parlay.stakeUsdc)} USDC</Text>
      <View style={pos.parlayLegs}>
        {parlay.legs.map((l, i) => (
          <Text key={i} style={pos.parlayLeg}>
            {shortAddr(l.market)} → {l.outcome === 0 ? "YES" : "NO"}
          </Text>
        ))}
      </View>
      {parlay.status === "Open" && onSettle && (
        <TouchableOpacity style={pos.actionBtn} onPress={onSettle}>
          <Text style={pos.actionBtnText}>Settle</Text>
        </TouchableOpacity>
      )}
      {parlay.status === "Won" && onClaim && (
        <TouchableOpacity style={[pos.actionBtn, pos.actionBtnGreen]} onPress={onClaim}>
          <Text style={pos.actionBtnText}>Claim winnings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ActivePositions({
  bets,
  parlays,
  onSettleParlay,
  onClaimParlay,
}: {
  bets: Bet[];
  parlays: Parlay[];
  onSettleParlay: (p: Parlay) => void;
  onClaimParlay: (p: Parlay) => void;
}) {
  if (bets.length === 0 && parlays.length === 0) {
    return (
      <View style={styles.stubPositions}>
        <Text style={styles.stubEmoji}>📊</Text>
        <Text style={styles.stubTitle}>No open positions</Text>
        <Text style={styles.stubSub}>Back a market to see your active positions here</Text>
      </View>
    );
  }
  return (
    <View>
      {bets.map((b) => <BetRow key={b.address} bet={b} />)}
      {parlays.map((p) => (
        <ParlayRow
          key={p.address}
          parlay={p}
          onSettle={() => onSettleParlay(p)}
          onClaim={() => onClaimParlay(p)}
        />
      ))}
    </View>
  );
}

function HistoryPositions({ bets, parlays }: { bets: Bet[]; parlays: Parlay[] }) {
  if (bets.length === 0 && parlays.length === 0) {
    return (
      <View style={styles.stubPositions}>
        <Text style={styles.stubEmoji}>📈</Text>
        <Text style={styles.stubTitle}>No history yet</Text>
        <Text style={styles.stubSub}>Your settled bets will appear here</Text>
      </View>
    );
  }
  return (
    <View>
      {bets.map((b) => <BetRow key={b.address} bet={b} />)}
      {parlays.map((p) => <ParlayRow key={p.address} parlay={p} />)}
    </View>
  );
}

const pos = StyleSheet.create({
  row:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 8 },
  rowLeft:    { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  rowRight:   { alignItems: "flex-end", gap: 3 },
  marketAddr: { fontSize: 12, color: "#9ca3af", fontFamily: "monospace" },
  outcomePill:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  yesPill:         { backgroundColor: "#14532d" },
  noPill:          { backgroundColor: "#7f1d1d" },
  outcomePillText: { fontSize: 11, fontWeight: "700", color: "#f9fafb" },
  amount:     { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  claimedTag: { fontSize: 10, color: "#22c55e" },

  parlayRow:    { backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 8 },
  parlayHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  parlayTitle:  { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  parlayStatus: { fontSize: 12, fontWeight: "600" },
  parlayStake:  { fontSize: 12, color: "#9ca3af", marginBottom: 6 },
  parlayLegs:   { gap: 2, marginBottom: 8 },
  parlayLeg:    { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  actionBtn:       { backgroundColor: "#1a1a1a", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 0.5, borderColor: "#333" },
  actionBtnGreen:  { backgroundColor: "#14532d", borderColor: "#22c55e" },
  actionBtnText:   { fontSize: 12, fontWeight: "600", color: "#f9fafb" },
});

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
  const { reputation, loading: repLoading } = useReputation(walletPubkey);
  const { bets, loading: betsLoading } = useBets(walletPubkey);
  const { parlays, loadingParlays, settleParlay, claimParlay } = useParlay();

  // Derive display values from on-chain Reputation PDA; fall back to zeros for new users.
  const winRate     = reputation ? reputation.winRateBps / 10_000 : 0;
  const streak      = reputation?.currentStreak ?? 0;
  const totalCalls  = reputation?.totalBets ?? 0;
  const badgeTier   = reputation?.badgeTier;

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
      {repLoading ? (
        <View style={styles.repLoadingBox}>
          <ActivityIndicator color="#22c55e" />
        </View>
      ) : (
        <RepBar
          winRate={winRate}
          streak={streak}
          totalCalls={totalCalls}
          badgeTier={badgeTier}
        />
      )}

      {/* ── Performance stats ───────────────────── */}
      <View style={styles.perfSection}>
        <Text style={styles.sectionLabel}>PERFORMANCE</Text>
        <View style={styles.perfRow}>
          <StatCell label="Wins" value={String(reputation?.winningBets ?? 0)} />
          <StatCell label="Total" value={String(totalCalls)} />
          <StatCell
            label="Win rate"
            value={totalCalls > 0 ? `${Math.round(winRate * 100)}%` : "—"}
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

        {/* Position list */}
        {(betsLoading || loadingParlays) ? (
          <View style={styles.stubPositions}>
            <ActivityIndicator color="#22c55e" />
          </View>
        ) : tab === "Active" ? (
          <ActivePositions
            bets={bets.filter((b) => !b.claimed)}
            parlays={parlays.filter((p) => p.status === "Open" || p.status === "Won")}
            onSettleParlay={settleParlay}
            onClaimParlay={claimParlay}
          />
        ) : (
          <HistoryPositions
            bets={bets.filter((b) => b.claimed || b.resultRecorded)}
            parlays={parlays.filter((p) => p.status === "Won" || p.status === "Lost" || p.status === "Claimed" || p.status === "Cancelled")}
          />
        )}
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
  repLoadingBox: { marginHorizontal: 18, marginBottom: 12, height: 88, alignItems: "center", justifyContent: "center", backgroundColor: "#111", borderRadius: 16 },
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

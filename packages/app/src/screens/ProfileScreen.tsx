import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ToastAndroid,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import type { BadgeTier, Bet, Parlay, Matchup } from "@terrace/sdk";
import { deserializeMarketAccount } from "@terrace/sdk";
import { useReputation } from "../hooks/useReputation";
import { useBets } from "../hooks/useBets";
import { useParlay } from "../hooks/useParlay";
import { useMatchup } from "../hooks/useMatchup";
import { useWalletBalances } from "../hooks/useWalletBalances";
import { useSnsName } from "../hooks/useSnsName";
import { useCreatedMarkets, type CreatedMarket } from "../hooks/useCreatedMarkets";
import { useSettleMarket } from "../hooks/useSettleMarket";
import { useClaimWinnings } from "../hooks/useClaimWinnings";
import { usePrivateMarket } from "../hooks/usePrivateMarket";
import { useLeague, loadHistory, type GameweekScoreEntry } from "../hooks/useLeague";
import { ArciumBadge } from "../components/ArciumBadge";
import { Confetti } from "../components/Confetti";
import { cueWin } from "../utils/cues";
import { JerseyAvatar } from "../components/JerseyAvatar";
import { LinearGradient } from "expo-linear-gradient";

// Market summary needed to determine if a bet won
interface MarketSummary {
  status: "Open" | "Settled" | "Closed";
  outcome: number | null; // 0=No, 1=Yes (Rust program convention)
  creator: string;
  question: string;
}

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

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
// Hero tint — the profile hero gradient/accent shifts by badge tier
// ---------------------------------------------------------------------------

interface HeroTint { grad: readonly [string, string]; border: string; accent: string; pillBg: string; }

function heroTintFor(tier: BadgeTier): HeroTint {
  switch (tier) {
    case "Legend": return { grad: ["#2a1605", "#111"], border: "#78350f", accent: "#f59e0b", pillBg: "#1a1206" };
    case "Sharp":  return { grad: ["#0b1f3a", "#111"], border: "#1e3a5f", accent: "#60a5fa", pillBg: "#0b1a2e" };
    default:       return { grad: ["#141414", "#111"], border: "#262626", accent: "#9ca3af", pillBg: "#161616" };
  }
}

// ---------------------------------------------------------------------------
// Record-strip stat tile
// ---------------------------------------------------------------------------

function StatTile({ value, label, sub, color }: { value: string; label: string; sub?: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
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

function BetRow({
  bet,
  marketSummary,
  onClaim,
  claiming,
  claimError,
}: {
  bet: Bet;
  marketSummary?: MarketSummary;
  onClaim?: () => void;
  claiming?: boolean;
  claimError?: string | null;
}) {
  const settled = marketSummary?.status === "Settled";
  const isWinner =
    settled &&
    marketSummary?.outcome !== null &&
    marketSummary?.outcome !== undefined &&
    marketSummary?.outcome === bet.outcome &&
    !bet.claimed;
  const isLoser =
    settled &&
    marketSummary?.outcome !== null &&
    marketSummary?.outcome !== undefined &&
    marketSummary?.outcome !== bet.outcome;

  const question = marketSummary?.question;
  const statusOpen = !marketSummary || marketSummary.status === "Open";

  return (
    <View style={pos.row}>
      {/* Market question (falls back to short address while summary loads) */}
      <Text style={pos.marketQuestion} numberOfLines={2}>
        {question ? question : `Market ${shortAddr(bet.market)}`}
      </Text>

      <View style={pos.rowMeta}>
        <View style={pos.rowLeft}>
          <View style={[pos.outcomePill, bet.outcome === 1 ? pos.yesPill : pos.noPill]}>
            <Text style={pos.outcomePillText}>{bet.outcome === 1 ? "YES" : "NO"}</Text>
          </View>
          {statusOpen && (
            <View style={pos.openPill}>
              <Text style={pos.openPillText}>OPEN</Text>
            </View>
          )}
          {!statusOpen && marketSummary?.status === "Settled" && (
            <View style={pos.settledPill}>
              <Text style={pos.settledPillText}>SETTLED</Text>
            </View>
          )}
        </View>
        <View style={pos.rowRight}>
          <Text style={pos.amount}>{fmtUsdc(bet.amount)} USDC</Text>
          {bet.claimed && <Text style={pos.claimedTag}>✓ Claimed</Text>}
          {isLoser && !bet.claimed && !bet.resultRecorded && (
            <Text style={pos.lostTag}>✗ Lost</Text>
          )}
          {isLoser && bet.resultRecorded && (
            <Text style={pos.lostRecordedTag}>✗ Recorded</Text>
          )}
          {isWinner && onClaim && (
            <TouchableOpacity
              style={[pos.actionBtn, pos.actionBtnGreen, claiming && pos.btnDisabled]}
              onPress={onClaim}
              disabled={claiming}
            >
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={pos.actionBtnText}>Claim winnings</Text>
              )}
            </TouchableOpacity>
          )}
          {claiming === false && claimError && (
            <Text style={pos.claimErrorText} numberOfLines={2}>{claimError}</Text>
          )}
        </View>
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
            {shortAddr(l.market)} → {l.outcome === 1 ? "YES" : "NO"}
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

const MATCHUP_STATUS_COLOR: Record<string, string> = {
  Pending: "#d97706", Accepted: "#3b82f6", Settled: "#22c55e", Declined: "#6b7280",
};
const MATCHUP_STATUS_LABEL: Record<string, string> = {
  Pending: "⏳ Pending", Accepted: "⚔️ Active", Settled: "✅ Settled", Declined: "❌ Declined",
};

function MatchupRow({
  matchup,
  walletPubkey,
  marketQuestion,
}: {
  matchup: Matchup;
  walletPubkey: string;
  marketQuestion?: string;
}) {
  const isChallenger = matchup.challenger === walletPubkey;
  const myOutcome = isChallenger
    ? matchup.challengerOutcome
    : ((matchup.challengerOutcome === 1 ? 0 : 1) as 0 | 1);
  const otherAddr = isChallenger ? matchup.opponent : matchup.challenger;

  return (
    <View style={pos.parlayRow}>
      <View style={pos.parlayHeader}>
        <Text style={pos.parlayTitle}>
          {isChallenger ? "You challenged" : "Challenge from"} {shortAddr(otherAddr)}
        </Text>
        <Text style={[pos.parlayStatus, { color: MATCHUP_STATUS_COLOR[matchup.status] ?? "#9ca3af" }]}>
          {MATCHUP_STATUS_LABEL[matchup.status] ?? matchup.status}
        </Text>
      </View>
      <Text style={pos.marketQuestion} numberOfLines={2}>
        {marketQuestion ?? shortAddr(matchup.market)}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <View style={[pos.outcomePill, myOutcome === 1 ? pos.yesPill : pos.noPill]}>
          <Text style={pos.outcomePillText}>You: {myOutcome === 1 ? "YES" : "NO"}</Text>
        </View>
        <Text style={pos.amount}>{fmtUsdc(matchup.stakeUsdc)} USDC · pot {fmtUsdc(matchup.stakeUsdc * 2n)}</Text>
      </View>
    </View>
  );
}

function ActivePositions({
  bets,
  parlays,
  matchups,
  walletPubkey,
  marketSummaries,
  onSettleParlay,
  onClaimParlay,
  onClaimBet,
  claimingBet,
  claimError,
}: {
  bets: Bet[];
  parlays: Parlay[];
  matchups: Matchup[];
  walletPubkey: string | null;
  marketSummaries: Record<string, MarketSummary>;
  onSettleParlay: (p: Parlay) => void;
  onClaimParlay: (p: Parlay) => void;
  onClaimBet: (bet: Bet) => void;
  claimingBet: string | null;
  claimError: string | null;
}) {
  if (bets.length === 0 && parlays.length === 0 && matchups.length === 0) {
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
      {bets.map((b) => {
        const isClaiming = claimingBet === (b.address as string);
        return (
          <BetRow
            key={b.address}
            bet={b}
            marketSummary={marketSummaries[b.market as string]}
            onClaim={() => onClaimBet(b)}
            claiming={isClaiming}
            claimError={isClaiming === false ? claimError : null}
          />
        );
      })}
      {parlays.map((p) => (
        <ParlayRow
          key={p.address}
          parlay={p}
          onSettle={() => onSettleParlay(p)}
          onClaim={() => onClaimParlay(p)}
        />
      ))}
      {matchups.map((m) => (
        <MatchupRow
          key={m.address as string}
          matchup={m}
          walletPubkey={walletPubkey ?? ""}
          marketQuestion={marketSummaries[m.market as string]?.question}
        />
      ))}
    </View>
  );
}

function HistoryPositions({
  bets,
  parlays,
  matchups,
  walletPubkey,
  marketSummaries,
}: {
  bets: Bet[];
  parlays: Parlay[];
  matchups: Matchup[];
  walletPubkey: string | null;
  marketSummaries: Record<string, MarketSummary>;
}) {
  if (bets.length === 0 && parlays.length === 0 && matchups.length === 0) {
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
      {bets.map((b) => (
        <BetRow
          key={b.address}
          bet={b}
          marketSummary={marketSummaries[b.market as string]}
        />
      ))}
      {parlays.map((p) => <ParlayRow key={p.address} parlay={p} />)}
      {matchups.map((m) => (
        <MatchupRow
          key={m.address as string}
          matchup={m}
          walletPubkey={walletPubkey ?? ""}
          marketQuestion={marketSummaries[m.market as string]?.question}
        />
      ))}
    </View>
  );
}

const pos = StyleSheet.create({
  row:            { flexDirection: "column", backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 8, gap: 8 },
  marketQuestion: { fontSize: 13, fontWeight: "600", color: "#e5e7eb", lineHeight: 18 },
  rowMeta:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLeft:        { flexDirection: "row", alignItems: "center", gap: 6 },
  rowRight:       { alignItems: "flex-end", gap: 3 },
  marketAddr:     { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  outcomePill:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  yesPill:         { backgroundColor: "#14532d" },
  noPill:          { backgroundColor: "#7f1d1d" },
  outcomePillText: { fontSize: 11, fontWeight: "700", color: "#f9fafb" },
  openPill:        { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#1a2e1a", borderWidth: 0.5, borderColor: "#22c55e" },
  openPillText:    { fontSize: 10, fontWeight: "600", color: "#22c55e" },
  settledPill:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#1e1e1e" },
  settledPillText: { fontSize: 10, fontWeight: "600", color: "#6b7280" },
  amount:     { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  claimedTag: { fontSize: 10, color: "#22c55e" },

  parlayRow:    { backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 8 },
  parlayHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  parlayTitle:  { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  parlayStatus: { fontSize: 12, fontWeight: "600" },
  parlayStake:  { fontSize: 12, color: "#9ca3af", marginBottom: 6 },
  parlayLegs:   { gap: 2, marginBottom: 8 },
  parlayLeg:    { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  actionBtn:       { backgroundColor: "#1a1a1a", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", borderWidth: 0.5, borderColor: "#333", marginTop: 4 },
  actionBtnGreen:  { backgroundColor: "#14532d", borderColor: "#22c55e" },
  actionBtnText:   { fontSize: 12, fontWeight: "600", color: "#f9fafb" },
  btnDisabled:     { opacity: 0.5 },
  lostTag:         { fontSize: 10, color: "#ef4444", fontWeight: "600" },
  lostRecordedTag: { fontSize: 10, color: "#6b7280" },
  claimErrorText:  { fontSize: 10, color: "#f87171", maxWidth: 140, textAlign: "right", marginTop: 2 },
});

// ---------------------------------------------------------------------------
// Created markets — settle UI
// ---------------------------------------------------------------------------

function formatExpiry(diff: number): string {
  if (diff > 0) {
    if (diff < 60_000) {
      const s = Math.ceil(diff / 1_000);
      return `${s}s left`;
    }
    if (diff < 3_600_000) {
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      return s > 0 ? `${m}m ${s}s left` : `${m}m left`;
    }
    const h = Math.floor(diff / 3_600_000);
    return h < 24 ? `${h}h left` : `${Math.floor(h / 24)}d left`;
  }
  const ago = Math.abs(diff);
  if (ago < 3_600_000) {
    const m = Math.floor(ago / 60_000);
    return m < 1 ? "Just expired" : `Expired ${m}m ago`;
  }
  const h = Math.floor(ago / 3_600_000);
  return h < 24 ? `Expired ${h}h ago` : `Expired ${Math.floor(h / 24)}d ago`;
}

function CreatedMarketRow({
  market,
  onSettle,
  settling,
  onReveal,
  revealing,
}: {
  market: CreatedMarket;
  onSettle: (outcome: 0 | 1) => void;
  settling: boolean;
  onReveal?: () => void;
  revealing?: boolean;
}) {
  const expiryMs = market.expiry.getTime();
  const [diff, setDiff] = useState(() => expiryMs - Date.now());

  useEffect(() => {
    const remaining = expiryMs - Date.now();
    // Tick every second when < 1 hour left, every 30s otherwise
    const interval = remaining < 3_600_000 ? 1_000 : 30_000;
    const id = setInterval(() => setDiff(expiryMs - Date.now()), interval);
    return () => clearInterval(id);
  }, [expiryMs]);
  const statusColor: Record<string, string> = {
    Open: "#22c55e",
    Closed: "#f59e0b",
    Settled: "#6b7280",
  };

  return (
    <View style={cm.row}>
      <Text style={cm.question} numberOfLines={2}>{market.question}</Text>

      <View style={cm.meta}>
        <Text style={[cm.status, { color: statusColor[market.status] ?? "#9ca3af" }]}>
          {market.status}
        </Text>
        <Text style={[cm.expiry, diff <= 0 && market.status === "Open" && cm.expiryUrgent]}>
          {formatExpiry(diff)}
        </Text>
        {market.totalVolumeUsdc > 0 && (
          <Text style={cm.vol}>${market.totalVolumeUsdc.toFixed(2)} vol</Text>
        )}
      </View>

      {market.status === "Settled" && market.outcome !== null && (
        <View style={cm.settledRow}>
          <View style={[cm.outcomePill, market.outcome === 1 ? cm.yesPill : cm.noPill]}>
            <Text style={cm.pillText}>
              Settled {market.outcome === 1 ? "YES" : "NO"}
            </Text>
          </View>
        </View>
      )}

      {/* Creator revenue */}
      {market.creatorFeeBps > 0 && (
        <View style={cm.revenueRow}>
          <Text style={cm.revenueLabel}>
            Creator fee {(market.creatorFeeBps / 100).toFixed(1)}%
          </Text>
          <Text style={cm.revenueValue}>
            {market.estimatedRevenueUsdc > 0
              ? `~$${market.estimatedRevenueUsdc.toFixed(4)} earned`
              : "No volume yet"}
          </Text>
        </View>
      )}

      {market.status === "Open" && market.isPrivate && (
        <View style={cm.settleButtons}>
          <Text style={cm.settleHint}>Submit to Arcium MPC for reveal:</Text>
          <TouchableOpacity
            style={[cm.revealBtn, revealing && cm.btnDisabled]}
            onPress={onReveal}
            disabled={revealing}
          >
            {revealing ? (
              <ActivityIndicator size="small" color="#c4b5fd" />
            ) : (
              <View style={cm.revealBtnInner}>
                <Image
                  source={require("../assets/arcium-logo.png")}
                  style={cm.revealBtnLogo}
                />
                <Text style={cm.revealBtnText}>Reveal market</Text>
                <Text style={cm.revealBtnSub}>via Arcium MPC</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {market.status === "Open" && !market.isPrivate && (
        <View style={cm.settleButtons}>
          <Text style={cm.settleHint}>Settle this market:</Text>
          <View style={cm.settleRow}>
            <TouchableOpacity
              style={[cm.settleBtn, cm.yesBtn, settling && cm.btnDisabled]}
              onPress={() => onSettle(0)}
              disabled={settling}
            >
              {settling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={cm.settleBtnText}>✓ YES</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[cm.settleBtn, cm.noBtn, settling && cm.btnDisabled]}
              onPress={() => onSettle(1)}
              disabled={settling}
            >
              {settling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={cm.settleBtnText}>✗ NO</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function CreatedMarketsList({
  walletPubkey,
  onTotalRevenue,
}: {
  walletPubkey: string;
  onTotalRevenue?: (usdc: number) => void;
}) {
  const { markets, loading, refresh } = useCreatedMarkets(walletPubkey);
  const { status, settleMarket, reset } = useSettleMarket();
  const { revealMarket, status: revealStatus } = usePrivateMarket();
  const [settlingAddr, setSettlingAddr] = useState<string | null>(null);
  const [revealingAddr, setRevealingAddr] = useState<string | null>(null);

  // Surface total creator revenue to parent for stats display
  React.useEffect(() => {
    if (!onTotalRevenue) return;
    const total = markets.reduce((sum, m) => sum + m.estimatedRevenueUsdc, 0);
    onTotalRevenue(total);
  }, [markets, onTotalRevenue]);

  const handleSettle = async (address: string, outcome: 0 | 1) => {
    setSettlingAddr(address);
    await settleMarket(address, outcome);
    reset();
    setSettlingAddr(null);
    refresh();
  };

  const handleReveal = async (address: string) => {
    setRevealingAddr(address);
    try {
      await revealMarket({ market: address as any });
    } catch {
      // error surfaced via revealStatus
    }
    setRevealingAddr(null);
    refresh();
  };

  if (loading) {
    return (
      <View style={styles.stubPositions}>
        <ActivityIndicator color="#22c55e" />
      </View>
    );
  }

  if (markets.length === 0) {
    return (
      <View style={styles.stubPositions}>
        <Text style={styles.stubEmoji}>🏗️</Text>
        <Text style={styles.stubTitle}>No markets created yet</Text>
        <Text style={styles.stubSub}>
          Markets you deploy will appear here. Expired open markets can be settled.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {markets.map((m) => (
        <CreatedMarketRow
          key={m.address}
          market={m}
          onSettle={(outcome) => handleSettle(m.address, outcome)}
          settling={settlingAddr === m.address && (status === "building" || status === "signing" || status === "executing")}
          onReveal={() => handleReveal(m.address)}
          revealing={revealingAddr === m.address && (revealStatus === "building" || revealStatus === "signing" || revealStatus === "executing")}
        />
      ))}
    </View>
  );
}

const cm = StyleSheet.create({
  row: { backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 8, gap: 8 },
  question: { fontSize: 14, fontWeight: "600", color: "#f9fafb", lineHeight: 20 },
  meta: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  status: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  expiry: { fontSize: 11, color: "#6b7280" },
  expiryUrgent: { color: "#f59e0b", fontWeight: "600" },
  vol:    { fontSize: 11, color: "#4b5563" },
  settledRow: { flexDirection: "row" },
  outcomePill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  yesPill: { backgroundColor: "#14532d" },
  noPill:  { backgroundColor: "#7f1d1d" },
  pillText: { fontSize: 12, fontWeight: "700", color: "#f9fafb" },
  settleHint: { fontSize: 11, color: "#6b7280" },
  settleButtons: { gap: 6 },
  settleRow: { flexDirection: "row", gap: 8 },
  settleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  yesBtn:    { backgroundColor: "#052e16", borderColor: "#22c55e" },
  noBtn:     { backgroundColor: "#3b0a0a", borderColor: "#ef4444" },
  revealBtn: {
    backgroundColor: "#0b0520",
    borderWidth: 1,
    borderColor: "#4c1d95",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  revealBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  revealBtnLogo:  { width: 22, height: 22, borderRadius: 11 },
  revealBtnText:  { fontSize: 13, fontWeight: "700", color: "#c4b5fd", flex: 1 },
  revealBtnSub:   { fontSize: 11, color: "#5b21b6" },
  btnDisabled: { opacity: 0.5 },
  settleBtnText: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  revenueRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  revenueLabel:  { fontSize: 11, color: "#6b7280" },
  revenueValue:  { fontSize: 11, color: "#f59e0b", fontWeight: "600" },
});

// ---------------------------------------------------------------------------
// Position filter chips
// ---------------------------------------------------------------------------

type PositionFilter = "All" | "Bets" | "Parlays" | "Matchups" | "Leagues";

function FilterChips({
  filter,
  onChange,
  counts,
  includeLeagues = false,
}: {
  filter: PositionFilter;
  onChange: (f: PositionFilter) => void;
  counts: { bets: number; parlays: number; matchups: number; leagues?: number };
  /** Show the "Leagues" chip (Profile→History only — Active has no league history). */
  includeLeagues?: boolean;
}) {
  const chips: { label: string; value: PositionFilter; count: number }[] = [
    { label: "All", value: "All", count: counts.bets + counts.parlays + counts.matchups },
    { label: "Bets", value: "Bets", count: counts.bets },
    { label: "Parlays", value: "Parlays", count: counts.parlays },
    { label: "Matchups", value: "Matchups", count: counts.matchups },
  ];
  if (includeLeagues) {
    chips.push({ label: "Leagues", value: "Leagues", count: counts.leagues ?? 0 });
  }
  return (
    <View style={fc.row}>
      {chips.map((c) => (
        <TouchableOpacity
          key={c.value}
          style={[fc.chip, filter === c.value && fc.chipActive]}
          onPress={() => onChange(c.value)}
        >
          <Text style={[fc.chipText, filter === c.value && fc.chipTextActive]}>
            {c.label}{c.count > 0 ? ` · ${c.count}` : ""}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const fc = StyleSheet.create({
  row:          { flexDirection: "row", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  chip:         { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#333" },
  chipActive:   { backgroundColor: "#052e16", borderColor: "#22c55e" },
  chipText:     { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  chipTextActive: { color: "#22c55e" },
});

// ---------------------------------------------------------------------------
// Leagues tab (embedded in Profile)
// ---------------------------------------------------------------------------

function LeaguesTab({ walletPubkey, onOpen }: { walletPubkey: string | null; onOpen: () => void }) {
  const { myLeagues, joinedLeagues, myMemberships, loading } = useLeague(walletPubkey);

  const allLeagues = [
    ...myLeagues,
    ...joinedLeagues.filter((jl) => !myLeagues.some((ml) => String(ml.address) === String(jl.address))),
  ];

  if (loading) {
    return <ActivityIndicator color="#22c55e" style={{ marginTop: 32 }} />;
  }

  if (allLeagues.length === 0) {
    return (
      <View style={styles.stubPositions}>
        <Text style={styles.stubEmoji}>🏆</Text>
        <Text style={styles.stubTitle}>No leagues yet</Text>
        <Text style={styles.stubSub}>Create or join a league to compete with friends</Text>
        <TouchableOpacity style={lgStyles.openBtn} onPress={onOpen}>
          <Text style={lgStyles.openBtnText}>Go to Leagues</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {allLeagues.map((league) => {
        const membership = myMemberships.find((m) => String(m.league) === String(league.address));
        const isCreator = walletPubkey === String(league.creator);
        return (
          <TouchableOpacity key={String(league.address)} style={lgStyles.card} onPress={onOpen} activeOpacity={0.8}>
            <View style={lgStyles.cardHeader}>
              <Text style={lgStyles.leagueName} numberOfLines={1}>{league.name}</Text>
              {league.isPrivate && <ArciumBadge />}
            </View>
            <View style={lgStyles.metaRow}>
              <Text style={lgStyles.meta}>GW {league.gameweek}</Text>
              <Text style={lgStyles.metaDot}>·</Text>
              <Text style={lgStyles.meta}>{league.memberCount}/{league.maxMembers} members</Text>
              {isCreator && <><Text style={lgStyles.metaDot}>·</Text><Text style={[lgStyles.meta, { color: "#4ade80" }]}>Creator</Text></>}
            </View>
            {membership ? (
              <View style={lgStyles.scoreRow}>
                <View style={lgStyles.scoreCell}>
                  <Text style={lgStyles.scoreValue}>{membership.gameweekScore}</Text>
                  <Text style={lgStyles.scoreLabel}>GW pts</Text>
                </View>
                <View style={lgStyles.scoreDivider} />
                <View style={lgStyles.scoreCell}>
                  <Text style={lgStyles.scoreValue}>{membership.totalScore}</Text>
                  <Text style={lgStyles.scoreLabel}>Total wins</Text>
                </View>
                <View style={lgStyles.scoreDivider} />
                <View style={lgStyles.scoreCell}>
                  <Text style={[lgStyles.scoreValue, { color: "#60a5fa" }]}>S{league.season}</Text>
                  <Text style={lgStyles.scoreLabel}>Season</Text>
                </View>
              </View>
            ) : (
              <Text style={lgStyles.notJoined}>Not yet joined — tap to enter</Text>
            )}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={lgStyles.openBtn} onPress={onOpen}>
        <Text style={lgStyles.openBtnText}>Open Leagues</Text>
      </TouchableOpacity>
    </View>
  );
}

const lgStyles = StyleSheet.create({
  card:        { backgroundColor: "#111", borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: "#1f2937" },
  cardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  leagueName:  { fontSize: 15, fontWeight: "700", color: "#fff", flex: 1 },
  metaRow:     { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  meta:        { fontSize: 12, color: "#6b7280" },
  metaDot:     { fontSize: 12, color: "#374151" },
  scoreRow:    { flexDirection: "row", backgroundColor: "#0a0a0a", borderRadius: 10, overflow: "hidden" },
  scoreCell:   { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  scoreDivider:{ width: 0.5, backgroundColor: "#1f2937" },
  scoreValue:  { fontSize: 18, fontWeight: "700", color: "#f9fafb" },
  scoreLabel:  { fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 },
  notJoined:   { fontSize: 11, color: "#4b5563", fontStyle: "italic" },
  openBtn:     { backgroundColor: "#1a1a1a", borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 0.5, borderColor: "#2a2a2a", marginTop: 4 },
  openBtnText: { fontSize: 13, fontWeight: "600", color: "#9ca3af" },
});

// ---------------------------------------------------------------------------
// History → Leagues list — per-league GW score ledger
// ---------------------------------------------------------------------------

interface LeagueHistoryRow {
  leagueAddress: string;
  leagueName: string;
  isPrivate: boolean;
  entries: GameweekScoreEntry[];  // user's own GW scores
  total: number;                  // sum across all GWs in entries
  currentGw: number;              // league.gameweek (so we can label "current")
}

function HistoryLeaguesList({ walletPubkey, onOpen }: { walletPubkey: string | null; onOpen: () => void }) {
  const { myLeagues, joinedLeagues, loading } = useLeague(walletPubkey);
  const [rows, setRows] = useState<LeagueHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const allLeagues = useMemo(() => {
    return [
      ...myLeagues,
      ...joinedLeagues.filter((jl) => !myLeagues.some((ml) => String(ml.address) === String(jl.address))),
    ];
  }, [myLeagues, joinedLeagues]);

  // Load each league's history snapshot and pluck the user's own GW entries.
  useEffect(() => {
    if (!walletPubkey || allLeagues.length === 0) { setRows([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      const out: LeagueHistoryRow[] = [];
      for (const league of allLeagues) {
        const history = await loadHistory(String(league.address));
        const myEntries = history[walletPubkey] ?? [];
        const total = myEntries.reduce((acc, e) => acc + e.score, 0);
        out.push({
          leagueAddress: String(league.address),
          leagueName: league.name,
          isPrivate: league.isPrivate,
          entries: myEntries,
          total,
          currentGw: league.gameweek,
        });
      }
      if (!cancelled) {
        setRows(out);
        setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [walletPubkey, allLeagues]);

  if (loading || historyLoading) {
    return <ActivityIndicator color="#22c55e" style={{ marginTop: 32 }} />;
  }

  if (rows.length === 0) {
    return (
      <View style={historyLeagueStyles.empty}>
        <Text style={historyLeagueStyles.emptyEmoji}>🏆</Text>
        <Text style={historyLeagueStyles.emptyTitle}>No league history yet</Text>
        <Text style={historyLeagueStyles.emptyText}>
          Join a private league and play a gameweek. Your per-GW scores will
          show up here.
        </Text>
        <TouchableOpacity style={historyLeagueStyles.openBtn} onPress={onOpen}>
          <Text style={historyLeagueStyles.openBtnText}>Open Leagues</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => (
        <TouchableOpacity
          key={row.leagueAddress}
          style={historyLeagueStyles.card}
          onPress={onOpen}
          activeOpacity={0.8}
        >
          <View style={historyLeagueStyles.cardHeader}>
            <Text style={historyLeagueStyles.leagueName} numberOfLines={1}>
              {row.leagueName}
            </Text>
            {row.isPrivate && (
              <View style={historyLeagueStyles.privateBadge}>
                <Text style={historyLeagueStyles.privateBadgeText}>🔒 Private</Text>
              </View>
            )}
          </View>

          {row.entries.length === 0 ? (
            <Text style={historyLeagueStyles.noGws}>
              No revealed gameweeks yet. {row.currentGw === 1 ? "Season just started." : `Currently on GW${row.currentGw}.`}
            </Text>
          ) : (
            <View style={historyLeagueStyles.gwGrid}>
              {row.entries.map((e) => (
                <View key={e.gw} style={historyLeagueStyles.gwChip}>
                  <Text style={historyLeagueStyles.gwChipLabel}>GW{e.gw}</Text>
                  <Text style={historyLeagueStyles.gwChipScore}>{e.score}</Text>
                </View>
              ))}
              {/* Show current GW as in-progress if it hasn't been revealed yet */}
              {!row.entries.some((e) => e.gw === row.currentGw) && (
                <View style={[historyLeagueStyles.gwChip, historyLeagueStyles.gwChipPending]}>
                  <Text style={historyLeagueStyles.gwChipLabel}>GW{row.currentGw}</Text>
                  <Text style={historyLeagueStyles.gwChipPendingText}>•••</Text>
                </View>
              )}
            </View>
          )}

          <View style={historyLeagueStyles.footer}>
            <Text style={historyLeagueStyles.footerLabel}>Career total</Text>
            <Text style={historyLeagueStyles.footerTotal}>
              {row.total} {row.total === 1 ? "pt" : "pts"}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const historyLeagueStyles = StyleSheet.create({
  card:         { backgroundColor: "#111", borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: "#1f2937" },
  cardHeader:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  leagueName:   { fontSize: 15, fontWeight: "700", color: "#fff", flex: 1 },
  privateBadge: { backgroundColor: "#1a0a40", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: "#5b21b6" },
  privateBadgeText: { fontSize: 10, color: "#c4b5fd", fontWeight: "700" },
  noGws:        { fontSize: 12, color: "#6b7280", fontStyle: "italic", marginBottom: 12 },
  gwGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  gwChip:       { backgroundColor: "#0a0a0a", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", borderWidth: 0.5, borderColor: "#1f2937", minWidth: 56 },
  gwChipPending:{ borderStyle: "dashed", borderColor: "#5b21b6" },
  gwChipLabel:  { fontSize: 9, color: "#6b7280", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  gwChipScore:  { fontSize: 16, fontWeight: "800", color: "#22c55e", fontVariant: ["tabular-nums"], marginTop: 1 },
  gwChipPendingText: { fontSize: 14, fontWeight: "700", color: "#c4b5fd", marginTop: 1 },
  footer:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#1f2937", paddingTop: 10 },
  footerLabel:  { fontSize: 11, color: "#6b7280", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  footerTotal:  { fontSize: 18, fontWeight: "800", color: "#fbbf24", fontVariant: ["tabular-nums"] },
  empty:        { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyEmoji:   { fontSize: 36, marginBottom: 4 },
  emptyTitle:   { fontSize: 14, fontWeight: "700", color: "#e5e7eb" },
  emptyText:    { fontSize: 12, color: "#6b7280", textAlign: "center", maxWidth: 280, lineHeight: 18 },
  openBtn:      { backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 12 },
  openBtnText:  { fontSize: 13, fontWeight: "700", color: "#0a0a0a" },
});

// ---------------------------------------------------------------------------
// Profile screen
// ---------------------------------------------------------------------------

type HistoryTab = "Active" | "History" | "Created" | "Leagues";

interface Props {
  walletPubkey: string | null;
  isLoggedIn?: boolean;
  walletError?: string | null;
  privyUser?: any;
  onConnectWallet: () => void;
  onDisconnect?: () => void;
  onNavigateLeague?: () => void;
}

export function ProfileScreen({ walletPubkey, isLoggedIn, walletError, privyUser, onConnectWallet, onDisconnect, onNavigateLeague }: Props) {
  const [tab, setTab] = useState<HistoryTab>("Active");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All");
  const [walletTimedOut, setWalletTimedOut] = useState(false);
  const [creatorRevenue, setCreatorRevenue] = useState<number>(0);
  const [claimSuccess, setClaimSuccess] = useState<{ emoji: string; title: string; body: string } | null>(null);
  const { reputation, loading: repLoading, refresh: refreshRep } = useReputation(walletPubkey);
  const { bets, loading: betsLoading, refresh: refreshBets } = useBets(walletPubkey);
  const { parlays, loadingParlays, settleParlay, claimParlay, refresh: refreshParlays } = useParlay();
  const { challengerMatchups, opponentMatchups } = useMatchup();
  const { claim: claimWinnings, error: claimWinError, reset: resetClaim } = useClaimWinnings();
  const [claimingBet, setClaimingBet] = useState<string | null>(null);

  const allMatchups = [...challengerMatchups, ...opponentMatchups];

  // Sorted by nonce desc (higher nonce = created later = most recent first).
  // Bets have no nonce field — keep RPC order (append-only on-chain list).
  const sortedBets     = useMemo(() => [...bets], [bets]);
  const sortedParlays  = useMemo(() => [...parlays].sort((a, b) => (b.nonce > a.nonce ? 1 : -1)), [parlays]);
  const sortedMatchups = useMemo(() => [...allMatchups].sort((a, b) => (b.nonce > a.nonce ? 1 : -1)), [allMatchups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch-fetch market summaries for all bets AND matchups.
  // Use a stable dep key (sorted unique market addresses) to avoid redundant refetches.
  const [marketSummaries, setMarketSummaries] = useState<Record<string, MarketSummary>>({});
  const marketAddrKey = [
    ...new Set([
      ...bets.map((b) => b.market as string),
      ...allMatchups.map((m) => m.market as string),
    ]),
  ].sort().join(",");

  useEffect(() => {
    const uniqueMarkets = marketAddrKey ? marketAddrKey.split(",") : [];
    if (!uniqueMarkets.length || !HELIUS_RPC_URL) return;
    let cancelled = false;
    fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getMultipleAccounts",
        params: [uniqueMarkets, { encoding: "base64" }],
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const summaries: Record<string, MarketSummary> = {};
        (json.result?.value ?? []).forEach((acct: any, i: number) => {
          if (!acct) return;
          try {
            const raw = Uint8Array.from(atob(acct.data[0]), (c) => c.charCodeAt(0));
            const m = deserializeMarketAccount(raw, uniqueMarkets[i] as any);
            summaries[uniqueMarkets[i]] = {
              status: m.status as "Open" | "Settled" | "Closed",
              outcome: m.outcome,
              creator: m.creator as string,
              question: m.question ?? "",
            };
          } catch {}
        });
        setMarketSummaries(summaries);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketAddrKey]);

  const handleClaimBet = async (bet: Bet) => {
    resetClaim();
    setClaimingBet(bet.address as string);
    try {
      await claimWinnings(bet.address as string, bet.market as string);
      setClaimSuccess({
        emoji: "💰",
        title: "You called it!",
        body: "Winnings are on their way to your wallet. Your win rate just went up.",
      });
      cueWin();
    } catch {}
    setClaimingBet(null);
    refreshBets();
  };

  const handleClaimParlay = async (p: Parlay) => {
    try {
      await claimParlay(p);
      setClaimSuccess({
        emoji: "🎊",
        title: "Parlay cashed!",
        body: `You hit all ${p.legs.length} legs. USDC is landing in your wallet now.`,
      });
      cueWin();
    } catch {}
    refreshParlays();
  };
  const { mainnetSol, devnetSol, mainnetUsdc, devnetUsdc, refresh: refreshBalances } = useWalletBalances(walletPubkey);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refreshRep();
    refreshBets();
    refreshBalances();
    // Stop spinner after a short window — individual hooks manage their own loading state
    setTimeout(() => setRefreshing(false), 1_200);
  }, [refreshRep, refreshBets, refreshBalances]);
  const { name: snsName } = useSnsName(walletPubkey);

  // Derive performance stats from local bets + marketSummaries —
  // more accurate than on-chain Reputation PDA which may lag if the
  // record_result instruction wasn't called for every settled bet.
  const settledBets = bets.filter((b) => {
    const ms = marketSummaries[b.market as string];
    return ms && (ms.status === "Settled" || ms.status === "Closed");
  });
  const localWins = settledBets.filter(
    (b) => marketSummaries[b.market as string]?.outcome === b.outcome
  ).length;
  const localLosses = settledBets.filter(
    (b) => marketSummaries[b.market as string]?.outcome !== b.outcome
  ).length;
  const localWinRate = settledBets.length > 0 ? localWins / settledBets.length : 0;

  // Net P&L from bets: claimed win stakes minus lost stakes (stake proxy, not exact payout)
  const betWinAmount = bets
    .filter((b) => b.claimed && marketSummaries[b.market as string]?.outcome === b.outcome)
    .reduce((sum, b) => sum + Number(b.amount) / 1_000_000, 0);
  const betLossAmount = settledBets
    .filter((b) => marketSummaries[b.market as string]?.outcome !== b.outcome)
    .reduce((sum, b) => sum + Number(b.amount) / 1_000_000, 0);
  const betNetPL = betWinAmount - betLossAmount;

  // Parlay performance — include Won/Claimed as wins, Lost/Cancelled as losses
  const settledParlays = parlays.filter(
    (p) => p.status === "Won" || p.status === "Lost" || p.status === "Claimed" || p.status === "Cancelled"
  );
  const parlayWins   = parlays.filter((p) => p.status === "Won" || p.status === "Claimed").length;
  const parlayLosses = parlays.filter((p) => p.status === "Lost" || p.status === "Cancelled").length;
  const parlayLossAmount = parlays
    .filter((p) => p.status === "Lost" || p.status === "Cancelled")
    .reduce((sum, p) => sum + Number(p.stakeUsdc) / 1_000_000, 0);
  const parlayWinAmount = parlays
    .filter((p) => p.status === "Claimed")
    .reduce((sum, p) => sum + Number(p.stakeUsdc) / 1_000_000, 0);

  // Combined stats across bets + parlays
  const totalWins       = localWins + parlayWins;
  const totalLosses     = localLosses + parlayLosses;
  const totalSettled    = settledBets.length + settledParlays.length;
  const combinedWinRate = totalSettled > 0 ? totalWins / totalSettled : 0;
  const netPL           = betNetPL - parlayLossAmount + parlayWinAmount;
  const totalRevenue    = creatorRevenue + netPL;

  // Local streak: walk all settled outcomes from most-recent (bets then parlays in array order)
  const allSettledOutcomes: boolean[] = [
    ...settledBets.map((b) => marketSummaries[b.market as string]?.outcome === b.outcome),
    ...settledParlays.map((p) => p.status === "Won" || p.status === "Claimed"),
  ];
  let localStreak = 0;
  if (allSettledOutcomes.length > 0) {
    const lastWin = allSettledOutcomes[allSettledOutcomes.length - 1];
    for (let i = allSettledOutcomes.length - 1; i >= 0; i--) {
      if (allSettledOutcomes[i] === lastWin) localStreak += lastWin ? 1 : -1;
      else break;
    }
  }

  const handleCopyAddress = async () => {
    if (!walletPubkey) return;
    await Clipboard.setStringAsync(walletPubkey);
    if (Platform.OS === "android") {
      ToastAndroid.show("Address copied", ToastAndroid.SHORT);
    }
  };

  const authAccounts = (privyUser?.linked_accounts as any[] | undefined) ?? [];
  const emailAccount = authAccounts.find((a) => a.type === "email");
  const googleAccount = authAccounts.find((a) => a.type === "google_oauth");
  const authAccount = emailAccount ?? googleAccount;
  const authLabel = authAccount?.type === "google_oauth"
    ? `Google · ${authAccount.email ?? ""}`
    : authAccount?.type === "email"
    ? `Email · ${authAccount.address ?? ""}`
    : null;

  // Safety net: if wallet never becomes available after login, stop spinning
  // and fall through to the connect-wallet UI so the user isn't stuck.
  useEffect(() => {
    if (!isLoggedIn || walletPubkey) return;
    const timer = setTimeout(() => setWalletTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoggedIn, walletPubkey]);

  // Reset timeout flag whenever walletPubkey or login state changes.
  useEffect(() => {
    if (walletPubkey || !isLoggedIn) setWalletTimedOut(false);
  }, [walletPubkey, isLoggedIn]);

  // Derive display values from on-chain Reputation PDA; fall back to zeros for new users.
  const winRate     = reputation ? reputation.winRateBps / 10_000 : 0;
  const streak      = reputation?.currentStreak ?? 0;
  const totalCalls  = reputation?.totalBets ?? 0;
  const badgeTier   = reputation?.badgeTier;

  // Hero derived values — tier drives the gradient/accent; local streak wins
  // over the on-chain one when we have a fresher locally-computed value.
  const effStreak    = localStreak !== 0 ? localStreak : streak;
  const effectiveTier = badgeTier ?? getBadgeTier(combinedWinRate);
  const tierMeta     = BADGE_META[effectiveTier];
  const heroTint     = heroTintFor(effectiveTier);

  if (!walletPubkey) {
    // Logged in via Privy but embedded wallet still initialising — show spinner
    // unless it has been more than 5 s (timed out → fall through to connect UI).
    if (isLoggedIn && !walletTimedOut) {
      return (
        <View style={styles.root}>
          <View style={styles.disconnectedHero}>
            <ActivityIndicator color="#22c55e" size="large" />
            <Text style={[styles.disconnectedSub, { marginTop: 16 }]}>Setting up your wallet…</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.root}>
        <View style={styles.disconnectedHero}>
          <Text style={styles.disconnectedEmoji}>👤</Text>
          <Text style={styles.disconnectedTitle}>
            {isLoggedIn ? "Wallet setup failed" : "Your record lives here"}
          </Text>
          <Text style={styles.disconnectedSub}>
            {isLoggedIn
              ? (walletError ?? "Your embedded wallet couldn't be created. Tap below to retry, or sign out and reconnect.")
              : "Connect a wallet to track your win rate, badge tier, and prediction history."}
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={onConnectWallet}>
            <Text style={styles.connectBtnText}>
              {isLoggedIn ? "Retry wallet setup" : "Connect wallet"}
            </Text>
          </TouchableOpacity>
          {isLoggedIn && onDisconnect && (
            <TouchableOpacity onPress={onDisconnect}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const shortKey = `${walletPubkey.slice(0, 6)}…${walletPubkey.slice(-4)}`;

  return (
  <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#22c55e"
          colors={["#22c55e"]}
        />
      }
    >
      {/* ── Header ──────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Profile</Text>
      </View>

      {/* ── Hero (tier-tinted) ──────────────────── */}
      <LinearGradient
        colors={heroTint.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: heroTint.border }]}
      >
        {onDisconnect && (
          <TouchableOpacity style={styles.discPill} onPress={onDisconnect} activeOpacity={0.7}>
            <Text style={styles.discPillText}>Disconnect</Text>
          </TouchableOpacity>
        )}

        <View style={styles.idRow}>
          <JerseyAvatar pubkey={walletPubkey} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroName} numberOfLines={1}>
              {snsName ?? `@${walletPubkey.slice(0, 5)}…${walletPubkey.slice(-5)}`}
            </Text>
            <View style={[styles.tierPill, { backgroundColor: heroTint.pillBg, borderColor: heroTint.accent + "55" }]}>
              <Text style={styles.tierPillIcon}>{tierMeta.icon}</Text>
              <Text style={[styles.tierPillText, { color: heroTint.accent }]}>{effectiveTier.toUpperCase()} TIER</Text>
            </View>
            <TouchableOpacity style={styles.addrRow} onPress={handleCopyAddress} activeOpacity={0.7}>
              <Text style={styles.addrText}>{shortKey}</Text>
              <Text style={styles.copyIcon}> 📋</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Win-rate focal */}
        {(repLoading || betsLoading) ? (
          <View style={styles.heroLoading}><ActivityIndicator color="#22c55e" /></View>
        ) : (
          <View style={styles.focalRow}>
            <View>
              <Text style={styles.focalWr}>
                {totalSettled > 0 ? Math.round(combinedWinRate * 100) : "—"}
                {totalSettled > 0 ? <Text style={styles.focalPct}>%</Text> : null}
              </Text>
              <Text style={styles.focalLabel}>WIN RATE · {totalSettled} CALLS</Text>
            </View>
            {effStreak !== 0 && (
              <View style={styles.streakChip}>
                <Text style={[styles.streakChipText, { color: streakColor(effStreak) }]}>
                  {streakLabel(effStreak)}
                </Text>
              </View>
            )}
            {authLabel ? <Text style={styles.authInline} numberOfLines={1}>{authLabel}</Text> : null}
          </View>
        )}

        {/* Social row — placeholders until the off-chain follow graph lands */}
        <View style={styles.socialRow}>
          <View style={styles.socialCount}>
            <Text style={styles.socialNum}>—</Text>
            <Text style={styles.socialLbl}>Followers</Text>
          </View>
          <View style={styles.socialCount}>
            <Text style={styles.socialNum}>—</Text>
            <Text style={styles.socialLbl}>Following</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleCopyAddress} activeOpacity={0.85}>
            <Text style={styles.shareBtnText}>↗ Share</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Record strip ────────────────────────── */}
      <Text style={styles.stripLabel}>RECORD</Text>
      <View style={styles.tileGrid}>
        <StatTile value={String(totalWins)} label="Wins" color="#22c55e" />
        <StatTile value={String(totalLosses)} label="Losses" color={totalLosses > 0 ? "#ef4444" : undefined} />
        <StatTile value={String(bets.length + parlays.length)} label="Total calls" />
        <StatTile
          value={`${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}`}
          label="Net P&L"
          sub="USDC stake"
          color={netPL >= 0 ? "#22c55e" : "#ef4444"}
        />
        <StatTile
          value={creatorRevenue > 0 ? `+$${creatorRevenue.toFixed(2)}` : "$0.00"}
          label="Creator fees"
          sub="USDC est."
          color="#f59e0b"
        />
        <StatTile value="—" label="Terrace Points" sub="soon" color="#a78bfa" />
      </View>

      {/* ── Wallet ──────────────────────────────── */}
      <Text style={styles.stripLabel}>WALLET</Text>
      <View style={styles.walletCard}>
        <View style={styles.walletLine}>
          <View style={styles.walletNetWrap}>
            <Image source={{ uri: "https://cryptologos.cc/logos/solana-sol-logo.png" }} style={styles.coinLogo} />
            <Text style={styles.walletNet}>Mainnet</Text>
          </View>
          <View style={styles.walletVals}>
            <Text style={styles.walletSol}>{mainnetSol !== null ? `${mainnetSol.toFixed(3)} SOL` : "— SOL"}</Text>
            <Text style={styles.walletUsdc}>{mainnetUsdc !== null ? `$${mainnetUsdc.toFixed(2)}` : "—"}</Text>
          </View>
        </View>
        <View style={[styles.walletLine, styles.walletLineBorder]}>
          <View style={styles.walletNetWrap}>
            <Text style={[styles.walletNet, styles.walletNetMuted]}>Devnet</Text>
          </View>
          <View style={styles.walletVals}>
            <Text style={styles.walletMuted}>{devnetSol !== null ? `${devnetSol.toFixed(3)} SOL` : "— SOL"}</Text>
            <Text style={styles.walletMuted}>{devnetUsdc !== null ? `$${devnetUsdc.toFixed(2)}` : "—"}</Text>
          </View>
        </View>
      </View>

      {/* ── Active / History / Created tabs ─────── */}
      <View style={styles.tabSection}>
        <View style={styles.tabBar}>
          {(["Active", "History", "Created", "Leagues"] as HistoryTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => { setTab(t); setPositionFilter("All"); }}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Position list */}
        {tab === "Leagues" ? (
          <LeaguesTab walletPubkey={walletPubkey} onOpen={() => onNavigateLeague?.()} />
        ) : tab === "Created" ? (
          <CreatedMarketsList walletPubkey={walletPubkey} onTotalRevenue={setCreatorRevenue} />
        ) : (betsLoading || loadingParlays) ? (
          <View style={styles.stubPositions}>
            <ActivityIndicator color="#22c55e" />
          </View>
        ) : tab === "Active" ? (() => {
          const activeBets     = sortedBets.filter((b) => {
            if (b.claimed) return false;
            const ms = marketSummaries[b.market as string];
            if (!ms) return true;
            if (ms.status === "Open") return true;
            return ms.outcome !== null && ms.outcome !== undefined && ms.outcome === b.outcome;
          });
          const activeParlays  = sortedParlays.filter((p) => p.status === "Open" || p.status === "Won");
          const activeMatchups = sortedMatchups.filter((m) => m.status === "Pending" || m.status === "Accepted");
          return (
            <>
              <FilterChips
                filter={positionFilter}
                onChange={setPositionFilter}
                counts={{ bets: activeBets.length, parlays: activeParlays.length, matchups: activeMatchups.length }}
              />
              <ActivePositions
                bets={positionFilter === "All" || positionFilter === "Bets" ? activeBets : []}
                parlays={positionFilter === "All" || positionFilter === "Parlays" ? activeParlays : []}
                matchups={positionFilter === "All" || positionFilter === "Matchups" ? activeMatchups : []}
                walletPubkey={walletPubkey}
                marketSummaries={marketSummaries}
                onSettleParlay={settleParlay}
                onClaimParlay={handleClaimParlay}
                onClaimBet={handleClaimBet}
                claimingBet={claimingBet}
                claimError={claimWinError}
              />
            </>
          );
        })() : (() => {
          const historyBets     = sortedBets.filter((b) => {
            if (b.claimed || b.resultRecorded) return true;
            const ms = marketSummaries[b.market as string];
            if (!ms) return false;
            return ms.status === "Settled" && ms.outcome !== null && ms.outcome !== b.outcome;
          });
          const historyParlays  = sortedParlays.filter((p) => p.status === "Won" || p.status === "Lost" || p.status === "Claimed" || p.status === "Cancelled");
          const historyMatchups = sortedMatchups.filter((m) => m.status === "Settled" || m.status === "Declined");
          return (
            <>
              <FilterChips
                filter={positionFilter}
                onChange={setPositionFilter}
                counts={{ bets: historyBets.length, parlays: historyParlays.length, matchups: historyMatchups.length }}
                includeLeagues
              />
              {positionFilter === "Leagues" ? (
                <HistoryLeaguesList
                  walletPubkey={walletPubkey}
                  onOpen={() => onNavigateLeague?.()}
                />
              ) : (
              <HistoryPositions
                bets={positionFilter === "All" || positionFilter === "Bets" ? historyBets : []}
                parlays={positionFilter === "All" || positionFilter === "Parlays" ? historyParlays : []}
                matchups={positionFilter === "All" || positionFilter === "Matchups" ? historyMatchups : []}
                walletPubkey={walletPubkey}
                marketSummaries={marketSummaries}
              />
              )}
            </>
          );
        })()}
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>

    {/* ── Claim success overlay ────────────────── */}
    {claimSuccess && (
      <View style={styles.claimOverlay}>
        <TouchableOpacity style={styles.claimBackdrop} activeOpacity={1} onPress={() => setClaimSuccess(null)} />
        <Confetti trigger={claimSuccess} />
        <View style={styles.claimCard}>
          <Text style={styles.claimEmoji}>{claimSuccess.emoji}</Text>
          <Text style={styles.claimTitle}>{claimSuccess.title}</Text>
          <Text style={styles.claimBody}>{claimSuccess.body}</Text>
          <View style={styles.claimStatRow}>
            <Text style={styles.claimStatLabel}>Win rate</Text>
            <Text style={styles.claimStatValue}>{Math.round(combinedWinRate * 100)}%</Text>
            <Text style={styles.claimStatSep}>·</Text>
            <Text style={styles.claimStatLabel}>Streak</Text>
            <Text style={[styles.claimStatValue, { color: streakColor(localStreak !== 0 ? localStreak : streak) }]}>
              {streakLabel(localStreak !== 0 ? localStreak : streak)}
            </Text>
          </View>
          <TouchableOpacity style={styles.claimDismissBtn} onPress={() => setClaimSuccess(null)}>
            <Text style={styles.claimDismissBtnText}>Keep it up</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
  </View>
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
  signOutText:       { fontSize: 13, color: "#6b7280", marginTop: 12, textDecorationLine: "underline" },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: "#fff" },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: "#111", borderRadius: 16, marginHorizontal: 18, marginBottom: 8 },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1d4ed8", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 22, fontWeight: "700", color: "#fff" },
  identityMeta:  { flex: 1 },
  username:      { fontSize: 15, fontWeight: "600", color: "#fff" },
  addressRow:    { flexDirection: "row", alignItems: "center", marginTop: 2 },
  address:       { fontSize: 12, color: "#9ca3af", fontFamily: "monospace" },
  copyIcon:      { fontSize: 11, color: "#4b5563" },
  authLabel:     { fontSize: 11, color: "#6b7280", marginTop: 4 },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  connectedDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  connectedText:  { fontSize: 11, color: "#22c55e", fontWeight: "600" },
  disconnectBtn:  { backgroundColor: "#1a1a1a", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: "#ef4444" },
  disconnectBtnText: { fontSize: 12, fontWeight: "600", color: "#ef4444" },

  // Balance grid (mainnet + devnet)
  balanceCard:      { backgroundColor: "#111", borderRadius: 16, marginHorizontal: 18, marginBottom: 12, overflow: "hidden" },
  balanceHeaderRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  balanceColHeader: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  balanceColLabel:  { fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  coinLogo:         { width: 13, height: 13, borderRadius: 7 },
  balanceDivider:   { width: 0.5, backgroundColor: "#1e1e1e", marginVertical: 2, alignSelf: "stretch" },
  balanceNetRow:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  balanceNetLabel:  { width: 58, fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.4 },
  balanceNetValue:  { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "700", color: "#f9fafb" },

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

  // ── Revamp: hero, record strip, wallet ──
  hero: { marginHorizontal: 18, marginBottom: 4, borderRadius: 20, borderWidth: 0.5, padding: 16 },
  discPill: { position: "absolute", top: 14, right: 14, backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#2a2a2a", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, zIndex: 5 },
  discPillText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  idRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroName: { fontSize: 17, fontWeight: "700", color: "#f9fafb" },
  tierPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5, borderWidth: 0.5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tierPillIcon: { fontSize: 10 },
  tierPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  addrRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  addrText: { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  heroLoading: { height: 74, alignItems: "flex-start", justifyContent: "center" },
  focalRow: { flexDirection: "row", alignItems: "flex-end", gap: 16, marginTop: 16 },
  focalWr: { fontSize: 44, fontWeight: "900", letterSpacing: -1.5, color: "#f9fafb", lineHeight: 46 },
  focalPct: { fontSize: 16, fontWeight: "800", color: "#4ade80" },
  focalLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: "#6b7280", marginTop: 6 },
  streakChip: { backgroundColor: "#1a1206", borderWidth: 0.5, borderColor: "#78350f", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6, marginBottom: 4 },
  streakChipText: { fontSize: 13, fontWeight: "800" },
  authInline: { flex: 1, textAlign: "right", fontSize: 11, color: "#6b7280", marginBottom: 6 },
  socialRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  socialCount: { flex: 1, backgroundColor: "#0d0d0d", borderWidth: 0.5, borderColor: "#1f1f1f", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  socialNum: { fontSize: 15, fontWeight: "800", color: "#f9fafb" },
  socialLbl: { fontSize: 10, color: "#6b7280", marginTop: 1 },
  shareBtn: { backgroundColor: "#22c55e", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  shareBtnText: { fontSize: 12, fontWeight: "800", color: "#000" },

  stripLabel: { fontSize: 10, fontWeight: "700", color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginHorizontal: 22, marginTop: 18, marginBottom: 8 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 18 },
  tile: { width: "31.6%", backgroundColor: "#111", borderWidth: 0.5, borderColor: "#1e1e1e", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 },
  tileValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: "#f9fafb" },
  tileLabel: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  tileSub: { fontSize: 9, color: "#4b5563", marginTop: 1 },

  walletCard: { backgroundColor: "#111", borderWidth: 0.5, borderColor: "#1e1e1e", borderRadius: 16, marginHorizontal: 18, paddingHorizontal: 14 },
  walletLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11 },
  walletLineBorder: { borderTopWidth: 0.5, borderTopColor: "#1a1a1a" },
  walletNetWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  walletNet: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  walletNetMuted: { color: "#4b5563" },
  walletVals: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletSol: { fontSize: 13, fontWeight: "700", color: "#f9fafb", fontVariant: ["tabular-nums"] },
  walletUsdc: { fontSize: 13, fontWeight: "700", color: "#22c55e", fontVariant: ["tabular-nums"] },
  walletMuted: { fontSize: 13, fontWeight: "600", color: "#6b7280", fontVariant: ["tabular-nums"] },

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

  // Claim success overlay
  claimOverlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  claimBackdrop:   { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)" },
  claimCard:       { backgroundColor: "#111", borderRadius: 24, padding: 28, marginHorizontal: 24, alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#22c55e", zIndex: 1 },
  claimEmoji:      { fontSize: 52, marginBottom: 4 },
  claimTitle:      { fontSize: 24, fontWeight: "800", color: "#4ade80", textAlign: "center" },
  claimBody:       { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  claimStatRow:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0a0a0a", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  claimStatLabel:  { fontSize: 11, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.4 },
  claimStatValue:  { fontSize: 14, fontWeight: "700", color: "#f9fafb" },
  claimStatSep:    { fontSize: 12, color: "#1e1e1e" },
  claimDismissBtn: { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 4 },
  claimDismissBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },
});

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ToastAndroid,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import type { BadgeTier, Bet, Parlay } from "@terrace/sdk";
import { deserializeMarketAccount } from "@terrace/sdk";
import { useReputation } from "../hooks/useReputation";
import { useBets } from "../hooks/useBets";
import { useParlay } from "../hooks/useParlay";
import { useWalletBalances } from "../hooks/useWalletBalances";
import { useSnsName } from "../hooks/useSnsName";
import { useCreatedMarkets, type CreatedMarket } from "../hooks/useCreatedMarkets";
import { useSettleMarket } from "../hooks/useSettleMarket";
import { useClaimWinnings } from "../hooks/useClaimWinnings";

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

function ActivePositions({
  bets,
  parlays,
  marketSummaries,
  onSettleParlay,
  onClaimParlay,
  onClaimBet,
  claimingBet,
  claimError,
}: {
  bets: Bet[];
  parlays: Parlay[];
  marketSummaries: Record<string, MarketSummary>;
  onSettleParlay: (p: Parlay) => void;
  onClaimParlay: (p: Parlay) => void;
  onClaimBet: (bet: Bet) => void;
  claimingBet: string | null;
  claimError: string | null;
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
    </View>
  );
}

function HistoryPositions({
  bets,
  parlays,
  marketSummaries,
}: {
  bets: Bet[];
  parlays: Parlay[];
  marketSummaries: Record<string, MarketSummary>;
}) {
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
      {bets.map((b) => (
        <BetRow
          key={b.address}
          bet={b}
          marketSummary={marketSummaries[b.market as string]}
        />
      ))}
      {parlays.map((p) => <ParlayRow key={p.address} parlay={p} />)}
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
}: {
  market: CreatedMarket;
  onSettle: (outcome: 0 | 1) => void;
  settling: boolean;
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

      {market.status === "Open" && (
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
  const [settlingAddr, setSettlingAddr] = useState<string | null>(null);

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
  yesBtn: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  noBtn:  { backgroundColor: "#3b0a0a", borderColor: "#ef4444" },
  btnDisabled: { opacity: 0.5 },
  settleBtnText: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  revenueRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  revenueLabel:  { fontSize: 11, color: "#6b7280" },
  revenueValue:  { fontSize: 11, color: "#f59e0b", fontWeight: "600" },
});

// ---------------------------------------------------------------------------
// Profile screen
// ---------------------------------------------------------------------------

type HistoryTab = "Active" | "History" | "Created";

interface Props {
  walletPubkey: string | null;
  isLoggedIn?: boolean;
  walletError?: string | null;
  privyUser?: any;
  onConnectWallet: () => void;
  onDisconnect?: () => void;
}

export function ProfileScreen({ walletPubkey, isLoggedIn, walletError, privyUser, onConnectWallet, onDisconnect }: Props) {
  const [tab, setTab] = useState<HistoryTab>("Active");
  const [walletTimedOut, setWalletTimedOut] = useState(false);
  const [creatorRevenue, setCreatorRevenue] = useState<number>(0);
  const { reputation, loading: repLoading } = useReputation(walletPubkey);
  const { bets, loading: betsLoading, refresh: refreshBets } = useBets(walletPubkey);
  const { parlays, loadingParlays, settleParlay, claimParlay } = useParlay();
  const { claim: claimWinnings, error: claimWinError, reset: resetClaim } = useClaimWinnings();
  const [claimingBet, setClaimingBet] = useState<string | null>(null);

  // Batch-fetch market summaries for all bets so we know if each bet won.
  // Use a stable dep key (sorted unique market addresses) to avoid redundant refetches.
  const [marketSummaries, setMarketSummaries] = useState<Record<string, MarketSummary>>({});
  const marketAddrKey = [...new Set(bets.map((b) => b.market as string))].sort().join(",");

  useEffect(() => {
    const uniqueMarkets = [...new Set(bets.map((b) => b.market as string))];
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
    await claimWinnings(bet.address as string, bet.market as string);
    setClaimingBet(null);
    refreshBets();
  };
  const { mainnetSol, devnetSol, mainnetUsdc, devnetUsdc } = useWalletBalances(walletPubkey);
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
  const totalRevenue = creatorRevenue + betNetPL;

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
  const initial = walletPubkey.slice(0, 1).toUpperCase();

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* ── Header ──────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Profile</Text>
      </View>

      {/* ── Identity ────────────────────────────── */}
      <View style={styles.identityRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.identityMeta}>
          <Text style={styles.username} numberOfLines={1}>
            {snsName ?? `@${walletPubkey.slice(0, 5)}....${walletPubkey.slice(-5)}`}
          </Text>
          <TouchableOpacity style={styles.addressRow} onPress={handleCopyAddress} activeOpacity={0.7}>
            <Text style={styles.address}>{shortKey}</Text>
            <Text style={styles.copyIcon}>  📋</Text>
          </TouchableOpacity>
          {authLabel ? (
            <Text style={styles.authLabel} numberOfLines={1}>{authLabel}</Text>
          ) : (
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          )}
        </View>
        {onDisconnect && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={onDisconnect}>
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Balances ────────────────────────────── */}
      <View style={styles.balanceCard}>
        {/* Header row */}
        <View style={styles.balanceHeaderRow}>
          <View style={{ flex: 1 }} />
          <View style={styles.balanceColHeader}>
            <Image source={{ uri: "https://cryptologos.cc/logos/solana-sol-logo.png" }} style={styles.coinLogo} />
            <Text style={styles.balanceColLabel}>SOL</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceColHeader}>
            <Image source={{ uri: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png" }} style={styles.coinLogo} />
            <Text style={styles.balanceColLabel}>USDC</Text>
          </View>
        </View>
        {/* Mainnet row */}
        <View style={styles.balanceNetRow}>
          <Text style={styles.balanceNetLabel}>Mainnet</Text>
          <Text style={styles.balanceNetValue}>
            {mainnetSol !== null ? mainnetSol.toFixed(4) : "—"}
          </Text>
          <View style={styles.balanceDivider} />
          <Text style={styles.balanceNetValue}>
            {mainnetUsdc !== null ? `$${mainnetUsdc.toFixed(2)}` : "—"}
          </Text>
        </View>
        {/* Devnet row */}
        <View style={[styles.balanceNetRow, { borderTopWidth: 0.5, borderTopColor: "#1a1a1a" }]}>
          <Text style={styles.balanceNetLabel}>Devnet</Text>
          <Text style={styles.balanceNetValue}>
            {devnetSol !== null ? devnetSol.toFixed(4) : "—"}
          </Text>
          <View style={styles.balanceDivider} />
          <Text style={styles.balanceNetValue}>
            {devnetUsdc !== null ? `$${devnetUsdc.toFixed(2)}` : "—"}
          </Text>
        </View>
      </View>

      {/* ── Reputation bar ──────────────────────── */}
      {(repLoading || betsLoading) ? (
        <View style={styles.repLoadingBox}>
          <ActivityIndicator color="#22c55e" />
        </View>
      ) : (
        <RepBar
          winRate={localWinRate}
          streak={streak}
          totalCalls={settledBets.length}
          badgeTier={badgeTier}
        />
      )}

      {/* ── Performance stats ───────────────────── */}
      <View style={styles.perfSection}>
        <Text style={styles.sectionLabel}>PERFORMANCE</Text>
        <View style={styles.perfRow}>
          <StatCell label="Wins" value={String(localWins)} />
          <StatCell label="Losses" value={String(localLosses)} valueColor={localLosses > 0 ? "#ef4444" : undefined} />
          <StatCell label="Total" value={String(bets.length)} />
          <StatCell
            label="Win rate"
            value={settledBets.length > 0 ? `${Math.round(localWinRate * 100)}%` : "—"}
            valueColor="#22c55e"
          />
        </View>
        <View style={[styles.perfRow, { marginTop: 8 }]}>
          <StatCell
            label="Creator fees"
            value={creatorRevenue > 0 ? `+$${creatorRevenue.toFixed(2)}` : "$0.00"}
            valueColor="#f59e0b"
            sub="USDC (est.)"
          />
          <StatCell
            label="Net bet P&L"
            value={`${betNetPL >= 0 ? "+" : ""}$${betNetPL.toFixed(2)}`}
            valueColor={betNetPL >= 0 ? "#22c55e" : "#ef4444"}
            sub="USDC (stake)"
          />
        </View>
      </View>

      {/* ── Active / History / Created tabs ─────── */}
      <View style={styles.tabSection}>
        <View style={styles.tabBar}>
          {(["Active", "History", "Created"] as HistoryTab[]).map((t) => (
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
        {tab === "Created" ? (
          <CreatedMarketsList walletPubkey={walletPubkey} onTotalRevenue={setCreatorRevenue} />
        ) : (betsLoading || loadingParlays) ? (
          <View style={styles.stubPositions}>
            <ActivityIndicator color="#22c55e" />
          </View>
        ) : tab === "Active" ? (
          <ActivePositions
            bets={bets.filter((b) => {
              if (b.claimed) return false;
              const ms = marketSummaries[b.market as string];
              // Market not yet loaded → optimistically show (avoids flicker)
              if (!ms) return true;
              // Open market → definitely active
              if (ms.status === "Open") return true;
              // Settled market → only show if this bet WON (claim button needed)
              return ms.outcome !== null && ms.outcome !== undefined && ms.outcome === b.outcome;
            })}
            parlays={parlays.filter((p) => p.status === "Open" || p.status === "Won")}
            marketSummaries={marketSummaries}
            onSettleParlay={settleParlay}
            onClaimParlay={claimParlay}
            onClaimBet={handleClaimBet}
            claimingBet={claimingBet}
            claimError={claimWinError}
          />
        ) : (
          <HistoryPositions
            bets={bets.filter((b) => {
              if (b.claimed || b.resultRecorded) return true;
              const ms = marketSummaries[b.market as string];
              if (!ms) return false;
              // Settled + lost = goes to History
              return ms.status === "Settled" && ms.outcome !== null && ms.outcome !== b.outcome;
            })}
            parlays={parlays.filter((p) => p.status === "Won" || p.status === "Lost" || p.status === "Claimed" || p.status === "Cancelled")}
            marketSummaries={marketSummaries}
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
  signOutText:       { fontSize: 13, color: "#6b7280", marginTop: 12, textDecorationLine: "underline" },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: "#fff" },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: "#111", borderRadius: 16, marginHorizontal: 18, marginBottom: 8 },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1d4ed8", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#fff" },
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

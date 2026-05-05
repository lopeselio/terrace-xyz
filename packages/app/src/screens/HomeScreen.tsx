import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMarkets } from "../hooks/useMarkets";
import { usePlaceBet } from "../hooks/usePlaceBet";
import { useLeaderboard, avatarColorFromPubkey, type SharpEntry } from "../hooks/useLeaderboard";
import { groupMarkets } from "../utils/groupMarkets";
import { MatchGroupCard } from "./MatchGroupCard";
import { BetSheet } from "./BetSheet";
import type { UnifiedMarket } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// Feature cards (horizontal scroll) — stub navigation for now
// ---------------------------------------------------------------------------
const FEATURE_CARDS = [
  { emoji: "⚽", title: "Matchups",      sub: "Settle group chat bets",   colors: ["#064e3b", "#16a34a"] as const },
  { emoji: "🏆", title: "Parlays",       sub: "Chain your convictions",   colors: ["#1e3a5f", "#3b82f6"] as const },
  { emoji: "⚡", title: "Flash markets", sub: "In-match, high urgency",   colors: ["#2d1b69", "#7c3aed"] as const },
  { emoji: "📊", title: "Leagues",       sub: "FPL meets prediction",     colors: ["#7c2d12", "#ea580c"] as const },
];

// Thumbnail colour palette — cycles by market index
const THUMB_COLORS = ["#064e3b", "#1e3a5f", "#7f1d1d", "#2d1b69"];
const THUMB_EMOJIS = ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "⚽", "🔴", "🟣"];

const TRENDING_TABS = ["Markets", "Leagues", "Sharps"] as const;
type TrendingTab = (typeof TRENDING_TABS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryLabel(m: UnifiedMarket): string {
  if (m.source === "native") return "Permissionless · Fan created";
  // Try to read something meaningful from the question — e.g. "Will Arsenal…" → "Sports · Prediction market"
  const q = m.question.toLowerCase();
  if (q.includes("premier league") || q.includes("epl"))  return "Premier League · Match result";
  if (q.includes("champions league") || q.includes("ucl")) return "Champions League · Match result";
  if (q.includes("la liga"))  return "La Liga · Match result";
  if (q.includes("world cup")) return "FIFA World Cup · Match result";
  return "Sports · Prediction market";
}

function formatUsdc(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureCardRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.featureRow}
    >
      {FEATURE_CARDS.map((card) => (
        <TouchableOpacity key={card.title} activeOpacity={0.8}>
          <LinearGradient colors={card.colors} style={styles.featureCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={styles.featureEmoji}>{card.emoji}</Text>
            <View>
              <Text style={styles.featureTitle}>{card.title}</Text>
              <Text style={styles.featureSub}>{card.sub}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

interface MarketRowProps {
  market: UnifiedMarket;
  index: number;
  onPress: (id: string) => void;
}

function MarketRow({ market, index, onPress }: MarketRowProps) {
  const thumbColor = THUMB_COLORS[index % THUMB_COLORS.length];
  const thumbEmoji = THUMB_EMOJIS[index % THUMB_EMOJIS.length];
  const label = categoryLabel(market);
  const isLive = market.status === "Open";

  return (
    <View>
      <TouchableOpacity style={styles.marketRow} onPress={() => onPress(market.id)} activeOpacity={0.7}>
        {/* Thumbnail */}
        <View style={[styles.marketThumb, { backgroundColor: thumbColor }]}>
          <Text style={styles.marketThumbEmoji}>{thumbEmoji}</Text>
        </View>

        {/* Info */}
        <View style={styles.marketInfo}>
          <Text style={styles.marketName} numberOfLines={1}>{market.question}</Text>
          <Text style={styles.marketLeague}>{label}</Text>

          {/* Tags */}
          <View style={styles.tagsRow}>
            <View style={styles.tagCoin}>
              <Text style={styles.tagText}>⊙ $0.10</Text>
            </View>
            {market.totalVolumeUsdc > 0 && (
              <View style={styles.tagPrize}>
                <Text style={styles.tagTextGreen}>🏆 {formatUsdc(market.totalVolumeUsdc)}</Text>
              </View>
            )}
            {isLive && (
              <View style={styles.tagLive}>
                <Text style={styles.tagTextRed}>● Live</Text>
              </View>
            )}
            {market.source === "native" && (
              <View style={styles.tagFlash}>
                <Text style={styles.tagTextOrange}>⚡ Native</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.marketArrow}>›</Text>
      </TouchableOpacity>

      {/* Creator pill row — shown for native markets with known creator, stub for Jupiter */}
      {market.source === "native" && (
        <View style={styles.creatorRow}>
          <View style={styles.creatorPill}>
            <View style={[styles.creatorAvatar, styles.avatarGreen]}>
              <Text style={styles.creatorInitial}>C</Text>
            </View>
            <Text style={styles.creatorName}>creator</Text>
            <Text style={styles.creatorWinRate}>-- W</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function LeaguesTab() {
  return (
    <View style={styles.comingSoon}>
      <Text style={styles.comingSoonEmoji}>🏆</Text>
      <Text style={styles.comingSoonTitle}>Leagues coming soon</Text>
      <Text style={styles.comingSoonSub}>Create a private league with mates, compete each gameweek</Text>
    </View>
  );
}

const BADGE_EMOJI: Record<SharpEntry["badge"], string> = {
  Legend: "👑",
  Sharp:  "⚡",
  Casual: "🎯",
};

const PERIOD_LABELS = [
  { key: "weekly"  as const, label: "This week" },
  { key: "daily"   as const, label: "Today"     },
  { key: "alltime" as const, label: "All time"  },
];

interface SharpRowProps {
  entry: SharpEntry;
  walletPubkey: string | null;
  onFollow: () => void;
}

function SharpRow({ entry, walletPubkey, onFollow }: SharpRowProps) {
  const avatarBg = avatarColorFromPubkey(entry.pubkey);
  const pnlSign = (entry.pnlUsdc ?? 0) >= 0;
  return (
    <View style={styles.sharpRow}>
      <Text style={styles.sharpRank}>#{entry.rank}</Text>

      <View style={[styles.sharpAvatar, { backgroundColor: avatarBg }]}>
        <Text style={styles.sharpAvatarText}>{entry.pubkey.slice(0, 1).toUpperCase()}</Text>
      </View>

      <View style={styles.sharpInfo}>
        <View style={styles.sharpNameRow}>
          <Text style={styles.sharpBadge}>{BADGE_EMOJI[entry.badge]}</Text>
          <Text style={styles.sharpName}>{entry.displayName}</Text>
        </View>
        <View style={styles.sharpStats}>
          {entry.winRate !== null && (
            <Text style={styles.sharpWinRate}>{Math.round(entry.winRate * 100)}% W</Text>
          )}
          {entry.pnlUsdc !== null && (
            <Text style={[styles.sharpPnl, pnlSign ? styles.pnlPos : styles.pnlNeg]}>
              {pnlSign ? "+" : ""}${Math.abs(entry.pnlUsdc).toFixed(0)}
            </Text>
          )}
        </View>
      </View>

      {walletPubkey && entry.pubkey !== walletPubkey && (
        <TouchableOpacity
          style={[styles.followBtn, entry.isFollowing && styles.followBtnActive]}
          onPress={onFollow}
          activeOpacity={0.75}
        >
          <Text style={[styles.followBtnText, entry.isFollowing && styles.followBtnTextActive]}>
            {entry.isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface SharpsTabProps { walletPubkey: string | null }

function SharpsTab({ walletPubkey }: SharpsTabProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "alltime">("weekly");
  const { entries, loading, error, toggleFollow } = useLeaderboard(period);

  return (
    <View>
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIOD_LABELS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={[styles.periodBtn, period === key && styles.periodBtnActive]}
            onPress={() => setPeriod(key)}
          >
            <Text style={[styles.periodBtnText, period === key && styles.periodBtnTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#22c55e" style={{ paddingVertical: 40 }} />
      ) : error || entries.length === 0 ? (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonEmoji}>⚡</Text>
          <Text style={styles.comingSoonTitle}>No leaderboard data</Text>
          <Text style={styles.comingSoonSub}>Check back after more markets settle</Text>
        </View>
      ) : (
        entries.slice(0, 25).map((entry) => (
          <SharpRow
            key={entry.pubkey}
            entry={entry}
            walletPubkey={walletPubkey}
            onFollow={() => toggleFollow(entry.pubkey, walletPubkey)}
          />
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

interface Props {
  /** Public key of connected wallet, null if not connected */
  walletPubkey: string | null;
  winRate: number | null;
  onSelectMarket: (id: string) => void;
}

interface SelectedBet {
  marketId: string;
  label: string;
  yesPrice: number | null;
}

export function HomeScreen({ walletPubkey, winRate, onSelectMarket }: Props) {
  const { markets, loading } = useMarkets();
  const [activeTab, setActiveTab] = useState<TrendingTab>("Markets");
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  const { status, txSignature, error, placeBet, reset } = usePlaceBet();

  const repLabel = winRate !== null
    ? `${Math.round(winRate * 100)}% W`
    : walletPubkey ? "-- W" : null;

  const handleSelectOutcome = (marketId: string, label: string, yesPrice: number | null) => {
    reset();
    setSelectedBet({ marketId, label, yesPrice });
  };

  const handleDismissBet = () => {
    reset();
    setSelectedBet(null);
  };

  const handleConfirmBet = async (amountUsdc: number) => {
    if (!selectedBet) return;
    await placeBet({ marketId: selectedBet.marketId, isYes: true, amountUsdc });
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* ── Top nav ─────────────────────────────────────────── */}
      <View style={styles.topNav}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>T</Text>
            <View style={styles.logoDot} />
          </View>
          <Text style={styles.logoName}>Terrace</Text>
        </View>
        <View style={styles.navRight}>
          <View style={styles.navIconBtn}>
            <Text>🔔</Text>
          </View>
          {repLabel && (
            <View style={styles.repBadge}>
              <Text style={styles.repBadgeText}>{repLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Hero ────────────────────────────────────────────── */}
      <Text style={styles.heroLabel}>Back your take.</Text>

      {/* ── Feature cards ───────────────────────────────────── */}
      <FeatureCardRow />

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      {/* ── Trending section ────────────────────────────────── */}
      <View style={styles.section}>
        {/* Header + tabs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending</Text>
          <View style={styles.tabRow}>
            {TRENDING_TABS.map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab ? styles.tabActive : styles.tabInactive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab ? styles.tabTextActive : styles.tabTextInactive]}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tab content */}
        {activeTab === "Markets" && (
          loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#22c55e" />
            </View>
          ) : markets.length === 0 ? (
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonTitle}>No markets yet</Text>
            </View>
          ) : (
            groupMarkets(markets).map((item, i) =>
              item.type === "grouped" ? (
                <MatchGroupCard
                  key={item.eventId}
                  match={item}
                  onSelectOutcome={handleSelectOutcome}
                />
              ) : (
                <MarketRow
                  key={item.market.id}
                  market={item.market}
                  index={i}
                  onPress={onSelectMarket}
                />
              )
            )
          )
        )}
        {activeTab === "Leagues" && <LeaguesTab />}
        {activeTab === "Sharps"  && <SharpsTab walletPubkey={walletPubkey} />}

        {/* Spacer so last row clears bottom nav */}
        <View style={{ height: 80 }} />
      </View>
    </ScrollView>

    {/* Bet sheet — absolute overlay above the scroll list */}
    {selectedBet && (
      <View style={styles.betOverlay}>
        <Pressable style={styles.betBackdrop} onPress={handleDismissBet} />
        <BetSheet
          marketId={selectedBet.marketId}
          outcomeLabel={selectedBet.label}
          yesPrice={selectedBet.yesPrice}
          onConfirm={handleConfirmBet}
          onDismiss={handleDismissBet}
          status={status}
          txSignature={txSignature}
          error={error}
        />
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

  // Top nav
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  logoRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark:  { width: 32, height: 32, backgroundColor: "#111", borderWidth: 1, borderColor: "#333", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  logoLetter:{ fontSize: 14, fontWeight: "700", color: "#fff" },
  logoDot:   { width: 7, height: 7, backgroundColor: "#22c55e", borderRadius: 4, position: "absolute", bottom: 4, right: 4 },
  logoName:  { fontSize: 17, fontWeight: "600", color: "#fff", letterSpacing: -0.3 },
  navRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  navIconBtn:{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  repBadge:  { backgroundColor: "#22c55e", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  repBadgeText: { fontSize: 10, fontWeight: "700", color: "#000", letterSpacing: 0.3 },

  // Hero
  heroLabel: { fontSize: 22, fontWeight: "600", color: "#fff", paddingHorizontal: 18, paddingBottom: 12, letterSpacing: -0.3 },

  // Feature cards
  featureRow: { paddingHorizontal: 18, gap: 10, paddingBottom: 4 },
  featureCard: { width: 148, height: 120, borderRadius: 16, padding: 12, justifyContent: "flex-end", overflow: "hidden" },
  featureEmoji: { position: "absolute", top: 10, right: 10, fontSize: 26 },
  featureTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  featureSub:   { fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 1 },

  // Dots
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 5, paddingVertical: 14 },
  dot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: "#333" },
  dotActive: { width: 14, backgroundColor: "#22c55e" },

  // Section
  section:       { backgroundColor: "#111", borderTopLeftRadius: 20, borderTopRightRadius: 20, flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  sectionTitle:  { fontSize: 18, fontWeight: "600", color: "#fff" },
  tabRow: { flexDirection: "row", gap: 6 },
  tab:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  tabActive:   { backgroundColor: "#22c55e" },
  tabInactive: { backgroundColor: "#1e1e1e" },
  tabText:         { fontSize: 11, fontWeight: "500" },
  tabTextActive:   { color: "#000" },
  tabTextInactive: { color: "#aaa" },

  // Market row
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  marketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1e1e1e",
  },
  marketThumb:     { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  marketThumbEmoji:{ fontSize: 22 },
  marketInfo:      { flex: 1, minWidth: 0 },
  marketName:      { fontSize: 13, fontWeight: "600", color: "#fff" },
  marketLeague:    { fontSize: 10, color: "#888", marginTop: 1 },
  tagsRow:         { flexDirection: "row", gap: 5, marginTop: 5, flexWrap: "wrap" },
  tagCoin:  { backgroundColor: "#1e1e1e", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagPrize: { backgroundColor: "#1a2e1a", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagLive:  { backgroundColor: "#7f1d1d", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagFlash: { backgroundColor: "#3b1f00", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:        { fontSize: 9, fontWeight: "500", color: "#aaa" },
  tagTextGreen:   { fontSize: 9, fontWeight: "500", color: "#4ade80" },
  tagTextRed:     { fontSize: 9, fontWeight: "500", color: "#f87171" },
  tagTextOrange:  { fontSize: 9, fontWeight: "500", color: "#fb923c" },
  marketArrow: { color: "#444", fontSize: 14 },

  // Creator pills
  creatorRow: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingBottom: 8, paddingTop: 2 },
  creatorPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1a1a1a", borderRadius: 20, paddingLeft: 5, paddingRight: 8, paddingVertical: 3 },
  creatorAvatar:  { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  avatarGreen:    { backgroundColor: "#16a34a" },
  creatorInitial: { fontSize: 8, fontWeight: "600", color: "#000" },
  creatorName:    { fontSize: 9, color: "#888" },
  creatorWinRate: { fontSize: 9, fontWeight: "600", color: "#22c55e" },

  // Coming soon stubs
  comingSoon: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  comingSoonEmoji: { fontSize: 36 },
  comingSoonTitle: { fontSize: 16, fontWeight: "600", color: "#fff" },
  comingSoonSub:   { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 20 },

  // Bet sheet overlay
  betOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end" },
  betBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },

  // Sharps leaderboard
  periodRow: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingBottom: 12 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: "#1e1e1e" },
  periodBtnActive: { backgroundColor: "#22c55e" },
  periodBtnText: { fontSize: 11, fontWeight: "500", color: "#aaa" },
  periodBtnTextActive: { color: "#000" },

  sharpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1a1a1a",
  },
  sharpRank:       { width: 24, fontSize: 11, color: "#555", fontWeight: "600", textAlign: "right" },
  sharpAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sharpAvatarText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  sharpInfo:       { flex: 1, minWidth: 0 },
  sharpNameRow:    { flexDirection: "row", alignItems: "center", gap: 4 },
  sharpBadge:      { fontSize: 12 },
  sharpName:       { fontSize: 13, fontWeight: "600", color: "#fff" },
  sharpStats:      { flexDirection: "row", gap: 8, marginTop: 2 },
  sharpWinRate:    { fontSize: 10, color: "#22c55e", fontWeight: "600" },
  sharpPnl:        { fontSize: 10, fontWeight: "600" },
  pnlPos:          { color: "#4ade80" },
  pnlNeg:          { color: "#f87171" },
  followBtn:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: "#333" },
  followBtnActive:  { backgroundColor: "#052e16", borderColor: "#22c55e" },
  followBtnText:    { fontSize: 11, fontWeight: "600", color: "#aaa" },
  followBtnTextActive: { color: "#22c55e" },
});

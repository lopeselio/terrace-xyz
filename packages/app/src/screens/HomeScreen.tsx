import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Modal,
} from "react-native";
import type { Matchup } from "@terrace/sdk";
import { useMatchup } from "../hooks/useMatchup";
import { avatarColorFromPubkey } from "../hooks/useLeaderboard";
import { TerraceMark, PolyJupLogos, POLYMARKET_LOGO, JUPITER_LOGO_URI } from "../components/BrandIcons";
import { LinearGradient } from "expo-linear-gradient";
import { usePlaceBet } from "../hooks/usePlaceBet";
import { useCreatorWinRates } from "../hooks/useCreatorWinRates";
import { useTerraceUsers } from "../hooks/useTerraceUsers";
import { groupMarkets } from "../utils/groupMarkets";
import { MatchGroupCard } from "./MatchGroupCard";
import { BetSheet } from "./BetSheet";
import type { UnifiedMarket } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// Feature cards (horizontal scroll)
// ---------------------------------------------------------------------------
const FEATURE_CARDS = [
  { emoji: "⚽", title: "Matchups",      sub: "Settle group chat bets",   colors: ["#064e3b", "#16a34a"] as const, key: "Matchups" as const },
  { emoji: "🏆", title: "Parlays",       sub: "Chain your convictions",   colors: ["#1e3a5f", "#3b82f6"] as const, key: "Parlays"  as const },
  { emoji: "⚡", title: "Flash markets", sub: "In-match, high urgency",   colors: ["#2d1b69", "#7c3aed"] as const, key: "Flash"    as const },
  { emoji: "📊", title: "Leagues",       sub: "FPL meets prediction",     colors: ["#7c2d12", "#ea580c"] as const, key: "Leagues"  as const },
];

// Thumbnail colour palette — cycles by market index
const THUMB_COLORS = ["#064e3b", "#1e3a5f", "#7f1d1d", "#2d1b69"];
const THUMB_EMOJIS = ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "⚽", "🔴", "🟣"];

const TRENDING_TABS = ["Markets", "Leagues"] as const;
type TrendingTab = (typeof TRENDING_TABS)[number];

const SOURCE_FILTERS = [
  { key: "All",        label: "All markets" },
  { key: "Terrace",    label: "Terrace"     },
  { key: "Polymarket", label: "Polymarket"  },
] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number]["key"];

function SourceChipContent({ filterKey, active }: { filterKey: SourceFilter; active: boolean }) {
  const textStyle = [styles.sourceChipText, active && styles.sourceChipTextActive];
  if (filterKey === "Terrace") {
    return (
      <>
        <TerraceMark size={12} />
        <Text style={textStyle}>Terrace</Text>
      </>
    );
  }
  if (filterKey === "Polymarket") {
    return (
      <>
        <PolyJupLogos size={12} />
        <Text style={textStyle}>Polymarket</Text>
      </>
    );
  }
  return <Text style={textStyle}>All markets</Text>;
}

const LEAGUE_CHIPS = ["All", "Premier League", "Champions League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Europa League"];

function matchesLeague(eventTitle: string, league: string): boolean {
  if (league === "All") return true;
  const t = eventTitle.toLowerCase();
  if (league === "Premier League") return /man |arsenal|chelsea|liverpool|tottenham|newcastle|west ham|everton|crystal|wolves|fulham|brentford|brighton|nottingham|bournemouth|aston villa|ipswich|leicester|southampton/i.test(eventTitle);
  if (league === "Champions League") return /champions league|ucl/i.test(t);
  if (league === "La Liga") return /la liga|real madrid|barcelona|atletico|sevilla|villarreal|real sociedad|athletic bilbao/i.test(t);
  if (league === "Bundesliga") return /bundesliga|bayern|dortmund|leverkusen|leipzig|frankfurt/i.test(t);
  if (league === "Serie A") return /serie a|juventus|inter|milan|napoli|roma|lazio|atalanta|fiorentina/i.test(t);
  if (league === "Ligue 1") return /ligue 1|psg|paris|lyon|marseille|monaco|lille/i.test(t);
  if (league === "Europa League") return /europa league|uel/i.test(t);
  return true;
}

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

// ---------------------------------------------------------------------------
// Flash market countdown
// ---------------------------------------------------------------------------

function countdownLabel(expiry: Date | null): string {
  if (!expiry) return "";
  const diff = expiry.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const totalSecs = Math.floor(diff / 1_000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useCountdown(expiry: Date | null): string {
  const [label, setLabel] = useState(() => countdownLabel(expiry));
  useEffect(() => {
    const id = setInterval(() => setLabel(countdownLabel(expiry)), 1_000);
    return () => clearInterval(id);
  }, [expiry]);
  return label;
}

function FlashMarketCard({ market, onPress }: { market: UnifiedMarket; onPress: (id: string) => void }) {
  const countdown = useCountdown(market.expiry);
  const expired = countdown === "Expired";
  return (
    <TouchableOpacity style={flashStyles.card} onPress={() => onPress(market.id)} activeOpacity={0.8}>
      <View style={flashStyles.cardHeader}>
        <View style={flashStyles.flashBadge}>
          <Text style={flashStyles.flashBadgeText}>⚡ FLASH</Text>
        </View>
        <Text style={[flashStyles.countdown, expired && flashStyles.countdownExpired]}>
          {countdown}
        </Text>
      </View>
      <Text style={flashStyles.cardQuestion} numberOfLines={3}>{market.question}</Text>
      <View style={flashStyles.cardFooter}>
        <View style={flashStyles.priceChip}>
          <Text style={flashStyles.priceChipText}>YES {Math.round(market.yesPrice * 100)}¢</Text>
        </View>
        {market.totalVolumeUsdc > 0 && (
          <Text style={flashStyles.cardVol}>Vol {formatUsdc(market.totalVolumeUsdc)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function FlashMarketsRow({ markets, onSelectMarket }: { markets: UnifiedMarket[]; onSelectMarket: (id: string) => void }) {
  const flashOpen = useMemo(
    () =>
      markets
        .filter((m) => m.isFlash && m.status === "Open")
        .sort((a, b) => (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0)),
    [markets]
  );
  if (flashOpen.length === 0) return null;
  return (
    <View style={flashStyles.section}>
      <View style={flashStyles.sectionHeader}>
        <Text style={flashStyles.sectionTitle}>⚡ Flash Markets</Text>
        <View style={flashStyles.liveBadge}>
          <View style={flashStyles.liveDot} />
          <Text style={flashStyles.liveText}>{flashOpen.length} live</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={flashStyles.scrollContent}
      >
        {flashOpen.map((m) => (
          <FlashMarketCard key={m.id} market={m} onPress={onSelectMarket} />
        ))}
      </ScrollView>
    </View>
  );
}

const flashStyles = StyleSheet.create({
  section:       { marginBottom: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: "700", color: "#fff" },
  liveBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#2d1b69", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: "#a78bfa" },
  liveText:      { fontSize: 10, fontWeight: "600", color: "#a78bfa" },
  scrollContent: { paddingHorizontal: 18, gap: 10, paddingBottom: 6 },

  card:          { width: 185, backgroundColor: "#1a0a3a", borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: "#4c1d95" },
  cardHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flashBadge:    { backgroundColor: "#4c1d95", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  flashBadgeText:{ fontSize: 9, fontWeight: "700", color: "#c4b5fd", letterSpacing: 0.5 },
  countdown:     { fontSize: 13, fontWeight: "700", color: "#f59e0b" },
  countdownExpired: { color: "#6b7280" },
  cardQuestion:  { fontSize: 13, fontWeight: "500", color: "#e5e7eb", lineHeight: 18, flex: 1 },
  cardFooter:    { flexDirection: "row", alignItems: "center", gap: 8 },
  priceChip:     { backgroundColor: "#2d1b69", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  priceChipText: { fontSize: 10, fontWeight: "600", color: "#a78bfa" },
  cardVol:       { fontSize: 10, color: "#6b7280" },
});

function formatUsdc(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}K`;
  if (val >= 10)        return `$${val.toFixed(1)}`;
  return `$${val.toFixed(2)}`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const FEATURE_CARD_WIDTH = 148;
const FEATURE_CARD_GAP   = 10;
const FEATURE_CARD_STEP  = FEATURE_CARD_WIDTH + FEATURE_CARD_GAP;
const CAROUSEL_INTERVAL  = 3_000;

function FeatureCardRow({ onParlayPress, onMatchupPress, onLeaguePress }: { onParlayPress?: () => void; onMatchupPress?: () => void; onLeaguePress?: () => void }) {
  const scrollRef      = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const userScrolling  = useRef(false);
  const activeRef      = useRef(0); // avoid stale closure in interval

  // Keep ref in sync
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

  // Auto-advance every CAROUSEL_INTERVAL ms; pause while user is dragging
  useEffect(() => {
    const id = setInterval(() => {
      if (userScrolling.current) return;
      const next = (activeRef.current + 1) % FEATURE_CARDS.length;
      scrollRef.current?.scrollTo({ x: next * FEATURE_CARD_STEP, animated: true });
      setActiveIndex(next);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featureRow}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { userScrolling.current = true; }}
        onMomentumScrollEnd={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const i = Math.round(x / FEATURE_CARD_STEP);
          setActiveIndex(Math.min(Math.max(i, 0), FEATURE_CARDS.length - 1));
          userScrolling.current = false;
        }}
      >
        {FEATURE_CARDS.map((card) => (
          <TouchableOpacity
            key={card.title}
            activeOpacity={0.8}
            onPress={card.key === "Parlays" ? onParlayPress : card.key === "Matchups" ? onMatchupPress : card.key === "Leagues" ? onLeaguePress : undefined}
          >
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

      {/* Dynamic pagination dots */}
      <View style={styles.dotsRow}>
        {FEATURE_CARDS.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Terrace status filter header
// ---------------------------------------------------------------------------

const TERRACE_STATUS_OPTIONS = [
  { key: "Open"    as const, activeColor: "#22c55e" },
  { key: "Settled" as const, activeColor: "#6b7280" },
  { key: "All"     as const, activeColor: "#818cf8" },
];

interface TerraceSectionHeaderProps {
  openCount:    number;
  settledCount: number;
  active:       "Open" | "Settled" | "All";
  onChange:     (v: "Open" | "Settled" | "All") => void;
}

function TerraceSectionHeader({ openCount, settledCount, active, onChange }: TerraceSectionHeaderProps) {
  const countOf = (key: "Open" | "Settled" | "All") =>
    key === "Open" ? openCount : key === "Settled" ? settledCount : openCount + settledCount;

  return (
    <View style={tsStyles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tsStyles.row}>
        {TERRACE_STATUS_OPTIONS.map(({ key, activeColor }) => {
          const isActive = active === key;
          return (
            <TouchableOpacity
              key={key}
              style={[tsStyles.chip, isActive && { borderColor: activeColor }]}
              onPress={() => onChange(key)}
              activeOpacity={0.7}
            >
              <Text style={[tsStyles.chipLabel, isActive && { color: activeColor }]}>{key}</Text>
              <View style={[tsStyles.countBubble, isActive && { backgroundColor: activeColor }]}>
                <Text style={[tsStyles.countText, isActive && { color: "#000" }]}>
                  {countOf(key)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const tsStyles = StyleSheet.create({
  wrap:        { paddingTop: 2 },
  row:         { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  chip:        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  chipLabel:   { fontSize: 12, fontWeight: "600", color: "#666" },
  countBubble: { backgroundColor: "#2a2a2a", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  countText:   { fontSize: 10, fontWeight: "700", color: "#666" },
});

// ---------------------------------------------------------------------------
// Market row
// ---------------------------------------------------------------------------

interface MarketRowProps {
  market: UnifiedMarket;
  index: number;
  onPress: (id: string) => void;
  creatorWinRate?: number; // winRateBps (0–10000), undefined = not yet loaded
}

function MarketRow({ market, index, onPress, creatorWinRate }: MarketRowProps) {
  const thumbColor = THUMB_COLORS[index % THUMB_COLORS.length];
  const thumbEmoji = THUMB_EMOJIS[index % THUMB_EMOJIS.length];
  const label = categoryLabel(market);
  const creatorShort = market.creator ? shortAddr(market.creator) : null;
  const winRateLabel = creatorWinRate != null
    ? `${Math.round(creatorWinRate / 100)}% W`
    : "-- W";
  const isOpen = market.status === "Open";
  const isSettled = market.status === "Settled" || market.status === "Closed";

  return (
    <View style={isSettled ? styles.settledMarketWrap : undefined}>
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
            {/* YES price */}
            <View style={styles.tagCoin}>
              <Text style={styles.tagText}>YES {Math.round(market.yesPrice * 100)}¢</Text>
            </View>
            {/* Total volume */}
            {market.totalVolumeUsdc > 0 && (
              <View style={styles.tagPrize}>
                <Text style={styles.tagTextGreen}>Vol {formatUsdc(market.totalVolumeUsdc)}</Text>
              </View>
            )}
            {/* Status */}
            {isOpen && (
              <View style={styles.tagLive}>
                <Text style={styles.tagTextRed}>● Open</Text>
              </View>
            )}
            {isSettled && (
              <View style={styles.tagSettled}>
                <Text style={styles.tagTextGrey}>✓ Settled</Text>
              </View>
            )}
            {/* Source */}
            {market.source === "native" ? (
              <View style={styles.tagFlash}>
                <TerraceMark size={9} />
                <Text style={styles.tagTextOrange}>Terrace</Text>
              </View>
            ) : (
              <View style={styles.tagPoly}>
                <PolyJupLogos size={9} />
                <Text style={styles.tagTextBlue}>Polymarket</Text>
              </View>
            )}
            {market.isFlash && (
              <View style={styles.tagFlashPurple}>
                <Text style={styles.tagTextPurple}>⚡ Flash</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.marketArrow}>›</Text>
      </TouchableOpacity>

      {/* Creator pill — native markets only */}
      {market.source === "native" && creatorShort && (
        <View style={styles.creatorRow}>
          <View style={styles.creatorPill}>
            <View style={[styles.creatorAvatar, styles.avatarGreen]}>
              <Text style={styles.creatorInitial}>{market.creator![0].toUpperCase()}</Text>
            </View>
            <Text style={styles.creatorName}>{creatorShort}</Text>
            <Text style={styles.creatorWinRate}>{winRateLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function LeaguesTab({ onOpenLeagues }: { onOpenLeagues?: () => void }) {
  return (
    <View style={styles.comingSoon}>
      <Text style={styles.comingSoonEmoji}>🏆</Text>
      <Text style={styles.comingSoonTitle}>Fan Leagues</Text>
      <Text style={styles.comingSoonSub}>Create a private league with mates, compete each gameweek</Text>
      {onOpenLeagues && (
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: "#22c55e", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 }}
          onPress={onOpenLeagues}
          activeOpacity={0.8}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Open Leagues</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}


// ---------------------------------------------------------------------------
// ChallengeNotificationPanel
// ---------------------------------------------------------------------------

function fmtUsdc(n: bigint) { return `$${(Number(n) / 1_000_000).toFixed(2)}`; }

interface NotifPanelProps {
  visible: boolean;
  challenges: Matchup[];
  busy: boolean;
  marketQuestionMap: Map<string, string>;
  challengerNameMap: Map<string, string>;
  onAccept: (m: Matchup) => void;
  onDecline: (m: Matchup) => void;
  onViewAll: () => void;
  onClose: () => void;
}

function ChallengeNotificationPanel({ visible, challenges, busy, marketQuestionMap, challengerNameMap, onAccept, onDecline, onViewAll, onClose }: NotifPanelProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={notif.backdrop} onPress={onClose}>
        <Pressable style={notif.panel} onPress={() => {}}>
          <View style={notif.header}>
            <Text style={notif.title}>🔔 Pending Challenges</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={notif.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {challenges.length === 0 ? (
            <View style={notif.empty}>
              <Text style={notif.emptyEmoji}>🏳️</Text>
              <Text style={notif.emptyText}>No pending challenges</Text>
            </View>
          ) : (
            <ScrollView style={notif.list} contentContainerStyle={{ gap: 10 }}>
              {challenges.map((m) => {
                const bg = avatarColorFromPubkey(m.challenger);
                return (
                  <View key={m.address} style={notif.card}>
                    <View style={notif.cardTop}>
                      <View style={[notif.avatar, { backgroundColor: bg }]}>
                        <Text style={notif.avatarText}>{m.challenger.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={notif.challengeFrom}>Challenge from</Text>
                        <Text style={notif.challengerAddr}>
                          {challengerNameMap.get(m.challenger) ?? shortAddr(m.challenger)}
                        </Text>
                        <Text style={notif.stakeText}>
                          {fmtUsdc(m.stakeUsdc)} each · pot {fmtUsdc(m.stakeUsdc * 2n)}
                        </Text>
                      </View>
                      <View style={[notif.outcomePill, m.challengerOutcome === 1 ? notif.yesPill : notif.noPill]}>
                        <Text style={notif.outcomeText}>
                          {m.challengerOutcome === 1 ? "They: YES" : "They: NO"}
                        </Text>
                      </View>
                    </View>
                    <Text style={notif.marketAddr} numberOfLines={2}>
                      📍 {marketQuestionMap.get(m.market as string) ?? shortAddr(m.market)}
                    </Text>
                    <View style={notif.actions}>
                      <TouchableOpacity
                        style={[notif.btn, notif.acceptBtn]}
                        onPress={() => { onAccept(m); onClose(); }}
                        disabled={busy}
                      >
                        <Text style={notif.btnText}>✓ Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[notif.btn, notif.declineBtn]}
                        onPress={() => { onDecline(m); onClose(); }}
                        disabled={busy}
                      >
                        <Text style={[notif.btnText, { color: "#ef4444" }]}>✕ Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={notif.viewAllBtn} onPress={() => { onClose(); onViewAll(); }}>
            <Text style={notif.viewAllText}>View all matchups →</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const notif = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  panel:         { position: "absolute", top: 80, right: 12, left: 12, backgroundColor: "#111", borderRadius: 18, borderWidth: 0.5, borderColor: "#2a2a2a", paddingBottom: 8, maxHeight: "70%" },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "#1e1e1e" },
  title:         { fontSize: 14, fontWeight: "700", color: "#fff" },
  closeBtn:      { fontSize: 13, color: "#6b7280", padding: 4 },
  empty:         { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyEmoji:    { fontSize: 28 },
  emptyText:     { fontSize: 13, color: "#6b7280" },
  list:          { paddingHorizontal: 12, paddingTop: 10, maxHeight: 360 },
  card:          { backgroundColor: "#0d0d0d", borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: "#1e1e1e", gap: 6 },
  cardTop:       { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar:        { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText:    { fontSize: 14, fontWeight: "700", color: "#fff" },
  challengeFrom: { fontSize: 10, color: "#6b7280" },
  challengerAddr:{ fontSize: 12, fontWeight: "600", color: "#e5e7eb", fontFamily: "monospace" },
  stakeText:     { fontSize: 10, color: "#22c55e", fontWeight: "600", marginTop: 1 },
  outcomePill:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  yesPill:       { backgroundColor: "#052e16" },
  noPill:        { backgroundColor: "#3b0a0a" },
  outcomeText:   { fontSize: 10, fontWeight: "700", color: "#fff" },
  marketAddr:    { fontSize: 12, color: "#9ca3af", lineHeight: 17 },
  actions:       { flexDirection: "row", gap: 8 },
  btn:           { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  acceptBtn:     { backgroundColor: "#22c55e" },
  declineBtn:    { backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#3b0a0a" },
  btnText:       { fontSize: 12, fontWeight: "700", color: "#fff" },
  viewAllBtn:    { marginHorizontal: 12, marginTop: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: "#2a2a2a", alignItems: "center" },
  viewAllText:   { fontSize: 12, color: "#6b7280" },
});

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

interface Props {
  walletPubkey: string | null;
  winRate: number | null;
  repLoading?: boolean;
  markets: UnifiedMarket[];
  marketsLoading: boolean;
  onSelectMarket: (id: string) => void;
  onNavigateProfile?: () => void;
  onNavigateParlay?: () => void;
  onNavigateMatchup?: () => void;
  onNavigateLeague?: () => void;
  onRefreshMarkets?: () => void;
}

interface SelectedBet {
  marketId: string;
  label: string;
  yesPrice: number | null;
  question: string | null;
  source: "native" | "jupiter";
}

export function HomeScreen({ walletPubkey, winRate, repLoading, markets, marketsLoading: loading, onSelectMarket, onNavigateProfile, onNavigateParlay, onNavigateMatchup, onNavigateLeague, onRefreshMarkets }: Props) {
  const [activeTab, setActiveTab] = useState<TrendingTab>("Markets");
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [leagueFilter, setLeagueFilter] = useState<string>("All");
  const [terraceStatusFilter, setTerraceStatusFilter] = useState<"Open" | "Settled" | "All">("Open");
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const {
    opponentMatchups,
    status: matchupStatus,
    acceptMatchup,
    declineMatchup,
  } = useMatchup();

  const { fans } = useTerraceUsers();

  const pendingChallenges = useMemo(
    () => opponentMatchups.filter((m) => m.status === "Pending"),
    [opponentMatchups],
  );
  const matchupBusy = matchupStatus === "building" || matchupStatus === "signing" || matchupStatus === "executing";

  const marketQuestionMap = useMemo(
    () => new Map(markets.map((m) => [m.id as string, m.question])),
    [markets],
  );

  const challengerNameMap = useMemo(
    () => new Map(fans.map((f) => [f.pubkey, f.displayName])),
    [fans],
  );

  // Reset status filter whenever the user switches away from Terrace
  useEffect(() => {
    if (sourceFilter !== "Terrace") setTerraceStatusFilter("Open");
  }, [sourceFilter]);

  const terraceOpenCount = useMemo(
    () => markets.filter((m) => !m.isFlash && m.source === "native" && m.status === "Open").length,
    [markets],
  );
  const terraceSettledCount = useMemo(
    () => markets.filter((m) => !m.isFlash && m.source === "native" && (m.status === "Settled" || m.status === "Closed")).length,
    [markets],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    onRefreshMarkets?.();
    // loading state is managed by the parent; stop spinner after a short window
    setTimeout(() => setRefreshing(false), 1500);
  }, [onRefreshMarkets]);

  const nativeCreators = markets
    .filter((m) => m.source === "native" && m.creator)
    .map((m) => m.creator!);
  const creatorWinRates = useCreatorWinRates(nativeCreators);
  const { status, txSignature, error, placeBet, reset } = usePlaceBet();

  const repLabel = winRate !== null
    ? `${Math.round(winRate * 100)}% W`
    : null;

  const handleSelectOutcome = (marketId: string, label: string, yesPrice: number | null) => {
    reset();
    const market = markets.find((m) => m.id === marketId);
    setSelectedBet({ marketId, label, yesPrice, question: market?.question ?? null, source: (market?.source === "native" ? "native" : "jupiter") });
  };

  const handleDismissBet = () => {
    reset();
    setSelectedBet(null);
  };

  const handleConfirmBet = async (amountUsdc: number) => {
    if (!selectedBet) return;
    const market = markets.find((m) => m.id === selectedBet.marketId);
    await placeBet({
      marketId: selectedBet.marketId,
      isYes: true,
      amountUsdc,
      source: market?.source ?? "jupiter",
    });
  };

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
          <TouchableOpacity
            style={styles.navIconBtn}
            onPress={() => setShowNotifPanel(true)}
            activeOpacity={0.7}
          >
            <Text>🔔</Text>
            {pendingChallenges.length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{pendingChallenges.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          {walletPubkey && (
            <TouchableOpacity
              style={styles.repBadge}
              onPress={onNavigateProfile}
              activeOpacity={onNavigateProfile ? 0.7 : 1}
            >
              {repLoading && winRate === null ? (
                <ActivityIndicator size="small" color="#22c55e" style={{ width: 32 }} />
              ) : (
                <Text style={styles.repBadgeText}>{repLabel ?? "-- W"}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Hero ────────────────────────────────────────────── */}
      <Text style={styles.heroLabel}>Back your take.</Text>

      {/* ── Feature cards ───────────────────────────────────── */}
      <FeatureCardRow onParlayPress={onNavigateParlay} onMatchupPress={onNavigateMatchup} onLeaguePress={onNavigateLeague} />

      {/* ── Flash markets row ───────────────────────────────── */}
      <FlashMarketsRow markets={markets} onSelectMarket={onSelectMarket} />

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
          ) : (() => {
            const sourceFiltered = markets.filter((m) => {
              if (m.isFlash) return false; // flash markets shown in dedicated row above
              if (sourceFilter === "Terrace") {
                if (m.source !== "native") return false;
                if (terraceStatusFilter === "Open")    return m.status === "Open";
                if (terraceStatusFilter === "Settled") return m.status === "Settled" || m.status === "Closed";
                return true; // "All"
              }
              if (sourceFilter === "Polymarket") return m.source === "jupiter";
              return true;
            });
            const grouped = groupMarkets(sourceFiltered);
            const showLeagueChips = sourceFilter !== "Terrace";
            const filteredGroups = showLeagueChips
              ? grouped.filter((g) =>
                  matchesLeague(g.type === "grouped" ? g.eventTitle : g.market.jupiterEventTitle ?? g.market.question, leagueFilter)
                )
              : grouped;
            return (
              <>
                {/* Source filter */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sourceChipsRow}
                >
                  {SOURCE_FILTERS.map(({ key }) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.sourceChip, sourceFilter === key && styles.sourceChipActive]}
                      onPress={() => {
                        setSourceFilter(key);
                        setLeagueFilter("All");
                      }}
                      activeOpacity={0.7}
                    >
                      <SourceChipContent filterKey={key} active={sourceFilter === key} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Terrace status filter — only when Terrace source is selected */}
                {sourceFilter === "Terrace" && (
                  <TerraceSectionHeader
                    openCount={terraceOpenCount}
                    settledCount={terraceSettledCount}
                    active={terraceStatusFilter}
                    onChange={setTerraceStatusFilter}
                  />
                )}

                {/* League chips — only when showing Polymarket or All */}
                {showLeagueChips && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.leagueChipsRow}
                  >
                    {LEAGUE_CHIPS.map((chip) => (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.leagueChip, leagueFilter === chip && styles.leagueChipActive]}
                        onPress={() => setLeagueFilter(chip)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.leagueChipText, leagueFilter === chip && styles.leagueChipTextActive]}>
                          {chip}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {filteredGroups.length === 0 ? (
                  <View style={styles.comingSoon}>
                    {sourceFilter === "Terrace" ? (
                      <Text style={styles.comingSoonEmoji}>⚡</Text>
                    ) : (
                      <View style={styles.emptyLogoRow}>
                        <Image source={{ uri: JUPITER_LOGO_URI }} style={styles.emptyLogo} />
                        <Image source={POLYMARKET_LOGO} style={styles.emptyLogo} />
                      </View>
                    )}
                    <Text style={styles.comingSoonTitle}>
                      {sourceFilter === "Terrace" ? "No Terrace markets yet" : "No Polymarket markets"}
                    </Text>
                    <Text style={styles.comingSoonSub}>
                      {sourceFilter === "Terrace"
                        ? "Create the first one from the + tab"
                        : "Try a different league filter"}
                    </Text>
                  </View>
                ) : (
                  filteredGroups.map((item, i) =>
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
                        creatorWinRate={item.market.creator ? creatorWinRates[item.market.creator] : undefined}
                      />
                    )
                  )
                )}
              </>
            );
          })()
        )}
        {activeTab === "Leagues" && <LeaguesTab onOpenLeagues={onNavigateLeague} />}

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
          marketQuestion={selectedBet.question ?? undefined}
          source={selectedBet.source}
          yesPrice={selectedBet.yesPrice}
          onConfirm={handleConfirmBet}
          onDismiss={handleDismissBet}
          status={status}
          txSignature={txSignature}
          error={error}
        />
      </View>
    )}

    {/* Challenge notification panel */}
    <ChallengeNotificationPanel
      visible={showNotifPanel}
      challenges={pendingChallenges}
      busy={matchupBusy}
      marketQuestionMap={marketQuestionMap}
      challengerNameMap={challengerNameMap}
      onAccept={acceptMatchup}
      onDecline={declineMatchup}
      onViewAll={() => onNavigateMatchup?.()}
      onClose={() => setShowNotifPanel(false)}
    />
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
  notifBadge:{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  notifBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff" },
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

  // Source filter chips
  sourceChipsRow: { paddingHorizontal: 14, paddingBottom: 8, paddingTop: 4, gap: 6, flexDirection: "row" },
  sourceChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 16, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  sourceChipActive: { backgroundColor: "#0f172a", borderColor: "#6366f1" },
  sourceChipText: { fontSize: 12, fontWeight: "600", color: "#888" },
  sourceChipTextActive: { color: "#818cf8", fontWeight: "700" },

  // League filter chips
  leagueChipsRow: { paddingHorizontal: 14, paddingBottom: 10, gap: 6, flexDirection: "row" },
  leagueChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#2a2a2a" },
  leagueChipActive: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  leagueChipText: { fontSize: 11, fontWeight: "500", color: "#888" },
  leagueChipTextActive: { color: "#22c55e", fontWeight: "600" },

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
  tagCoin:    { backgroundColor: "#1e1e1e", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagPrize:   { backgroundColor: "#1a2e1a", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagLive:    { backgroundColor: "#7f1d1d", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagSettled:         { backgroundColor: "#1a1a1a", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 0.5, borderColor: "#333" },
  settledMarketWrap:  { opacity: 0.6, borderLeftWidth: 2, borderLeftColor: "#374151" },
  tagFlash: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#3b1f00", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagPoly:  { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#1e3a5f", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:        { fontSize: 9, fontWeight: "500", color: "#aaa" },
  tagTextGreen:   { fontSize: 9, fontWeight: "500", color: "#4ade80" },
  tagTextRed:     { fontSize: 9, fontWeight: "500", color: "#f87171" },
  tagTextOrange:  { fontSize: 9, fontWeight: "500", color: "#fb923c" },
  tagTextGrey:    { fontSize: 9, fontWeight: "500", color: "#6b7280" },
  tagTextBlue:    { fontSize: 9, fontWeight: "500", color: "#60a5fa" },
  tagFlashPurple: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#2d1b69", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagTextPurple:  { fontSize: 9, fontWeight: "600", color: "#a78bfa" },
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
  emptyLogoRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  emptyLogo:    { width: 36, height: 36, borderRadius: 18 },
  comingSoon: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  comingSoonEmoji: { fontSize: 36 },
  comingSoonTitle: { fontSize: 16, fontWeight: "600", color: "#fff" },
  comingSoonSub:   { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 20 },

  // Bet sheet overlay
  betOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end" },
  betBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },

});

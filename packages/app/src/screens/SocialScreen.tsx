import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import { avatarColorFromPubkey, truncatePubkey, type BadgeTier } from "../hooks/useLeaderboard";

// ---------------------------------------------------------------------------
// Feed event types
// ---------------------------------------------------------------------------

type FeedEventType =
  | "BET_PLACED"
  | "PARLAY_WON"
  | "PARLAY_LOST"
  | "MARKET_CREATED"
  | "MARKET_SETTLED";

interface FeedActor {
  pubkey: string;
  displayName: string;
  badge: BadgeTier;
}

interface FeedEvent {
  id: string;
  type: FeedEventType;
  actor: FeedActor;
  market?: string;
  outcome?: string;
  amountUsdc?: number;
  priceAtBet?: number;
  legs?: string[];
  profitUsdc?: number;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Mock feed — replaced by Helius WebSocket events in Phase 3 step 2
// ---------------------------------------------------------------------------

function mockActor(pubkey: string, badge: BadgeTier): FeedActor {
  return { pubkey, displayName: truncatePubkey(pubkey), badge };
}

const MOCK_FEED: FeedEvent[] = [
  {
    id: "1",
    type: "PARLAY_WON",
    actor: mockActor("4kQpXwRt2mVbNzY1aLpD9fGhJsKqTu8eWcR3oBnMv", "Legend"),
    legs: ["Arsenal win", "Man City win", "Liverpool win"],
    amountUsdc: 10,
    profitUsdc: 38.40,
    timestamp: new Date(Date.now() - 4 * 60_000),
  },
  {
    id: "2",
    type: "BET_PLACED",
    actor: mockActor("9mRtYkL4bCwXpNqHvZsEaFdJuG7oT2iMeW1rBn3Ky", "Sharp"),
    market: "Arsenal vs Chelsea",
    outcome: "Arsenal win",
    amountUsdc: 25,
    priceAtBet: 0.58,
    timestamp: new Date(Date.now() - 12 * 60_000),
  },
  {
    id: "3",
    type: "MARKET_CREATED",
    actor: mockActor("2xZyPbQmR8nDkL5vJwAeHsTfUcY6oG1iN4XrBa7Mp", "Sharp"),
    market: "Will Bellingham score vs Real Betis?",
    timestamp: new Date(Date.now() - 28 * 60_000),
  },
  {
    id: "4",
    type: "BET_PLACED",
    actor: mockActor("7vFkSdW3nQpLrTaYeXbM9uNcJzH2oG6iR1BmKy4Vx", "Casual"),
    market: "Champions League Final",
    outcome: "Real Madrid win",
    amountUsdc: 5,
    priceAtBet: 0.45,
    timestamp: new Date(Date.now() - 45 * 60_000),
  },
  {
    id: "5",
    type: "MARKET_SETTLED",
    actor: mockActor("3hNcWbGpT7rMkYsXaLqFdJuV2eR9oBnZiP4KmDx1Wy", "Casual"),
    market: "Will Arsenal beat Spurs?",
    outcome: "Yes — Arsenal won 2–1",
    timestamp: new Date(Date.now() - 2 * 60 * 60_000),
  },
  {
    id: "6",
    type: "PARLAY_LOST",
    actor: mockActor("6wBsNhJkT9rYpXaLqFdMuV3eR2oBnZcP5KmGx8Wy1", "Casual"),
    legs: ["PSG win", "Bayern win"],
    amountUsdc: 15,
    timestamp: new Date(Date.now() - 3 * 60 * 60_000),
  },
  {
    id: "7",
    type: "BET_PLACED",
    actor: mockActor("4kQpXwRt2mVbNzY1aLpD9fGhJsKqTu8eWcR3oBnMv", "Legend"),
    market: "Premier League Top 4",
    outcome: "Newcastle finish top 4",
    amountUsdc: 50,
    priceAtBet: 0.71,
    timestamp: new Date(Date.now() - 5 * 60 * 60_000),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_EMOJI: Record<BadgeTier, string> = {
  Legend: "👑",
  Sharp:  "⚡",
  Casual: "🎯",
};

function formatTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Feed card components
// ---------------------------------------------------------------------------

interface ActorHeaderProps {
  actor: FeedActor;
  timeStr: string;
}

function ActorHeader({ actor, timeStr }: ActorHeaderProps) {
  const bg = avatarColorFromPubkey(actor.pubkey);
  return (
    <View style={styles.actorRow}>
      <View style={[styles.actorAvatar, { backgroundColor: bg }]}>
        <Text style={styles.actorAvatarText}>{actor.pubkey.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.actorMeta}>
        <View style={styles.actorNameRow}>
          <Text style={styles.actorBadge}>{BADGE_EMOJI[actor.badge]}</Text>
          <Text style={styles.actorName}>{actor.displayName}</Text>
        </View>
        <Text style={styles.actorTime}>{timeStr}</Text>
      </View>
    </View>
  );
}

function BetPlacedCard({ event }: { event: FeedEvent }) {
  return (
    <View style={styles.feedCard}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} />
      <View style={styles.cardBody}>
        <Text style={styles.cardAction}>Placed a bet</Text>
        <View style={styles.betDetail}>
          <View style={styles.betDetailLeft}>
            <Text style={styles.betMarket} numberOfLines={1}>{event.market}</Text>
            <Text style={styles.betOutcome}>{event.outcome}</Text>
          </View>
          <View style={styles.betDetailRight}>
            <Text style={styles.betAmount}>${event.amountUsdc?.toFixed(0)}</Text>
            {event.priceAtBet !== undefined && (
              <Text style={styles.betPrice}>{Math.round(event.priceAtBet * 100)}¢</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function ParlayCard({ event }: { event: FeedEvent }) {
  const won = event.type === "PARLAY_WON";
  return (
    <View style={[styles.feedCard, won ? styles.cardWon : styles.cardLost]}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} />
      <View style={styles.cardBody}>
        <View style={styles.parlayHeader}>
          <Text style={styles.cardAction}>
            {won ? `Hit a ${event.legs?.length}-leg parlay 🔥` : `Missed a ${event.legs?.length}-leg parlay`}
          </Text>
          {won && event.profitUsdc !== undefined && (
            <Text style={styles.parlayProfit}>+${event.profitUsdc.toFixed(2)}</Text>
          )}
        </View>
        <View style={styles.parlayLegs}>
          {event.legs?.map((leg, i) => (
            <View key={i} style={styles.parlayLeg}>
              <Text style={styles.parlayLegDot}>{won ? "✓" : "✗"}</Text>
              <Text style={[styles.parlayLegText, won ? styles.legWon : styles.legLost]}>{leg}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.parlayStake}>
          Stake: ${event.amountUsdc?.toFixed(0)} USDC
        </Text>
      </View>
    </View>
  );
}

function MarketCreatedCard({ event }: { event: FeedEvent }) {
  return (
    <View style={styles.feedCard}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} />
      <View style={styles.cardBody}>
        <Text style={styles.cardAction}>Created a market</Text>
        <View style={styles.createdMarket}>
          <Text style={styles.createdMarketQ}>"{event.market}"</Text>
        </View>
      </View>
    </View>
  );
}

function MarketSettledCard({ event }: { event: FeedEvent }) {
  return (
    <View style={styles.feedCard}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} />
      <View style={styles.cardBody}>
        <Text style={styles.cardAction}>Market settled</Text>
        <View style={styles.settledMarket}>
          <Text style={styles.settledMarketQ} numberOfLines={1}>{event.market}</Text>
          <Text style={styles.settledOutcome}>{event.outcome}</Text>
        </View>
      </View>
    </View>
  );
}

function FeedCard({ event }: { event: FeedEvent }) {
  switch (event.type) {
    case "BET_PLACED":     return <BetPlacedCard event={event} />;
    case "PARLAY_WON":
    case "PARLAY_LOST":    return <ParlayCard event={event} />;
    case "MARKET_CREATED": return <MarketCreatedCard event={event} />;
    case "MARKET_SETTLED": return <MarketSettledCard event={event} />;
  }
}

// ---------------------------------------------------------------------------
// Feed filter tabs
// ---------------------------------------------------------------------------

const FEED_TABS = [
  { key: "following", label: "Following" },
  { key: "global",    label: "Global"    },
  { key: "sharps",    label: "Sharps"    },
] as const;
type FeedTab = (typeof FEED_TABS)[number]["key"];

// ---------------------------------------------------------------------------
// SocialScreen
// ---------------------------------------------------------------------------

interface Props {
  walletPubkey: string | null;
}

export function SocialScreen({ walletPubkey }: Props) {
  const [activeTab, setActiveTab] = useState<FeedTab>("global");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // TODO: re-fetch Helius WebSocket events
    setTimeout(() => setRefreshing(false), 800);
  };

  // Filter mock feed by tab (placeholder logic — replace with real data)
  const feed = MOCK_FEED.filter((e) => {
    if (activeTab === "sharps") return e.actor.badge === "Sharp" || e.actor.badge === "Legend";
    return true;
  });

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        {!walletPubkey && (
          <Text style={styles.headerSub}>Connect wallet to see your following feed</Text>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {FEED_TABS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Feed */}
      <ScrollView
        style={styles.feed}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#22c55e"
          />
        }
      >
        {activeTab === "following" && !walletPubkey ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✈️</Text>
            <Text style={styles.emptyTitle}>Connect to see your feed</Text>
            <Text style={styles.emptySub}>Follow sharps and see their bets in real time</Text>
          </View>
        ) : feed.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>Activity will appear as bets are placed</Text>
          </View>
        ) : (
          feed.map((event) => <FeedCard key={event.id} event={event} />)
        )}

        {/* Helius live indicator stub */}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live · Helius WebSocket</Text>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },

  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#fff", letterSpacing: -0.4 },
  headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },

  tabBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  tab:           { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: "#1e1e1e" },
  tabActive:     { backgroundColor: "#22c55e" },
  tabText:       { fontSize: 12, fontWeight: "500", color: "#888" },
  tabTextActive: { color: "#000" },

  feed: { flex: 1 },

  // Feed cards
  feedCard: {
    backgroundColor: "#111",
    borderRadius: 14,
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: 0.5,
    borderColor: "#1e1e1e",
  },
  cardWon:  { borderColor: "#166534" },
  cardLost: { borderColor: "#7f1d1d" },

  // Actor header
  actorRow:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  actorAvatar:    { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  actorAvatarText:{ fontSize: 13, fontWeight: "700", color: "#fff" },
  actorMeta:      { flex: 1 },
  actorNameRow:   { flexDirection: "row", alignItems: "center", gap: 4 },
  actorBadge:     { fontSize: 11 },
  actorName:      { fontSize: 13, fontWeight: "600", color: "#fff" },
  actorTime:      { fontSize: 10, color: "#555", marginTop: 1 },

  cardBody:   {},
  cardAction: { fontSize: 11, color: "#6b7280", marginBottom: 8 },

  // Bet placed
  betDetail:      { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10 },
  betDetailLeft:  { flex: 1 },
  betDetailRight: { alignItems: "flex-end" },
  betMarket:      { fontSize: 12, color: "#9ca3af", marginBottom: 2 },
  betOutcome:     { fontSize: 14, fontWeight: "600", color: "#fff" },
  betAmount:      { fontSize: 14, fontWeight: "700", color: "#22c55e" },
  betPrice:       { fontSize: 10, color: "#888", marginTop: 1 },

  // Parlay
  parlayHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  parlayProfit:  { fontSize: 15, fontWeight: "700", color: "#4ade80" },
  parlayLegs:    { gap: 4, marginBottom: 8 },
  parlayLeg:     { flexDirection: "row", alignItems: "center", gap: 6 },
  parlayLegDot:  { fontSize: 11, width: 14 },
  parlayLegText: { fontSize: 12, fontWeight: "500" },
  legWon:        { color: "#d1fae5" },
  legLost:       { color: "#fecaca" },
  parlayStake:   { fontSize: 10, color: "#555" },

  // Market created
  createdMarket:  { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10 },
  createdMarketQ: { fontSize: 13, fontWeight: "500", color: "#e5e7eb", fontStyle: "italic" },

  // Market settled
  settledMarket:  { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10 },
  settledMarketQ: { fontSize: 12, color: "#9ca3af", marginBottom: 2 },
  settledOutcome: { fontSize: 13, fontWeight: "600", color: "#22c55e" },

  // Empty state
  empty:      { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#fff" },
  emptySub:   { fontSize: 13, color: "#6b7280", textAlign: "center", paddingHorizontal: 32 },

  // Live indicator
  liveRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16 },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 10, color: "#374151" },
});

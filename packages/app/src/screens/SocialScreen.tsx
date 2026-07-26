import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { HeliusMark, TerraceMark, PolyJupLogos } from "../components/BrandIcons";
import { avatarColorFromPubkey, truncatePubkey, useLeaderboard, type BadgeTier, type SharpEntry } from "../hooks/useLeaderboard";
import { JerseyAvatar } from "../components/JerseyAvatar";
import { useHeliusEvents, type LiveEvent } from "../hooks/useHeliusEvents";
import { useFollowing } from "../hooks/useFollowing";
import { useTerraceUsers, type TerraceFan } from "../hooks/useTerraceUsers";
import { useMarketQuestions, type MarketMeta } from "../hooks/useMarketQuestions";
import { usePlaceBet } from "../hooks/usePlaceBet";
import { BetSheet } from "./BetSheet";
import { color as TC, font as TF } from "../theme/tokens";
import { probToFractional, money } from "../utils/format";
import { Avatar, OddsButton, Badge as UIBadge } from "../components/ui";

// ---------------------------------------------------------------------------
// Feed types
// ---------------------------------------------------------------------------

type FeedEventType =
  | "BET_PLACED"
  | "PARLAY_WON"
  | "PARLAY_LOST"
  | "MARKET_CREATED"
  | "MARKET_SETTLED"
  | "MATCHUP_CREATED"
  | "MATCHUP_SETTLED";

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

function liveEventToFeed(ev: LiveEvent): FeedEvent {
  return {
    id: ev.id,
    type: ev.type as FeedEventType,
    actor: { pubkey: ev.actorPubkey, displayName: ev.actorDisplay, badge: ev.badge },
    market: ev.market,
    outcome: ev.outcome,
    amountUsdc: ev.amountUsdc,
    profitUsdc: ev.profitUsdc,
    legs: ev.legs,
    timestamp: ev.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Merged sharp entry — Terrace users + Jupiter/Polymarket users
// ---------------------------------------------------------------------------

type UserSource = "terrace" | "polymarket";

interface MergedSharp {
  pubkey: string;
  displayName: string;
  winRate: number | null;
  totalBets: number;
  pnlUsdc: number | null;
  badge: BadgeTier;
  source: UserSource;
  score: number;
}

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
// Source label chip — Terrace (green) or Polymarket (blue)
// ---------------------------------------------------------------------------

function SourceChip({ source }: { source: UserSource }) {
  const isTerrace = source === "terrace";
  if (isTerrace) {
    return (
      <View style={[chip.pill, chip.terraceP]}>
        <TerraceMark size={11} />
        <Text style={[chip.label, chip.terraceT]}>Terrace</Text>
      </View>
    );
  }
  return (
    <View style={[chip.pill, chip.polyP]}>
      <PolyJupLogos size={12} />
      <Text style={[chip.label, chip.polyT]}>Polymarket</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  pill:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  terraceP:{ backgroundColor: "#052e16" },
  polyP:   { backgroundColor: "#1e3a5f" },
  logoImg: { width: 12, height: 12, borderRadius: 6 },
  label:   { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  terraceT:{ color: "#4ade80" },
  polyT:   { color: "#60a5fa" },
});

// ---------------------------------------------------------------------------
// Follow button
// ---------------------------------------------------------------------------

function FollowBtn({
  pubkey, isFollowed, onToggle,
}: { pubkey: string; isFollowed: boolean; onToggle: (pk: string) => void }) {
  return (
    <TouchableOpacity
      style={[styles.followBtn, isFollowed && styles.followBtnActive]}
      onPress={() => onToggle(pubkey)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[styles.followBtnText, isFollowed && styles.followBtnTextActive]}>
        {isFollowed ? "Following" : "Follow"}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Actor header — shared across feed cards
// ---------------------------------------------------------------------------

function ActorHeader({
  actor, timeStr, following, onToggleFollow, walletPubkey, onAvatarPress,
}: {
  actor: FeedActor;
  timeStr: string;
  following?: Set<string>;
  onToggleFollow?: (pk: string) => void;
  walletPubkey?: string | null;
  onAvatarPress?: (pubkey: string, source: UserSource) => void;
}) {
  const bg = avatarColorFromPubkey(actor.pubkey);
  const isFollowed = following?.has(actor.pubkey) ?? false;
  const isSelf = walletPubkey === actor.pubkey;
  return (
    <View style={styles.actorRow}>
      <TouchableOpacity
        onPress={() => onAvatarPress?.(actor.pubkey, "terrace")}
        disabled={!onAvatarPress}
        activeOpacity={0.75}
      >
        <Avatar name={actor.displayName} seed={actor.pubkey} size={38} />
      </TouchableOpacity>
      <View style={styles.actorMeta}>
        <Text style={styles.actorName} numberOfLines={1}>{actor.displayName}</Text>
        <Text style={styles.actorTime}>{timeStr}</Text>
      </View>
      {onToggleFollow && !isSelf && walletPubkey && (
        <FollowBtn pubkey={actor.pubkey} isFollowed={isFollowed} onToggle={onToggleFollow} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feed card components
// ---------------------------------------------------------------------------

type CardShared = {
  following?: Set<string>;
  onToggleFollow?: (pk: string) => void;
  walletPubkey?: string | null;
  marketMeta?: Record<string, MarketMeta>;
  onAvatarPress?: (pubkey: string, source: UserSource) => void;
  /** Tail/fade a bet — opens the bet sheet pre-committed to `isYes` on this market. */
  onTail?: (event: FeedEvent, isYes: boolean) => void;
};

// Returns human-readable question or falls back gracefully (never shows raw hash)
function resolveMarket(addr: string | undefined, meta?: Record<string, MarketMeta>): string {
  if (!addr) return "a market";
  const question = meta?.[addr]?.question;
  if (question && question.length > 0) return question;
  return "a market"; // while loading or missing, no hash exposed
}

function OutcomePill({ outcome }: { outcome: string | undefined }) {
  const isYes = outcome?.toLowerCase() === "yes";
  return (
    <View style={[styles.outcomePill, isYes ? styles.yesPill : styles.noPill]}>
      <Text style={[styles.outcomePillText, { color: isYes ? "#4ade80" : "#f87171" }]}>
        {isYes ? "YES" : "NO"}
      </Text>
    </View>
  );
}

function BetPlacedCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  const question = resolveMarket(event.market, s.marketMeta);
  const fanTookYes = event.outcome?.toLowerCase() === "yes";
  const amount = event.amountUsdc ?? 0;
  const priced = event.priceAtBet !== undefined;
  const theirOdds = probToFractional(event.priceAtBet);
  const oppOdds = probToFractional(priced ? 1 - (event.priceAtBet as number) : null);
  const canTail = s.onTail && event.market && s.walletPubkey && s.walletPubkey !== event.actor.pubkey;

  return (
    <View style={styles.feedCard}>
      <View style={styles.feedTop}>
        <View style={{ flex: 1 }}>
          <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} {...s} />
        </View>
        {amount > 0 && <UIBadge tone="open" label={money(amount)} />}
      </View>

      <Text style={styles.feedLine}>
        {fanTookYes ? "Backed" : "Faded"} <Text style={styles.feedLineBold}>{question}</Text>{priced ? ` at ${theirOdds}` : ""}
      </Text>

      {/* Copy this bet / Fade it */}
      {canTail && (
        <View style={styles.copyRow}>
          <OddsButton label="Copy this bet" tone="yes" value={theirOdds} onPress={() => s.onTail!(event, fanTookYes)} />
          <OddsButton label="Fade it" tone="no" value={oppOdds} onPress={() => s.onTail!(event, !fanTookYes)} />
        </View>
      )}
    </View>
  );
}

function ParlayCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  const won = event.type === "PARLAY_WON";
  const amount = event.amountUsdc ?? 0;
  return (
    <View style={[styles.feedCard, won ? styles.cardWon : styles.cardLost]}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} {...s} />
      <View style={styles.parlayHeader}>
        <Text style={styles.cardAction}>
          {won ? `🔥 Hit a ${event.legs?.length}-leg parlay!` : `Missed a ${event.legs?.length}-leg parlay`}
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
      <Text style={styles.parlayStake}>Staked ${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)} USDC</Text>
    </View>
  );
}

function MarketCreatedCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  const question = resolveMarket(event.market, s.marketMeta);
  return (
    <View style={styles.feedCard}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} {...s} />
      <Text style={styles.cardAction}>🏗️ Opened a new prediction market</Text>
      <View style={styles.questionBox}>
        <Text style={styles.questionText} numberOfLines={3}>{question}</Text>
      </View>
    </View>
  );
}

function MarketSettledCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  const question = resolveMarket(event.market, s.marketMeta);
  const isYes = event.outcome?.toLowerCase() === "yes";
  return (
    <View style={[styles.feedCard, styles.cardSettled]}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} {...s} />
      <Text style={styles.cardAction}>⚖️ Market settled</Text>
      <View style={styles.questionBox}>
        <Text style={styles.questionText} numberOfLines={2}>{question}</Text>
        <View style={styles.settledOutcomeRow}>
          <Text style={styles.settledOutcomeLabel}>Result</Text>
          <View style={[styles.outcomePill, isYes ? styles.yesPill : styles.noPill]}>
            <Text style={styles.outcomePillText}>{isYes ? "YES ✓" : "NO ✗"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function MatchupCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  const isCreated = event.type === "MATCHUP_CREATED";
  const question = resolveMarket(event.market, s.marketMeta);
  const amount = event.amountUsdc ?? 0;
  return (
    <View style={styles.feedCard}>
      <ActorHeader actor={event.actor} timeStr={formatTime(event.timestamp)} {...s} />
      <Text style={styles.cardAction}>{isCreated ? "⚔️ Issued a 1v1 challenge" : "⚔️ Matchup settled"}</Text>
      <View style={styles.questionBox}>
        <Text style={styles.questionText} numberOfLines={2}>{question}</Text>
        {amount > 0 && (
          <Text style={styles.priceHint}>
            {isCreated ? `$${amount.toFixed(2)} stake each` : `Winner takes $${amount.toFixed(2)}`}
          </Text>
        )}
      </View>
    </View>
  );
}

function FeedCard({ event, ...s }: { event: FeedEvent } & CardShared) {
  switch (event.type) {
    case "BET_PLACED":       return <BetPlacedCard event={event} {...s} />;
    case "PARLAY_WON":
    case "PARLAY_LOST":      return <ParlayCard event={event} {...s} />;
    case "MARKET_CREATED":   return <MarketCreatedCard event={event} {...s} />;
    case "MARKET_SETTLED":   return <MarketSettledCard event={event} {...s} />;
    case "MATCHUP_CREATED":
    case "MATCHUP_SETTLED":  return <MatchupCard event={event} {...s} />;
  }
}

// ---------------------------------------------------------------------------
// Global tab — discovery feed: grouped bets + prominent settlements
// ---------------------------------------------------------------------------

interface GroupedMarketEvent {
  market: string;
  betCount: number;
  totalUsdc: number;
  latestTimestamp: Date;
  actors: string[]; // up to 3 unique actor pubkeys for avatar stack
}

function buildDiscoveryFeed(events: FeedEvent[]): {
  grouped: GroupedMarketEvent[];
  settlements: FeedEvent[];
  created: FeedEvent[];
} {
  const grouped: Map<string, GroupedMarketEvent> = new Map();
  const settlements: FeedEvent[] = [];
  const created: FeedEvent[] = [];

  for (const ev of events) {
    if (ev.type === "MARKET_SETTLED") { settlements.push(ev); continue; }
    if (ev.type === "MARKET_CREATED") { created.push(ev); continue; }
    if (ev.type === "BET_PLACED" && ev.market) {
      const key = ev.market;
      const existing = grouped.get(key);
      if (existing) {
        existing.betCount++;
        existing.totalUsdc += ev.amountUsdc ?? 0;
        if (ev.timestamp > existing.latestTimestamp) existing.latestTimestamp = ev.timestamp;
        if (!existing.actors.includes(ev.actor.pubkey) && existing.actors.length < 3) {
          existing.actors.push(ev.actor.pubkey);
        }
      } else {
        grouped.set(key, {
          market: key,
          betCount: 1,
          totalUsdc: ev.amountUsdc ?? 0,
          latestTimestamp: ev.timestamp,
          actors: [ev.actor.pubkey],
        });
      }
    }
  }

  return {
    grouped: [...grouped.values()].sort((a, b) => b.latestTimestamp.getTime() - a.latestTimestamp.getTime()),
    settlements: settlements.slice(0, 10),
    created: created.slice(0, 10),
  };
}

function GroupedBetCard({ group, marketMeta }: {
  group: GroupedMarketEvent;
  marketMeta?: Record<string, MarketMeta>;
}) {
  const question = resolveMarket(group.market, marketMeta);
  return (
    <View style={styles.feedCard}>
      <View style={styles.groupedHeader}>
        <View style={styles.avatarStack}>
          {group.actors.slice(0, 3).map((pk, i) => (
            <View
              key={pk}
              style={[styles.stackAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: "transparent" }]}
            >
              <JerseyAvatar pubkey={pk} size={32} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupedTitle}>
            {group.betCount === 1 ? "1 bet placed" : `${group.betCount} bets placed`}
          </Text>
          <Text style={styles.actorTime}>{formatTime(group.latestTimestamp)}</Text>
        </View>
        <Text style={styles.groupedVolume}>${group.totalUsdc.toFixed(0)}</Text>
      </View>
      <View style={styles.questionBox}>
        <Text style={styles.questionText} numberOfLines={2}>{question}</Text>
      </View>
    </View>
  );
}

function DiscoveryFeed({ events, following, onToggleFollow, walletPubkey, marketMeta }: {
  events: FeedEvent[];
  following?: Set<string>;
  onToggleFollow?: (pk: string) => void;
  walletPubkey?: string | null;
  marketMeta?: Record<string, MarketMeta>;
}) {
  const { grouped, settlements, created } = useMemo(() => buildDiscoveryFeed(events), [events]);
  const shared = { following, onToggleFollow, walletPubkey, marketMeta };

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>📡</Text>
        <Text style={styles.emptyTitle}>Waiting for on-chain activity</Text>
        <Text style={styles.emptySub}>New markets, big bets and settlements stream in live</Text>
      </View>
    );
  }

  return (
    <View>
      {settlements.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>⚖️ Recent Settlements</Text>
          {settlements.map((e) => <FeedCard key={e.id} event={e} {...shared} />)}
        </>
      )}
      {created.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>🏗️ New Markets</Text>
          {created.map((e) => <FeedCard key={e.id} event={e} {...shared} />)}
        </>
      )}
      {grouped.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>🔥 Bet Activity</Text>
          {grouped.map((g) => (
            <GroupedBetCard key={g.market} group={g} marketMeta={marketMeta} />
          ))}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fans tab — merged Terrace + Polymarket users with source filter
// ---------------------------------------------------------------------------

const FAN_SOURCE_FILTERS = [
  { key: "all"        as const, label: "All Fans",   activeColor: "#818cf8", activeBg: "#1e1b4b" },
  { key: "terrace"    as const, label: "Terrace",    activeColor: "#22c55e", activeBg: "#052e16" },
  { key: "polymarket" as const, label: "Polymarket", activeColor: "#60a5fa", activeBg: "#1e3a5f" },
] as const;
type FanSourceFilter = typeof FAN_SOURCE_FILTERS[number]["key"];

const fanStyles = StyleSheet.create({
  filtersRow:           { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, gap: 6 },
  chip:                 { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  chipLabel:            { fontSize: 12, fontWeight: "600", color: "#666" },
  countBubble:          { backgroundColor: "#2a2a2a", borderRadius: 9, minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  countText:            { fontSize: 10, fontWeight: "700", color: "#666" },
  rankHint:             { fontSize: 10, color: "#4b5563", paddingHorizontal: 16, paddingBottom: 6 },
});

function SharpRow({
  sharp, isFollowed, onToggle, walletPubkey, onAvatarPress,
}: {
  sharp: MergedSharp;
  isFollowed: boolean;
  onToggle: (pk: string) => void;
  walletPubkey: string | null;
  onAvatarPress?: (pubkey: string, source: UserSource) => void;
}) {
  const bg = avatarColorFromPubkey(sharp.pubkey);
  const isSelf = walletPubkey === sharp.pubkey;
  return (
    <View style={styles.sharpRow}>
      <TouchableOpacity
        onPress={() => onAvatarPress?.(sharp.pubkey, sharp.source)}
        disabled={!onAvatarPress}
        activeOpacity={0.75}
      >
        <View style={[styles.sharpAvatar, { backgroundColor: bg }]}>
          <Text style={styles.sharpAvatarText}>{BADGE_EMOJI[sharp.badge]}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.sharpMeta}>
        <View style={styles.sharpNameRow}>
          <Text style={styles.sharpName}>{sharp.displayName}</Text>
          <SourceChip source={sharp.source} />
        </View>
        <View style={styles.sharpStats}>
          {sharp.winRate !== null && (
            <Text style={styles.sharpStat}>{Math.round(sharp.winRate * 100)}% W</Text>
          )}
          {sharp.totalBets > 0 && (
            <Text style={styles.sharpStat}>{sharp.totalBets} bets</Text>
          )}
          {sharp.pnlUsdc !== null && (
            <Text style={[styles.sharpStat, sharp.pnlUsdc >= 0 ? styles.sharpPos : styles.sharpNeg]}>
              {sharp.pnlUsdc >= 0 ? "+" : ""}${sharp.pnlUsdc.toFixed(0)} P&L
            </Text>
          )}
        </View>
      </View>
      {!isSelf && walletPubkey && (
        <FollowBtn pubkey={sharp.pubkey} isFollowed={isFollowed} onToggle={onToggle} />
      )}
    </View>
  );
}

function SharpsTab({
  merged, loading, following, onToggleFollow, walletPubkey, onAvatarPress,
}: {
  merged: MergedSharp[];
  loading: boolean;
  following: Set<string>;
  onToggleFollow: (pk: string) => void;
  walletPubkey: string | null;
  onAvatarPress?: (pubkey: string, source: UserSource) => void;
}) {
  const [fanFilter, setFanFilter] = useState<FanSourceFilter>("all");

  const terraceCount    = useMemo(() => merged.filter((s) => s.source === "terrace").length,    [merged]);
  const polymarketCount = useMemo(() => merged.filter((s) => s.source === "polymarket").length, [merged]);
  const countOf = (key: FanSourceFilter) =>
    key === "terrace" ? terraceCount : key === "polymarket" ? polymarketCount : merged.length;

  const filtered = useMemo(() => {
    const base = fanFilter === "all" ? merged
      : merged.filter((s) => s.source === fanFilter);
    return [...base].sort((a, b) => {
      if (fanFilter === "terrace")    return (b.winRate ?? 0) * b.totalBets - (a.winRate ?? 0) * a.totalBets;
      if (fanFilter === "polymarket") return (b.pnlUsdc ?? 0) - (a.pnlUsdc ?? 0);
      return b.score - a.score;
    });
  }, [merged, fanFilter]);

  const rankHintLabel =
    fanFilter === "terrace"    ? "Ranked by on-chain win rate × bets" :
    fanFilter === "polymarket" ? "Ranked by Polymarket P&L"           :
                                 "Ranked by combined score";

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color="#22c55e" />
        <Text style={styles.emptySub}>Loading community…</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Source filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fanStyles.filtersRow}>
        {FAN_SOURCE_FILTERS.map(({ key, label, activeColor, activeBg }) => {
          const isActive = fanFilter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[fanStyles.chip, isActive && { borderColor: activeColor, backgroundColor: activeBg }]}
              onPress={() => setFanFilter(key)}
              activeOpacity={0.7}
            >
              {key === "terrace"    && <TerraceMark size={11} />}
              {key === "polymarket" && <PolyJupLogos size={11} />}
              <Text style={[fanStyles.chipLabel, isActive && { color: activeColor }]}>{label}</Text>
              <View style={[fanStyles.countBubble, isActive && { backgroundColor: activeColor }]}>
                <Text style={[fanStyles.countText, isActive && { color: "#000" }]}>{countOf(key)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>No fans yet</Text>
          <Text style={styles.emptySub}>
            {fanFilter === "terrace"
              ? "Terrace users appear once markets are active"
              : fanFilter === "polymarket"
              ? "Polymarket sharps appear after more activity"
              : "Place a bet to show up on the leaderboard"}
          </Text>
        </View>
      ) : (
        <>
          <Text style={fanStyles.rankHint}>{rankHintLabel}</Text>
          {!walletPubkey && (
            <View style={styles.connectPrompt}>
              <Text style={styles.connectPromptText}>Connect wallet to follow fans</Text>
            </View>
          )}
          {filtered.map((s) => (
            <SharpRow
              key={s.pubkey}
              sharp={s}
              isFollowed={following.has(s.pubkey)}
              onToggle={onToggleFollow}
              walletPubkey={walletPubkey}
              onAvatarPress={onAvatarPress}
            />
          ))}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fan profile bottom sheet
// ---------------------------------------------------------------------------

interface ProfileTarget {
  pubkey: string;
  source: UserSource;
}

function FanProfileSheet({
  target,
  sharp,
  recentEvents,
  following,
  onToggleFollow,
  walletPubkey,
  onClose,
}: {
  target: ProfileTarget | null;
  sharp?: MergedSharp;
  recentEvents: FeedEvent[];
  following: Set<string>;
  onToggleFollow: (pk: string) => void;
  walletPubkey: string | null;
  onClose: () => void;
}) {
  if (!target) return null;
  const { pubkey, source } = target;
  const bg = avatarColorFromPubkey(pubkey);
  const isFollowed = following.has(pubkey);
  const isSelf = walletPubkey === pubkey;

  const winRate = sharp?.winRate ?? null;
  const totalBets = sharp?.totalBets ?? 0;
  const pnl = sharp?.pnlUsdc ?? null;
  const badge = sharp?.badge ?? "Casual";

  const userEvents = recentEvents.slice(0, 5);

  function activityLabel(ev: FeedEvent): string {
    const amt = (ev.amountUsdc ?? 0);
    const fmtAmt = amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(2);
    switch (ev.type) {
      case "BET_PLACED":      return `Backed ${ev.outcome ?? "?"} for $${fmtAmt}`;
      case "PARLAY_WON":      return `Hit a ${ev.legs?.length ?? "?"}-leg parlay 🔥`;
      case "PARLAY_LOST":     return `Missed a ${ev.legs?.length ?? "?"}-leg parlay`;
      case "MATCHUP_CREATED": return `Issued a 1v1 challenge · $${fmtAmt} stake`;
      case "MATCHUP_SETTLED": return `Won a 1v1 matchup · $${fmtAmt}`;
      case "MARKET_CREATED":  return "Opened a new prediction market";
      case "MARKET_SETTLED":  return "Settled a market";
      default: return ev.type;
    }
  }

  function activityIcon(ev: FeedEvent): string {
    switch (ev.type) {
      case "BET_PLACED":      return "🎯";
      case "PARLAY_WON":      return "🔥";
      case "PARLAY_LOST":     return "💸";
      case "MATCHUP_CREATED": return "⚔️";
      case "MATCHUP_SETTLED": return "🏆";
      case "MARKET_CREATED":  return "🏗️";
      case "MARKET_SETTLED":  return "⚖️";
      default: return "📋";
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Dimmed backdrop — tap to close */}
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        {/* Sheet panel — stop press propagation */}
        <Pressable style={sheetStyles.container} onPress={() => {}}>
          <View style={sheetStyles.handle} />

          {/* ── Header ── */}
          <View style={sheetStyles.header}>
            <JerseyAvatar pubkey={pubkey} size={56} />
            <View style={sheetStyles.headerMeta}>
              <View style={sheetStyles.nameRow}>
                <Text style={sheetStyles.badgeEmoji}>{BADGE_EMOJI[badge]}</Text>
                <Text style={sheetStyles.name}>{truncatePubkey(pubkey)}</Text>
              </View>
              <SourceChip source={source} />
            </View>
            {!isSelf && walletPubkey && (
              <FollowBtn pubkey={pubkey} isFollowed={isFollowed} onToggle={onToggleFollow} />
            )}
          </View>

          {/* ── Stats grid ── */}
          {(winRate !== null || totalBets > 0 || pnl !== null) && (
            <View style={sheetStyles.statsRow}>
              {winRate !== null && (
                <View style={sheetStyles.statBox}>
                  <Text style={sheetStyles.statVal}>{Math.round(winRate * 100)}%</Text>
                  <Text style={sheetStyles.statLabel}>Win Rate</Text>
                </View>
              )}
              {totalBets > 0 && (
                <View style={sheetStyles.statBox}>
                  <Text style={sheetStyles.statVal}>{totalBets}</Text>
                  <Text style={sheetStyles.statLabel}>Bets</Text>
                </View>
              )}
              {pnl !== null && (
                <View style={sheetStyles.statBox}>
                  <Text style={[sheetStyles.statVal, pnl >= 0 ? sheetStyles.posVal : sheetStyles.negVal]}>
                    {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(0)}
                  </Text>
                  <Text style={sheetStyles.statLabel}>P&L</Text>
                </View>
              )}
              {source === "terrace" && winRate !== null && totalBets > 0 && (
                <View style={sheetStyles.statBox}>
                  <Text style={sheetStyles.statVal}>{(winRate * totalBets).toFixed(0)}</Text>
                  <Text style={sheetStyles.statLabel}>Score</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Recent on-chain activity ── */}
          <Text style={sheetStyles.sectionTitle}>Recent Activity</Text>
          {userEvents.length === 0 ? (
            <View style={sheetStyles.noActivity}>
              <Text style={sheetStyles.noActivityText}>No recent activity in the live feed</Text>
            </View>
          ) : (
            userEvents.map((ev) => (
              <View key={ev.id} style={sheetStyles.activityRow}>
                <Text style={sheetStyles.activityIcon}>{activityIcon(ev)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={sheetStyles.activityText} numberOfLines={1}>
                    {activityLabel(ev)}
                  </Text>
                  <Text style={sheetStyles.activityTime}>{formatTime(ev.timestamp)}</Text>
                </View>
                {ev.type === "BET_PLACED" && ev.outcome && (
                  <OutcomePill outcome={ev.outcome} />
                )}
              </View>
            ))
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  container:  { backgroundColor: "#111", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44, gap: 14 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: "#333", alignSelf: "center", marginBottom: 6 },

  header:     { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:     { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontWeight: "700", color: "#fff" },
  headerMeta: { flex: 1, gap: 5 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeEmoji: { fontSize: 15 },
  name:       { fontSize: 16, fontWeight: "700", color: "#fff" },

  statsRow:  { flexDirection: "row", gap: 8 },
  statBox:   { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 12, padding: 12, alignItems: "center", gap: 3 },
  statVal:   { fontSize: 18, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#6b7280", fontWeight: "500", textAlign: "center" },
  posVal:    { color: "#22c55e" },
  negVal:    { color: "#ef4444" },

  sectionTitle:    { fontSize: 10, fontWeight: "700", color: "#4b5563", letterSpacing: 0.7, textTransform: "uppercase" },
  activityRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: "#1e1e1e" },
  activityIcon:    { fontSize: 16, width: 24, textAlign: "center" },
  activityText:    { fontSize: 13, color: "#e5e7eb", fontWeight: "500" },
  activityTime:    { fontSize: 10, color: "#555", marginTop: 1 },
  noActivity:      { alignItems: "center", paddingVertical: 18 },
  noActivityText:  { fontSize: 12, color: "#4b5563" },
});

// ---------------------------------------------------------------------------
// Feed tabs
// ---------------------------------------------------------------------------

const FEED_TABS = [
  { key: "following", label: "Following" },
  { key: "global",    label: "Discover"  },
  { key: "sharps",    label: "Fans"      },
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
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);

  const { events: liveEvents, connected } = useHeliusEvents(200);
  const { following, toggle: toggleFollow, loaded: followsLoaded } = useFollowing(walletPubkey);
  const { fans: terraceUsers, loading: terraceLoading, refresh: refreshTerrace } = useTerraceUsers();
  const { entries: jupiterEntries, loading: jupiterLoading, refresh: refreshJupiter } = useLeaderboard("weekly");

  // Merge Terrace + Jupiter/Polymarket users; Terrace takes priority for duplicate pubkeys
  const mergedSharps = useMemo<MergedSharp[]>(() => {
    const map = new Map<string, MergedSharp>();

    // Terrace users first (higher priority)
    for (const fan of terraceUsers) {
      map.set(fan.pubkey, {
        pubkey: fan.pubkey,
        displayName: fan.displayName,
        winRate: fan.winRate,
        totalBets: fan.totalBets,
        pnlUsdc: null,
        badge: fan.badge,
        source: "terrace",
        score: fan.score,
      });
    }
    // Jupiter/Polymarket — only add if not already a Terrace user
    for (const entry of jupiterEntries) {
      if (map.has(entry.pubkey)) continue;
      map.set(entry.pubkey, {
        pubkey: entry.pubkey,
        displayName: entry.displayName,
        winRate: entry.winRate,
        totalBets: 0,
        pnlUsdc: entry.pnlUsdc,
        badge: entry.badge,
        source: "polymarket",
        score: (entry.winRate ?? 0) * (entry.volumeUsdc ?? 0) / 1_000,
      });
    }

    return [...map.values()].sort((a, b) => b.score - a.score);
  }, [terraceUsers, jupiterEntries]);

  // Collect all unique market addresses so we can resolve questions
  const allMarketAddresses = useMemo(
    () => [...new Set(liveEvents.map((e) => e.market).filter(Boolean) as string[])],
    [liveEvents]
  );
  const marketMeta = useMarketQuestions(allMarketAddresses);

  const liveFeed = useMemo(() => liveEvents.map(liveEventToFeed), [liveEvents]);

  const followingFeed = useMemo(() => {
    if (!walletPubkey || !followsLoaded || following.size === 0) return [];
    return liveFeed.filter((e) => following.has(e.actor.pubkey));
  }, [liveFeed, following, followsLoaded, walletPubkey]);

  const openProfile = useCallback((pubkey: string, source: UserSource) => {
    setProfileTarget({ pubkey, source });
  }, []);

  const profileSharp = useMemo(
    () => (profileTarget ? mergedSharps.find((s) => s.pubkey === profileTarget.pubkey) : undefined),
    [profileTarget, mergedSharps]
  );

  const profileEvents = useMemo(
    () => (profileTarget ? liveFeed.filter((e) => e.actor.pubkey === profileTarget.pubkey) : []),
    [profileTarget, liveFeed]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    refreshTerrace();
    refreshJupiter();
    setTimeout(() => setRefreshing(false), 900);
  };

  const followingCount = following.size;
  const sharpsLoading = terraceLoading || jupiterLoading;

  // Tail / fade — copy a fan's call (or take the other side) via the shared bet sheet.
  const { status: betStatus, txSignature, error: betError, placeBet, reset: resetBet } = usePlaceBet();
  const [selectedBet, setSelectedBet] = useState<{ marketId: string; label: string; isYes: boolean; yesPrice: number | null; question: string | null } | null>(null);

  const handleTail = useCallback((event: FeedEvent, isYes: boolean) => {
    if (!event.market) return;
    const fanTookYes = event.outcome?.toLowerCase() === "yes";
    const yesAbs = event.priceAtBet !== undefined ? (fanTookYes ? event.priceAtBet : 1 - event.priceAtBet) : null;
    const sidePrice = yesAbs === null ? null : (isYes ? yesAbs : 1 - yesAbs);
    resetBet();
    setSelectedBet({
      marketId: event.market,
      label: isYes ? "YES" : "NO",
      isYes,
      yesPrice: sidePrice,
      question: resolveMarket(event.market, marketMeta),
    });
  }, [marketMeta, resetBet]);

  const handleConfirmBet = useCallback(async (amountUsdc: number, isYes: boolean) => {
    if (!selectedBet) return;
    await placeBet({ marketId: selectedBet.marketId, isYes, amountUsdc, source: "native" });
  }, [selectedBet, placeBet]);

  const handleDismissBet = useCallback(() => { resetBet(); setSelectedBet(null); }, [resetBet]);

  const shared = { following, onToggleFollow: walletPubkey ? toggleFollow : undefined, walletPubkey, marketMeta, onAvatarPress: openProfile, onTail: walletPubkey ? handleTail : undefined };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Feed</Text>
        <View style={[styles.livePill, connected ? styles.livePillOn : styles.livePillOff]}>
          <HeliusMark size={14} />
          <View style={[styles.liveDot, connected ? styles.liveDotOn : styles.liveDotOff]} />
          <Text style={[styles.livePillText, connected ? styles.livePillTextOn : styles.livePillTextOff]}>
            {connected ? "Live" : "Connecting…"}
          </Text>
        </View>
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
              {key === "following" && followingCount > 0 ? ` ${followingCount}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.feed}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#22c55e" />}
      >
        {activeTab === "sharps" ? (
          <SharpsTab
            merged={mergedSharps}
            loading={sharpsLoading}
            following={following}
            onToggleFollow={toggleFollow}
            walletPubkey={walletPubkey}
            onAvatarPress={openProfile}
          />
        ) : activeTab === "following" ? (
          !walletPubkey ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✈️</Text>
              <Text style={styles.emptyTitle}>Connect to see your feed</Text>
              <Text style={styles.emptySub}>Follow fans and see their bets in real time</Text>
            </View>
          ) : followsLoaded && followingCount === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>Not following anyone yet</Text>
              <Text style={styles.emptySub}>Head to the Fans tab to follow top predictors</Text>
              <TouchableOpacity style={styles.goToFansBtn} onPress={() => setActiveTab("sharps")}>
                <Text style={styles.goToFansBtnText}>Browse Fans</Text>
              </TouchableOpacity>
            </View>
          ) : followingFeed.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptySub}>Bets from people you follow will appear here live</Text>
            </View>
          ) : (
            followingFeed.map((event) => <FeedCard key={event.id} event={event} {...shared} />)
          )
        ) : (
          // Global / Discover tab
          <DiscoveryFeed events={liveFeed} {...shared} />
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <FanProfileSheet
        target={profileTarget}
        sharp={profileSharp}
        recentEvents={profileEvents}
        following={following}
        onToggleFollow={toggleFollow}
        walletPubkey={walletPubkey}
        onClose={() => setProfileTarget(null)}
      />

      {/* Tail bet sheet — pre-committed to the tailed/faded side */}
      {selectedBet && (
        <View style={styles.betOverlay}>
          <Pressable style={styles.betBackdrop} onPress={handleDismissBet} />
          <BetSheet
            marketId={selectedBet.marketId}
            outcomeLabel={selectedBet.label}
            marketQuestion={selectedBet.question ?? undefined}
            source="native"
            isYes={selectedBet.isYes}
            yesPrice={selectedBet.yesPrice}
            onConfirm={handleConfirmBet}
            onDismiss={handleDismissBet}
            status={betStatus}
            txSignature={txSignature}
            error={betError}
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

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  headerTitle: { fontFamily: TF.condBold, fontSize: 23, fontWeight: "700", color: "#fff", letterSpacing: 0.2, textTransform: "uppercase" },

  livePill:       { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  livePillOn:     { backgroundColor: "#052e16" },
  livePillOff:    { backgroundColor: "#1a1a1a" },
  liveDot:        { width: 6, height: 6, borderRadius: 3 },
  liveDotOn:      { backgroundColor: "#22c55e" },
  liveDotOff:     { backgroundColor: "#6b7280" },
  livePillText:   { fontSize: 10, fontWeight: "600" },
  livePillTextOn: { color: "#22c55e" },
  livePillTextOff:{ color: "#6b7280" },

  tabBar:        { flexDirection: "row", gap: 4, marginHorizontal: 18, marginVertical: 12, backgroundColor: "#111", borderRadius: 14, padding: 4, borderWidth: 0.5, borderColor: "#1e1e1e" },
  tab:           { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  tabActive:     { backgroundColor: "#22c55e" },
  tabText:       { fontFamily: TF.sansSemi, fontSize: 12.5, fontWeight: "600", color: "#6b7280" },
  tabTextActive: { color: "#000", fontFamily: TF.sansBold, fontWeight: "700" },

  feed: { flex: 1 },

  sectionHeader: { fontSize: 11, fontWeight: "700", color: "#4b5563", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6 },

  // Feed cards
  feedCard: { backgroundColor: "#111", borderRadius: 16, marginHorizontal: 14, marginBottom: 10, padding: 14, borderWidth: 0.5, borderColor: "#1e1e1e", gap: 8 },
  cardWon:     { borderColor: "#166534", backgroundColor: "#0c1f14" },
  cardLost:    { borderColor: "#7f1d1d" },
  cardSettled: { borderColor: "#854d0e", backgroundColor: "#111" },

  // Actor row
  actorRow:       { flexDirection: "row", alignItems: "center", gap: 10 },
  actorAvatar:    { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  actorAvatarText:{ fontSize: 13, fontWeight: "700", color: "#fff" },
  actorMeta:      { flex: 1 },
  actorNameRow:   { flexDirection: "row", alignItems: "center", gap: 4 },
  actorBadge:     { fontSize: 11 },
  actorName:      { fontFamily: TF.sansSemi, fontSize: 14, fontWeight: "600", color: TC.ink },
  actorTime:      { fontFamily: TF.sans, fontSize: 11.5, color: TC.ink3, marginTop: 1 },

  // Feed card (sportsbook)
  feedTop:      { flexDirection: "row", alignItems: "center", gap: 8 },
  feedLine:     { fontFamily: TF.sans, fontSize: 13.5, color: TC.ink2, lineHeight: 19, marginTop: 8 },
  feedLineBold: { fontFamily: TF.sansSemi, fontWeight: "600", color: TC.ink },
  copyRow:      { flexDirection: "row", gap: 6, marginTop: 10 },

  // Follow button
  followBtn:           { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: "#22c55e" },
  followBtnActive:     { backgroundColor: "#052e16" },
  followBtnText:       { fontSize: 11, fontWeight: "600", color: "#22c55e" },
  followBtnTextActive: { color: "#4ade80" },

  cardAction: { fontSize: 11, color: "#6b7280" },

  betDetail:      { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10 },
  betDetailLeft:  { flex: 1 },
  betDetailRight: { alignItems: "flex-end" },
  betMarket:      { fontSize: 12, color: "#9ca3af" },
  betOutcome:     { fontSize: 14, fontWeight: "600", color: "#fff", marginTop: 2 },
  betAmount:      { fontSize: 14, fontWeight: "700", color: "#22c55e" },
  betPrice:       { fontSize: 10, color: "#888", marginTop: 1 },

  // Bet sentence row (BetPlacedCard)
  betSentenceRow:    { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2 },
  betSentence:       { fontSize: 13, color: "#9ca3af" },
  betAmountInline:   { fontSize: 13, fontWeight: "700", color: "#22c55e" },

  // Market question box (shared across cards)
  questionBox:  { backgroundColor: "#0d0d0d", borderWidth: 0.5, borderColor: "#1a1a1a", borderRadius: 12, padding: 11, gap: 4 },
  questionText: { fontSize: 13, fontWeight: "600", color: "#f9fafb", lineHeight: 18 },
  priceHint:    { fontSize: 11, color: "#6b7280" },

  // Outcome pill (YES/NO)
  outcomePill:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 0.5 },
  yesPill:         { backgroundColor: "#052e16", borderColor: "#14532d" },
  noPill:          { backgroundColor: "#3b0a0a", borderColor: "#7f1d1d" },
  outcomePillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // Tail / fade actions on bet cards
  tailRow:      { flexDirection: "row", gap: 8, marginTop: 2 },
  tailBtn:      { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12 },
  tailBack:     { backgroundColor: "#22c55e" },
  tailBackText: { fontSize: 12, fontWeight: "800", color: "#000" },
  tailFade:     { backgroundColor: "#1a0a0a", borderWidth: 0.5, borderColor: "#7f1d1d" },
  tailFadeText: { fontSize: 12, fontWeight: "800", color: "#f87171" },

  // Tail bet sheet overlay
  betOverlay:  { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" },
  betBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },

  parlayHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  parlayProfit:  { fontSize: 15, fontWeight: "700", color: "#4ade80" },
  parlayLegs:    { gap: 4 },
  parlayLeg:     { flexDirection: "row", alignItems: "center", gap: 6 },
  parlayLegDot:  { fontSize: 11, width: 14 },
  parlayLegText: { fontSize: 12, fontWeight: "500" },
  legWon:        { color: "#d1fae5" },
  legLost:       { color: "#fecaca" },
  parlayStake:   { fontSize: 10, color: "#555" },

  createdMarket:  { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10 },
  createdMarketQ: { fontSize: 13, fontWeight: "500", color: "#e5e7eb", fontStyle: "italic" },

  settledMarket:      { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 10, gap: 4 },
  settledMarketQ:     { fontSize: 12, color: "#9ca3af" },
  settledOutcomeRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  settledOutcomeLabel:{ fontSize: 11, color: "#6b7280" },
  settledOutcome:     { fontSize: 13, fontWeight: "700", color: "#f59e0b" },

  // Grouped bet card (Discovery)
  groupedHeader:   { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarStack:     { flexDirection: "row", alignItems: "center" },
  stackAvatar:     { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#0a0a0a" },
  stackAvatarText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  groupedTitle:    { fontSize: 13, fontWeight: "600", color: "#f9fafb" },
  groupedVolume:   { fontSize: 13, fontWeight: "700", color: "#22c55e" },

  // Sharps / Fans
  sharpRow:       { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#111", borderRadius: 12, marginHorizontal: 14, marginBottom: 8, padding: 12 },
  sharpAvatar:    { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  sharpAvatarText:{ fontSize: 16 },
  sharpMeta:      { flex: 1, gap: 3 },
  sharpNameRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  sharpName:      { fontSize: 13, fontWeight: "600", color: "#f9fafb" },
  sharpStats:     { flexDirection: "row", gap: 8 },
  sharpStat:      { fontSize: 11, color: "#6b7280" },
  sharpPos:       { color: "#22c55e" },
  sharpNeg:       { color: "#ef4444" },

  connectPrompt:     { backgroundColor: "#1a1a1a", borderRadius: 10, marginHorizontal: 14, marginBottom: 10, padding: 12, alignItems: "center" },
  connectPromptText: { fontSize: 12, color: "#6b7280" },

  empty:      { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#fff" },
  emptySub:   { fontSize: 13, color: "#6b7280", textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },

  goToFansBtn:     { marginTop: 8, backgroundColor: "#22c55e", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  goToFansBtnText: { fontSize: 13, fontWeight: "700", color: "#000" },
});

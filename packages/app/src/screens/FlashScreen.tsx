import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
} from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional, moneyWhole } from "../utils/format";
import { identityOf, avatarColorOf } from "../utils/identity";
import { useServerTime, msUntil } from "../hooks/useServerTime";
import { useLiveFixtures } from "../hooks/useLiveFixtures";
import { InPlayCarousel } from "../components/InPlayCarousel";
import { OddsButton, Badge, CTA } from "../components/ui";
import { Icon } from "../components/Icon";

// ---------------------------------------------------------------------------
// Flash — the live surface.
//
// Flash markets only make sense while a match is happening ("next goal before
// 70'", "Saka to score in the second half"), so this screen puts the live
// scoreboard and the short-fuse markets on one page. Everything here is
// governed by a clock:
//
//   - countdowns tick from cluster time, not the device (see useServerTime)
//   - at T-0 a card locks in place: odds disabled, CLOSED badge, no tap-through
//
// Locking rather than removing is deliberate. A card that vanishes mid-tap
// feels like a bug and loses the user the context of what they were about to
// back; a card that greys out and says CLOSED explains itself.
// ---------------------------------------------------------------------------

/** Urgency threshold — under a minute the countdown goes red and pulses copy. */
const URGENT_MS = 60_000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "CLOSED";
  const total = Math.floor(ms / 1_000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Ticking remaining-time on the trusted clock. One interval per card is fine at
 * flash volumes and keeps each countdown independent of the list re-rendering.
 */
function useRemaining(expiry: Date | null): number {
  const [ms, setMs] = useState(() => msUntil(expiry));
  useEffect(() => {
    setMs(msUntil(expiry));
    const id = setInterval(() => setMs(msUntil(expiry)), 1_000);
    return () => clearInterval(id);
  }, [expiry]);
  return ms;
}

function FlashCard({
  market,
  onOpen,
  onBack,
  onFade,
}: {
  market: UnifiedMarket;
  onOpen: () => void;
  onBack: () => void;
  onFade: () => void;
}) {
  const remaining = useRemaining(market.expiry);
  const locked = remaining <= 0;
  const urgent = !locked && remaining <= URGENT_MS;
  const noProb =
    market.noPrice > 0 ? market.noPrice : market.yesPrice > 0 ? 1 - market.yesPrice : null;
  const creator = market.creator ? identityOf(market.creator) : null;

  return (
    <Pressable style={[s.card, locked && s.cardLocked]} onPress={locked ? undefined : onOpen}>
      <View style={s.cardTop}>
        <View style={[s.flashPill, urgent && s.flashPillUrgent]}>
          <Icon name="bolt" size={12} color={urgent ? C.redInk : C.amberInk} />
          <Text style={[s.flashPillTxt, urgent && s.flashPillTxtUrgent]}>FLASH</Text>
        </View>
        {market.isPrivate && <Badge tone="private" label="Private" icon="lock" />}
        <View style={{ flex: 1 }} />
        <Text style={[s.clock, urgent && s.clockUrgent, locked && s.clockLocked]}>
          {formatRemaining(remaining)}
        </Text>
      </View>

      <Text style={s.question} numberOfLines={3}>
        {market.question}
      </Text>

      <View style={s.odds}>
        <OddsButton
          label="Back"
          tone="yes"
          value={probToFractional(market.yesPrice)}
          disabled={locked}
          onPress={onBack}
        />
        <OddsButton
          label="Fade"
          tone="no"
          value={probToFractional(noProb)}
          disabled={locked}
          onPress={onFade}
        />
      </View>

      <View style={s.cardFoot}>
        {market.totalVolumeUsdc > 0 && (
          <Text style={s.matched}>MATCHED {moneyWhole(market.totalVolumeUsdc)}</Text>
        )}
        {creator && market.creator && (
          <View style={s.creator}>
            <View style={[s.monogram, { backgroundColor: avatarColorOf(market.creator) }]}>
              <Text style={s.monogramTxt}>{creator.monogram}</Text>
            </View>
            <Text style={s.creatorName}>{creator.handle}</Text>
          </View>
        )}
        {locked && <Text style={s.lockedTag}>AWAITING SETTLEMENT</Text>}
      </View>
    </Pressable>
  );
}

interface Props {
  markets: UnifiedMarket[];
  onSelectMarket: (id: string) => void;
  /** Open the bet slip pre-committed to a side. */
  onBet?: (market: UnifiedMarket, isYes: boolean) => void;
  onCreateFlash?: () => void;
  onRefreshMarkets?: () => void;
  onClose?: () => void;
}

export function FlashScreen({
  markets,
  onSelectMarket,
  onBet,
  onCreateFlash,
  onRefreshMarkets,
  onClose,
}: Props) {
  useServerTime();
  const { fixtures } = useLiveFixtures();
  const [refreshing, setRefreshing] = useState(false);

  // Flash markets the chain still calls Open, soonest first. A market whose
  // deadline has passed stays in the list — locked — until settlement moves it
  // out, so the user can see what they were watching resolve.
  const flash = useMemo(
    () =>
      markets
        .filter((m) => m.isFlash && m.status === "Open")
        .sort((a, b) => (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0)),
    [markets],
  );

  const handleRefresh = () => {
    setRefreshing(true);
    onRefreshMarkets?.();
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <View style={s.screen}>
      <ScrollView
        style={s.root}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.green}
            colors={[C.green]}
          />
        }
      >
        <View style={s.header}>
          {onClose && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.backBtnTxt}>← Back</Text>
            </TouchableOpacity>
          )}
          <View style={s.titleRow}>
            <Text style={s.title}>Flash</Text>
            {fixtures.length > 0 && (
              <View style={s.liveCount}>
                <View style={s.liveDot} />
                <Text style={s.liveCountTxt}>{fixtures.length} live</Text>
              </View>
            )}
          </View>
          <Text style={s.subtitle}>
            Short-fuse markets on matches in play. Odds lock the second the clock hits zero.
          </Text>
        </View>

        {/* Live scoreboard — the context the markets below are priced against. */}
        <InPlayCarousel markets={markets} onSelectMarket={onSelectMarket} limit={12} bare />

        <View style={s.boardHead}>
          <Text style={s.boardTitle}>OPEN NOW</Text>
          {flash.length > 0 && <Text style={s.boardCount}>{flash.length}</Text>}
        </View>

        {flash.length === 0 ? (
          <View style={s.empty}>
            <Icon name="bolt" size={30} color={C.ink4} />
            <Text style={s.emptyTitle}>NO FLASH MARKETS RIGHT NOW</Text>
            <Text style={s.emptySub}>
              {fixtures.length > 0
                ? "There are matches on — open a flash market and let the terrace price it."
                : "Flash markets run during matches. Check back at kick-off."}
            </Text>
            {onCreateFlash && (
              <View style={s.emptyCta}>
                <CTA label="Create a flash market" icon="plus" onPress={onCreateFlash} />
              </View>
            )}
          </View>
        ) : (
          <View style={s.board}>
            {flash.map((m) => (
              <FlashCard
                key={m.id}
                market={m}
                onOpen={() => onSelectMarket(m.id)}
                onBack={() => (onBet ? onBet(m, true) : onSelectMarket(m.id))}
                onFade={() => (onBet ? onBet(m, false) : onSelectMarket(m.id))}
              />
            ))}
          </View>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  root: { flex: 1 },

  // Full-screen overlays sit above the app's SafeAreaView padding, so the
  // status bar has to be cleared here or "← Back" crowds the clock.
  header: {
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight ?? 0) + 18,
    paddingBottom: 14,
  },
  backBtn: { marginBottom: 10 },
  backBtnTxt: { fontFamily: font.sansSemi, fontSize: 13, color: C.green, fontWeight: "600" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    fontFamily: font.condXBold,
    fontSize: 30,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  liveCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.redMid,
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.redInk },
  liveCountTxt: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", color: C.redInk },
  subtitle: { fontFamily: font.sans, fontSize: 13, color: C.ink3, marginTop: 5, lineHeight: 18 },

  boardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  boardTitle: {
    fontFamily: font.condBold,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: C.ink,
  },
  boardCount: { fontFamily: font.sansSemi, fontSize: 12, fontWeight: "600", color: C.ink4 },

  board: { paddingHorizontal: 16, gap: 10 },

  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.amberDeep,
    borderRadius: radius.lg,
    padding: 14,
    gap: 11,
  },
  cardLocked: { opacity: 0.55, borderColor: C.lineSoft },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  flashPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.amberDeep,
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  flashPillUrgent: { backgroundColor: C.redMid },
  flashPillTxt: {
    fontFamily: font.sansBold,
    fontSize: 10,
    fontWeight: "700",
    color: C.amberInk,
    letterSpacing: 0.4,
  },
  flashPillTxtUrgent: { color: C.redInk },
  clock: {
    fontFamily: font.condBold,
    fontSize: 20,
    fontWeight: "700",
    color: C.amber,
    letterSpacing: 0.6,
  },
  clockUrgent: { color: C.red },
  clockLocked: { color: C.ink4, fontSize: 14 },

  question: {
    fontFamily: font.condBold,
    fontSize: 17,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    lineHeight: 21,
  },
  odds: { flexDirection: "row", gap: 6 },

  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10 },
  matched: {
    fontFamily: font.sansSemi,
    fontSize: 10.5,
    fontWeight: "600",
    color: C.ink3,
    letterSpacing: 0.4,
  },
  lockedTag: {
    fontFamily: font.sansBold,
    fontSize: 9.5,
    fontWeight: "700",
    color: C.ink4,
    letterSpacing: 0.6,
    marginLeft: "auto",
  },
  creator: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
  monogram: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramTxt: { fontFamily: font.condBold, fontSize: 8.5, fontWeight: "700", color: "#fff" },
  creatorName: { fontFamily: font.sansSemi, fontSize: 10.5, fontWeight: "600", color: C.ink2 },

  empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 40, gap: 8 },
  emptyTitle: {
    fontFamily: font.condBold,
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: 0.4,
    marginTop: 4,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: font.sans,
    fontSize: 13,
    color: C.ink3,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyCta: { alignSelf: "stretch", marginTop: 14 },
});

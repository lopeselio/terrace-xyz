import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import type { LiveFixture } from "@terrace/sdk";
import { useLiveFixtures } from "../hooks/useLiveFixtures";
import { matchMarketsToFixtures } from "../utils/fixtureMatch";
import { splitEventTitle, marketTitle } from "../utils/football";
import { probToFractional, moneyWhole } from "../utils/format";
import { color as C, font, radius } from "../theme/tokens";
import { TeamBadge } from "../screens/MatchGroupCard";
import { OddsButton } from "./ui";
import { Icon } from "./Icon";

// ---------------------------------------------------------------------------
// "In-play now" — the live board.
//
// Football is watched, not browsed: the thing a fan wants at 3:47pm on a
// Saturday is the match that's on right now and a price on it. This carousel
// leads with the scoreline and minute, and attaches Back/Fade odds when we hold
// a market for that fixture.
//
// Fixtures with no market still appear, greyed, with a "no market" line. That's
// deliberate — a live board that hides matches reads as broken, and an empty
// slot is a prompt to create the market from the + tab.
// ---------------------------------------------------------------------------

/**
 * Fixture -> market, resolved across the whole board at once. Matching can't be
 * done per-card: deciding whether a one-sided name match is unambiguous needs
 * to see every live fixture together (see matchMarketsToFixtures).
 */
function useFixtureMarkets(
  fixtures: LiveFixture[],
  markets: UnifiedMarket[],
): Map<number, UnifiedMarket> {
  return useMemo(() => {
    const h2h = markets
      .map((m) => ({ market: m, sides: splitEventTitle(marketTitle(m)) as [string, string] }))
      .filter((x) => !!x.sides[1]); // head-to-heads only

    const index = matchMarketsToFixtures(
      fixtures,
      h2h.map((x) => ({
        status: x.market.status,
        totalVolumeUsdc: x.market.totalVolumeUsdc,
        sides: x.sides,
      })),
    );

    const out = new Map<number, UnifiedMarket>();
    for (const [fixtureId, marketIdx] of index) out.set(fixtureId, h2h[marketIdx].market);
    return out;
  }, [fixtures, markets]);
}

function minuteLabel(f: LiveFixture): string {
  if (f.statusShort === "HT") return "HT";
  if (f.statusShort === "P") return "PENS";
  if (f.elapsed == null) return "LIVE";
  return f.statusShort === "ET" ? `${f.elapsed}'ET` : `${f.elapsed}'`;
}

function FixtureCard({
  fixture,
  market,
  onPress,
}: {
  fixture: LiveFixture;
  market: UnifiedMarket | null;
  onPress?: (marketId: string, side?: boolean) => void;
}) {
  const noProb =
    market == null
      ? null
      : market.noPrice > 0
        ? market.noPrice
        : market.yesPrice > 0
          ? 1 - market.yesPrice
          : null;

  return (
    <Pressable
      style={[s.card, !market && s.cardIdle]}
      onPress={market && onPress ? () => onPress(market.id) : undefined}
    >
      <View style={s.head}>
        <View style={s.livePill}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>{minuteLabel(fixture)}</Text>
        </View>
        <Text style={s.comp} numberOfLines={1}>
          {fixture.league.name}
        </Text>
      </View>

      <View style={s.score}>
        <View style={s.side}>
          <TeamBadge name={fixture.home.name} size={30} />
          <Text style={s.team} numberOfLines={1}>
            {fixture.home.name}
          </Text>
        </View>
        <Text style={s.goals}>
          {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0}
        </Text>
        <View style={s.side}>
          <TeamBadge name={fixture.away.name} size={30} />
          <Text style={s.team} numberOfLines={1}>
            {fixture.away.name}
          </Text>
        </View>
      </View>

      {market ? (
        <>
          <Text style={s.call} numberOfLines={2}>
            {market.question}
          </Text>
          <View style={s.odds}>
            <OddsButton
              label="Back"
              tone="yes"
              value={probToFractional(market.yesPrice)}
              onPress={onPress ? () => onPress(market.id, true) : undefined}
            />
            <OddsButton
              label="Fade"
              tone="no"
              value={probToFractional(noProb)}
              onPress={onPress ? () => onPress(market.id, false) : undefined}
            />
          </View>
          {market.totalVolumeUsdc > 0 && (
            <Text style={s.matched}>MATCHED {moneyWhole(market.totalVolumeUsdc)}</Text>
          )}
        </>
      ) : (
        <View style={s.noMarket}>
          <Icon name="plus" size={13} color={C.ink3} />
          <Text style={s.noMarketTxt}>No market yet — create one</Text>
        </View>
      )}
    </Pressable>
  );
}

interface Props {
  markets: UnifiedMarket[];
  onSelectMarket?: (id: string, side?: boolean) => void;
  /** Cap the number of cards. Home shows a taste; Flash shows the full board. */
  limit?: number;
  /** Hide the section header (the Flash screen supplies its own). */
  bare?: boolean;
}

export function InPlayCarousel({ markets, onSelectMarket, limit = 8, bare }: Props) {
  const { fixtures, loading, budgetSpent } = useLiveFixtures();
  const fixtureMarkets = useFixtureMarkets(fixtures, markets);

  const cards = useMemo(
    () =>
      fixtures
        .slice(0, limit)
        .map((f) => ({ fixture: f, market: fixtureMarkets.get(f.fixtureId) ?? null })),
    [fixtures, fixtureMarkets, limit],
  );

  // Nothing in play is the normal state most of the week — render nothing
  // rather than an empty shell that implies something is broken.
  if (cards.length === 0) return null;

  return (
    <View style={s.section}>
      {!bare && (
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>IN-PLAY NOW</Text>
          <View style={s.count}>
            <View style={s.liveDot} />
            <Text style={s.countTxt}>{fixtures.length} live</Text>
          </View>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {cards.map(({ fixture, market }) => (
          <FixtureCard
            key={fixture.fixtureId}
            fixture={fixture}
            market={market}
            onPress={onSelectMarket}
          />
        ))}
      </ScrollView>
      {budgetSpent && !loading && (
        <Text style={s.frozen}>Live scores paused — daily data limit reached</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 6 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: font.condBold,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: C.ink,
  },
  count: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
    backgroundColor: C.redMid,
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countTxt: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", color: C.redInk },

  row: { paddingHorizontal: 16, gap: 10, paddingBottom: 6 },

  card: {
    width: 244,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: radius.lg,
    padding: 13,
    gap: 10,
  },
  cardIdle: { opacity: 0.62 },

  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.red,
    borderRadius: radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveTxt: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", color: "#fff" },
  comp: { flex: 1, fontFamily: font.sans, fontSize: 11, fontWeight: "600", color: C.ink3 },

  score: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  side: { flex: 1, alignItems: "center", gap: 5 },
  team: {
    fontFamily: font.sansSemi,
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
    textAlign: "center",
  },
  goals: {
    fontFamily: font.condXBold,
    fontSize: 26,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  call: {
    fontFamily: font.condBold,
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  odds: { flexDirection: "row", gap: 6 },
  matched: {
    fontFamily: font.sansSemi,
    fontSize: 10.5,
    fontWeight: "600",
    color: C.ink3,
    letterSpacing: 0.4,
  },

  noMarket: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  noMarketTxt: { fontFamily: font.sans, fontSize: 12, color: C.ink3 },

  frozen: {
    fontFamily: font.sans,
    fontSize: 10.5,
    color: C.ink4,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
});

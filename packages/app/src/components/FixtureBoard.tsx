import React, { useMemo } from "react";
import { View, Text, SectionList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import type { LiveFixture, UnifiedMarket } from "@terrace/sdk";
import { isFixtureLive } from "@terrace/sdk";
import { TeamBadge } from "../screens/MatchGroupCard";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional } from "../utils/format";
import { splitEventTitle, marketTitle } from "../utils/football";
import { matchMarketsToFixtures } from "../utils/fixtureMatch";
import { useUpcomingFixtures, type UpcomingFixture } from "../hooks/useUpcomingFixtures";
import { Badge, OddsButton } from "./ui";
import { Icon } from "./Icon";

// ---------------------------------------------------------------------------
// The matchday board — every fixture in the seeded leagues for the next week,
// with whatever market covers it attached (TODO Sprint 12 #8).
//
// The point is the fixtures without a market. Those rows are the app asking a
// question no other surface can: "nobody has called this one yet — want to?"
// A board that only lists what Polymarket happens to price can't do that, and
// across five leagues it looks like a quiet weekend when it isn't.
// ---------------------------------------------------------------------------

interface Props {
  markets: UnifiedMarket[];
  onOpenMarket: (marketId: string) => void;
  onCreateForFixture: (fixture: LiveFixture) => void;
}

interface Row {
  entry: UpcomingFixture;
  market: UnifiedMarket | null;
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === tomorrow.toDateString()) return "TOMORROW";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
}

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function FixtureRow({ entry, market, onOpenMarket, onCreateForFixture }: Row & Omit<Props, "markets">) {
  const { fixture, competition } = entry;
  const live = isFixtureLive(fixture);
  const noProb =
    market && market.noPrice > 0
      ? market.noPrice
      : market && market.yesPrice > 0
        ? 1 - market.yesPrice
        : null;

  return (
    <Pressable
      style={s.row}
      onPress={() => (market ? onOpenMarket(market.id) : onCreateForFixture(fixture))}
    >
      <View style={s.rowTop}>
        <View style={s.clockCol}>
          {live ? (
            <Badge tone="live" label={fixture.elapsed != null ? `${fixture.elapsed}'` : "LIVE"} />
          ) : (
            <Text style={s.kickoff}>{kickoffLabel(fixture.kickoff)}</Text>
          )}
        </View>

        <View style={s.teams}>
          <View style={s.teamLine}>
            <TeamBadge name={fixture.home.name} size={22} />
            <Text style={s.teamName} numberOfLines={1}>{fixture.home.name}</Text>
            {live && <Text style={s.score}>{fixture.homeScore ?? 0}</Text>}
          </View>
          <View style={s.teamLine}>
            <TeamBadge name={fixture.away.name} size={22} />
            <Text style={s.teamName} numberOfLines={1}>{fixture.away.name}</Text>
            {live && <Text style={s.score}>{fixture.awayScore ?? 0}</Text>}
          </View>
        </View>

        <Text style={s.comp} numberOfLines={1}>{competition}</Text>
      </View>

      {market ? (
        <View style={s.odds}>
          <OddsButton
            label="Back"
            tone="yes"
            value={probToFractional(market.yesPrice)}
            onPress={() => onOpenMarket(market.id)}
          />
          <OddsButton
            label="Fade"
            tone="no"
            value={probToFractional(noProb)}
            onPress={() => onOpenMarket(market.id)}
          />
        </View>
      ) : (
        // The whole reason the board is fixture-led: an uncalled match is a
        // prompt, not a gap.
        <Pressable style={s.createBtn} onPress={() => onCreateForFixture(fixture)}>
          <Icon name="plus" size={15} color={C.green} />
          <Text style={s.createTxt}>No market yet — call it</Text>
          <Icon name="chevronRight" size={15} color={C.ink4} />
        </Pressable>
      )}
    </Pressable>
  );
}

export function FixtureBoard({ markets, onOpenMarket, onCreateForFixture }: Props) {
  const { fixtures, loading, error } = useUpcomingFixtures();

  const sections = useMemo(() => {
    // Reuse the live-board matcher: it already knows that provider club names
    // disagree, and that a one-sided match is only safe when it's unambiguous.
    const attached = matchMarketsToFixtures(
      fixtures.map((u) => u.fixture),
      markets.map((m) => {
        const [home, away] = splitEventTitle(marketTitle(m));
        return {
          status: m.status,
          totalVolumeUsdc: m.totalVolumeUsdc,
          sides: [home, away] as [string, string],
        };
      }),
    );

    const rows: Row[] = fixtures.map((entry) => {
      const idx = attached.get(entry.fixture.fixtureId);
      return { entry, market: idx != null ? markets[idx] : null };
    });

    const byDay = new Map<string, Row[]>();
    for (const row of rows) {
      const key = dayKey(row.entry.fixture.kickoff);
      const list = byDay.get(key);
      if (list) list.push(row);
      else byDay.set(key, [row]);
    }

    return Array.from(byDay.entries()).map(([, list]) => ({
      title: dayLabel(list[0].entry.fixture.kickoff),
      data: list,
    }));
  }, [fixtures, markets]);

  if (loading && fixtures.length === 0) {
    return (
      <View style={s.centre}>
        <ActivityIndicator color={C.green} />
        <Text style={s.centreTxt}>Loading the schedule…</Text>
      </View>
    );
  }

  if (fixtures.length === 0) {
    return (
      <View style={s.centre}>
        <Icon name="calendar" size={26} color={C.ink4} />
        <Text style={s.centreTitle}>No fixtures scheduled</Text>
        <Text style={s.centreTxt}>
          {error
            ? "Couldn't reach the fixture feed. Pull to retry."
            : "Nothing in the next week across the leagues we cover."}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => String(row.entry.fixture.fixtureId)}
      renderItem={({ item }) => (
        <FixtureRow {...item} onOpenMarket={onOpenMarket} onCreateForFixture={onCreateForFixture} />
      )}
      renderSectionHeader={({ section }) => (
        <View style={s.dayHead}>
          <Text style={s.dayTxt}>{section.title}</Text>
        </View>
      )}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={s.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 100 },

  dayHead: { paddingTop: 16, paddingBottom: 8 },
  dayTxt: { fontFamily: font.condBold, fontSize: 13, fontWeight: "700", letterSpacing: 1, color: C.ink3 },

  row: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: radius.lg,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  clockCol: { width: 52, alignItems: "flex-start" },
  kickoff: {
    fontFamily: font.condBold,
    fontSize: 15,
    fontWeight: "700",
    color: C.ink2,
    fontVariant: ["tabular-nums"],
  },

  teams: { flex: 1, gap: 5, minWidth: 0 },
  teamLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  teamName: { flex: 1, fontFamily: font.sansSemi, fontSize: 13.5, fontWeight: "600", color: C.ink },
  score: {
    fontFamily: font.condBold,
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    fontVariant: ["tabular-nums"],
  },

  comp: { fontFamily: font.sans, fontSize: 10, color: C.ink4, maxWidth: 74, textAlign: "right" },

  odds: { flexDirection: "row", gap: 6 },

  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.deep,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  createTxt: { flex: 1, fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.green },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40, paddingBottom: 80 },
  centreTitle: { fontFamily: font.condBold, fontSize: 17, fontWeight: "700", color: C.ink, textTransform: "uppercase" },
  centreTxt: { fontFamily: font.sans, fontSize: 12.5, color: C.ink3, textAlign: "center", lineHeight: 18 },
});

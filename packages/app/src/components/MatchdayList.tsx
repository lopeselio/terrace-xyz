import React from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import { TeamBadge } from "../screens/MatchGroupCard";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional, moneyWhole } from "../utils/format";
import { Badge, OddsButton } from "./ui";
import { Icon } from "./Icon";

// ---------------------------------------------------------------------------
// Markets — list mode. Reskinned sportsbook fixture cards: source + countdown
// badges, crest pair + the call in Barlow Condensed, Back/Fade fractional odds,
// matched line. Tap → market detail.
// ---------------------------------------------------------------------------

function splitEventTitle(title: string): [string, string] {
  const parts = title.split(/\s+vs\.?\s+/i);
  return parts.length >= 2 ? [parts[0].trim(), parts[1].trim()] : [title, ""];
}

function countdown(expiry: Date | null): string {
  if (!expiry) return "";
  const diff = expiry.getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function MarketCard({ market, onPress }: { market: UnifiedMarket; onPress: () => void }) {
  const event = market.jupiterEventTitle ?? "";
  const [home, away] = splitEventTitle(event || market.question);
  const isH2H = !!away;
  const cd = countdown(market.expiry);
  const noProb = market.noPrice > 0 ? market.noPrice : market.yesPrice > 0 ? 1 - market.yesPrice : null;

  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.top}>
        <Badge tone={market.source === "native" ? "terrace" : "poly"} label={market.source === "native" ? "Terrace" : "Polymarket"} />
        {market.isPrivate && <Badge tone="private" label="Private" icon="lock" />}
        <View style={{ flex: 1 }} />
        {!!cd && <Badge tone="amber" label={cd} icon="clock" />}
      </View>

      <View style={s.mid}>
        {isH2H ? (
          <View style={s.crests}>
            <TeamBadge name={home} size={34} />
            <Text style={s.v}>V</Text>
            <TeamBadge name={away} size={34} />
          </View>
        ) : (
          <TeamBadge name={home} size={34} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!event && <Text style={s.comp} numberOfLines={1}>{event}</Text>}
          <Text style={s.call} numberOfLines={2}>{market.question}</Text>
        </View>
        <Icon name="chevronRight" size={18} color={C.ink4} />
      </View>

      <View style={s.odds}>
        <OddsButton label="Back" tone="yes" value={probToFractional(market.yesPrice)} onPress={onPress} />
        <OddsButton label="Fade" tone="no" value={probToFractional(noProb)} onPress={onPress} />
      </View>
      {market.totalVolumeUsdc > 0 && (
        <Text style={s.matched}>MATCHED {moneyWhole(market.totalVolumeUsdc)}</Text>
      )}
    </Pressable>
  );
}

interface Props {
  markets: UnifiedMarket[];
  loading: boolean;
  onSelectMarket: (id: string) => void;
}

export function MatchdayList({ markets, loading, onSelectMarket }: Props) {
  const open = markets
    .filter((m) => m.status === "Open" && !m.isFlash)
    .sort((a, b) => b.totalVolumeUsdc - a.totalVolumeUsdc);

  if (loading && open.length === 0) {
    return <View style={s.center}><ActivityIndicator color={C.green} /></View>;
  }
  if (open.length === 0) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>NO OPEN MARKETS</Text>
        <Text style={s.emptySub}>Pull to refresh or create one from the + tab</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={open}
      keyExtractor={(m) => m.id}
      contentContainerStyle={s.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <MarketCard market={item} onPress={() => onSelectMarket(item.id)} />}
    />
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 6 },
  emptyTitle: { fontFamily: font.condBold, fontSize: 20, fontWeight: "700", color: C.ink, letterSpacing: 0.5 },
  emptySub: { fontFamily: font.sans, fontSize: 12, color: C.ink3, textAlign: "center" },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.lg, padding: 14, gap: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  mid: { flexDirection: "row", alignItems: "center", gap: 11 },
  crests: { flexDirection: "row", alignItems: "center", gap: 6 },
  v: { fontFamily: font.condBold, fontSize: 12, fontWeight: "700", color: C.ink4 },
  comp: { fontFamily: font.sans, fontSize: 11, color: C.ink3, fontWeight: "600" },
  call: { fontFamily: font.condBold, fontSize: 16, fontWeight: "700", color: C.ink, letterSpacing: 0.2, textTransform: "uppercase", marginTop: 2 },
  odds: { flexDirection: "row", gap: 6 },
  matched: { fontFamily: font.sansSemi, fontSize: 10.5, fontWeight: "600", color: C.ink3, letterSpacing: 0.4 },
});

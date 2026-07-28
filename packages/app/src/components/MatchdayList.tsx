import React from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import { color as C, font } from "../theme/tokens";
import { MarketCard } from "./MarketCard";

// ---------------------------------------------------------------------------
// Markets — list mode. The card itself lives in MarketCard.tsx so Home's
// trending rows and the Flash board render markets identically.
// ---------------------------------------------------------------------------

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
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.green} />
      </View>
    );
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
      renderItem={({ item }) => (
        <MarketCard market={item} onPress={() => onSelectMarket(item.id)} />
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 6 },
  emptyTitle: { fontFamily: font.condBold, fontSize: 20, fontWeight: "700", color: C.ink, letterSpacing: 0.5 },
  emptySub: { fontFamily: font.sans, fontSize: 12, color: C.ink3, textAlign: "center" },
});

import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";

interface Props {
  markets: UnifiedMarket[];
  loading: boolean;
  onSelectMarket: (id: string) => void;
}

const STATUS_COLOR: Record<UnifiedMarket["status"], string> = {
  Open: "#22c55e",
  Closed: "#f59e0b",
  Settled: "#6b7280",
};

export function MarketListScreen({ markets, loading, onSelectMarket }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  if (markets.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No markets yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={markets}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onSelectMarket(item.id)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.question} numberOfLines={2}>
              {item.question}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLOR[item.status as keyof typeof STATUS_COLOR] },
              ]}
            >
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>

          {/* YES / NO odds bar — only shown for Open markets */}
          {item.status === "Open" && (
            <View style={styles.oddsRow}>
              <View style={[styles.oddsBtn, styles.yesBg]}>
                <Text style={styles.oddsLabel}>YES</Text>
                <Text style={styles.oddsPrice}>{Math.round(item.yesPrice * 100)}¢</Text>
              </View>
              <View style={[styles.oddsBtn, styles.noBg]}>
                <Text style={styles.oddsLabel}>NO</Text>
                <Text style={styles.oddsPrice}>{Math.round(item.noPrice * 100)}¢</Text>
              </View>
            </View>
          )}

          <View style={styles.cardFooter}>
            <Text style={styles.volume}>
              Vol: {item.totalVolumeUsdc.toFixed(2)} USDC
            </Text>
            <Text style={styles.expiry}>
              Expires: {item.expiry ? item.expiry.toLocaleDateString() : "—"}
            </Text>
          </View>

          {/* Source + settlement type — the key differentiator */}
          <View style={styles.metaRow}>
            <View
              style={[
                styles.sourceBadge,
                item.source === "jupiter"
                  ? styles.sourceBadgeJupiter
                  : styles.sourceBadgeNative,
              ]}
            >
              <Text style={styles.sourceText}>
                {item.source === "jupiter" ? "Polymarket" : "Terrace"}
              </Text>
            </View>
            <Text style={styles.settlement}>
              {item.source === "jupiter" ? "$1 / contract" : "Pro-rata payout"}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#9ca3af", fontSize: 16 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  question: {
    flex: 1,
    color: "#f9fafb",
    fontSize: 15,
    fontWeight: "600",
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  volume: { color: "#9ca3af", fontSize: 13 },
  expiry: { color: "#9ca3af", fontSize: 13 },
  outcome: { color: "#22c55e", fontSize: 13, fontWeight: "600" },
  oddsRow: {
    flexDirection: "row",
    gap: 8,
  },
  oddsBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  yesBg: { backgroundColor: "#14532d" },
  noBg: { backgroundColor: "#450a0a" },
  oddsLabel: { color: "#d1d5db", fontSize: 12, fontWeight: "700" },
  oddsPrice: { color: "#f9fafb", fontSize: 13, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  sourceBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeNative: { backgroundColor: "#14532d" },
  sourceBadgeJupiter: { backgroundColor: "#312e81" },
  sourceText: { color: "#e5e7eb", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  settlement: { color: "#6b7280", fontSize: 11 },
});

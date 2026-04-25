import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface MarketItem {
  address: string;
  question: string;
  totalVolume: bigint;
  expiry: bigint;
  status: "Open" | "Closed" | "Settled";
  outcome: number | null;
}

interface Props {
  markets: MarketItem[];
  loading: boolean;
  onSelectMarket: (address: string) => void;
}

const STATUS_COLOR: Record<MarketItem["status"], string> = {
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
      keyExtractor={(m) => m.address}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onSelectMarket(item.address)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.question} numberOfLines={2}>
              {item.question}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLOR[item.status] },
              ]}
            >
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.volume}>
              Vol: {(Number(item.totalVolume) / 1_000_000).toFixed(2)} USDC
            </Text>
            <Text style={styles.expiry}>
              Expires: {new Date(Number(item.expiry) * 1000).toLocaleDateString()}
            </Text>
          </View>

          {item.status === "Settled" && item.outcome !== null && (
            <Text style={styles.outcome}>
              Result: {item.outcome === 1 ? "Yes" : "No"}
            </Text>
          )}
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
});

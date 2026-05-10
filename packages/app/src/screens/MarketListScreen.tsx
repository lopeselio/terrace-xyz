import React, { useState } from "react";
import {
  View,
  Text,
  Image,
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

function MarketCard({ item, onPress }: { item: UnifiedMarket; onPress: () => void }) {
  const [imgError, setImgError] = useState(false);
  const eventTitle = item.jupiterEventTitle ?? item.question;
  const outcomeLabel = item.jupiterEventTitle ? item.question : null;
  const showImage = !!item.imageUrl && !imgError;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        {/* Event image thumbnail */}
        {showImage && (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.eventImage}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        )}

        <View style={styles.titleBlock}>
          <Text style={styles.question} numberOfLines={2}>{eventTitle}</Text>
          {outcomeLabel && (
            <Text style={styles.outcomeLabel} numberOfLines={1}>{outcomeLabel}</Text>
          )}
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLOR[item.status as keyof typeof STATUS_COLOR] ?? "#6b7280" },
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
            <Text style={styles.oddsPrice}>
              {item.yesPrice > 0 ? `${Math.round(item.yesPrice * 100)}¢` : "—"}
            </Text>
          </View>
          <View style={[styles.oddsBtn, styles.noBg]}>
            <Text style={styles.oddsLabel}>NO</Text>
            <Text style={styles.oddsPrice}>
              {item.noPrice > 0 ? `${Math.round(item.noPrice * 100)}¢` : "—"}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.volume}>Vol: {item.totalVolumeUsdc.toFixed(2)} USDC</Text>
        <Text style={styles.expiry}>
          Expires: {item.expiry ? item.expiry.toLocaleDateString() : "—"}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {item.isPrivate && (
          <View style={styles.privateBadge}>
            <Text style={styles.privateText}>🔒 Private</Text>
          </View>
        )}
        {item.isFlash && (
          <View style={styles.flashBadge}>
            <Text style={styles.flashText}>⚡ Flash</Text>
          </View>
        )}
        <View
          style={[
            styles.sourceBadge,
            item.source === "jupiter" ? styles.sourceBadgeJupiter : styles.sourceBadgeNative,
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
  );
}

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
        <MarketCard item={item} onPress={() => onSelectMarket(item.id)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty:  { color: "#9ca3af", fontSize: 16 },
  list:   { padding: 16, gap: 12 },

  card: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  eventImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#374151",
    flexShrink: 0,
  },
  titleBlock: { flex: 1, gap: 2 },
  question: {
    color: "#f9fafb",
    fontSize: 15,
    fontWeight: "600",
  },
  outcomeLabel: {
    color: "#9ca3af",
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  oddsRow: { flexDirection: "row", gap: 8 },
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
  noBg:  { backgroundColor: "#450a0a" },
  oddsLabel: { color: "#d1d5db", fontSize: 12, fontWeight: "700" },
  oddsPrice: { color: "#f9fafb", fontSize: 13, fontWeight: "800" },

  cardFooter: { flexDirection: "row", justifyContent: "space-between" },
  volume: { color: "#9ca3af", fontSize: 13 },
  expiry: { color: "#9ca3af", fontSize: 13 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  privateBadge: { backgroundColor: "#1e3a5f", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  privateText:  { fontSize: 10, fontWeight: "700", color: "#60a5fa" },
  flashBadge:   { backgroundColor: "#451a03", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  flashText:    { fontSize: 10, fontWeight: "700", color: "#f59e0b" },
  sourceBadge:        { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sourceBadgeNative:  { backgroundColor: "#14532d" },
  sourceBadgeJupiter: { backgroundColor: "#312e81" },
  sourceText: { color: "#e5e7eb", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  settlement: { color: "#6b7280", fontSize: 11 },
});

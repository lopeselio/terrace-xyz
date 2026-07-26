import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UnifiedMarket } from "@terrace/sdk";
import { SwipeDeck, type SwipeDeckHandle } from "./SwipeDeck";
import { MarketListScreen } from "./MarketListScreen";
import { BetSheet } from "./BetSheet";
import { usePlaceBet } from "../hooks/usePlaceBet";
import { TerraceMark, PolyJupLogos } from "../components/BrandIcons";

// ---------------------------------------------------------------------------
// Markets tab — a Tinder-style swipe deck as the default view, with the
// existing list kept behind a List · Swipe toggle. Source chips + section tabs
// filter both views identically. View mode is persisted per user.
// ---------------------------------------------------------------------------

const VIEW_MODE_KEY = "terrace_markets_viewmode";

type ViewMode = "swipe" | "list";
type SourceFilter = "all" | "terrace" | "polymarket";
type SectionTab = "Markets" | "Leagues";

const SOURCE_CHIPS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All markets" },
  { key: "terrace", label: "Terrace" },
  { key: "polymarket", label: "Polymarket" },
];

interface Props {
  markets: UnifiedMarket[];
  loading: boolean;
  onSelectMarket: (id: string) => void;
}

interface SelectedBet {
  marketId: string;
  label: string;
  isYes: boolean;
  yesPrice: number | null;
  question: string | null;
  source: "native" | "jupiter";
}

export function MarketsScreen({ markets, loading, onSelectMarket }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("swipe");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sectionTab, setSectionTab] = useState<SectionTab>("Markets");
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const deckRef = useRef<SwipeDeckHandle>(null);
  const consumed = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;

  const { status: betStatus, txSignature, error: betError, placeBet, reset: resetBet } = usePlaceBet();

  // Restore the last-used view mode (defaults to swipe for first-time users).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((v) => { if (v === "list" || v === "swipe") setViewMode(v); })
      .catch(() => {});
  }, []);

  const changeView = (v: ViewMode) => {
    if (v === viewMode) return;
    setViewMode(v);
    AsyncStorage.setItem(VIEW_MODE_KEY, v).catch(() => {});
    // Cross-fade (~150ms).
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  // Both views see the same source-filtered set.
  const filtered = useMemo(
    () =>
      markets.filter((m) =>
        sourceFilter === "all" ? true : sourceFilter === "terrace" ? m.source === "native" : m.source === "jupiter",
      ),
    [markets, sourceFilter],
  );

  // ── Tail/back/fade bet flow ─────────────────────────────────────────────
  const handleSwipeBet = (market: UnifiedMarket, isYes: boolean) => {
    resetBet();
    consumed.current = false;
    setSelectedBet({
      marketId: market.id,
      label: isYes ? "YES" : "NO",
      isYes,
      yesPrice: isYes ? market.yesPrice : (market.noPrice > 0 ? market.noPrice : 1 - market.yesPrice),
      question: market.question,
      source: market.source === "native" ? "native" : "jupiter",
    });
  };

  const handleConfirmBet = async (amountUsdc: number, isYes: boolean) => {
    if (!selectedBet) return;
    await placeBet({ marketId: selectedBet.marketId, isYes, amountUsdc, source: selectedBet.source });
  };

  const handleDismissBet = () => {
    resetBet();
    setSelectedBet(null);
    consumed.current = false;
  };

  // On a confirmed bet, consume the top card (fly it off + advance). A cancelled
  // sheet never reaches here, so the card springs back and stays in the deck.
  useEffect(() => {
    if (betStatus === "success" && selectedBet && !consumed.current) {
      consumed.current = true;
      deckRef.current?.commitTop(selectedBet.isYes ? "yes" : "no");
    }
  }, [betStatus, selectedBet]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
        <TouchableOpacity style={styles.searchBtn} activeOpacity={0.7} accessibilityLabel="Search markets">
          <Text style={styles.searchGlyph}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Section tabs */}
      <View style={styles.sectionTabs}>
        {(["Markets", "Leagues"] as SectionTab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.sectionTab, sectionTab === t && styles.sectionTabActive]}
            onPress={() => setSectionTab(t)}
          >
            <Text style={[styles.sectionTabText, sectionTab === t && styles.sectionTabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {sectionTab === "Leagues" ? (
        <View style={styles.leaguesStub}>
          <Text style={styles.leaguesEmoji}>🏆</Text>
          <Text style={styles.leaguesTitle}>Leagues</Text>
          <Text style={styles.leaguesSub}>Fan leagues live from the Home tab for now</Text>
        </View>
      ) : (
        <>
          {/* Source chips */}
          <View style={styles.sourceChips}>
            {SOURCE_CHIPS.map(({ key, label }) => {
              const active = sourceFilter === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSourceFilter(key)}
                  activeOpacity={0.7}
                >
                  {key === "terrace" && <TerraceMark size={12} />}
                  {key === "polymarket" && <PolyJupLogos size={12} />}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* List · Swipe toggle */}
          <View style={styles.toggleWrap}>
            <View style={styles.toggle}>
              {(["list", "swipe"] as ViewMode[]).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.toggleSeg, viewMode === v && styles.toggleSegActive]}
                  onPress={() => changeView(v)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                >
                  <Text style={[styles.toggleText, viewMode === v && styles.toggleTextActive]}>
                    {v === "swipe" ? "🎴 Swipe" : "☰ List"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Content */}
          <Animated.View style={[styles.content, { opacity: fade }]}>
            {viewMode === "swipe" ? (
              <SwipeDeck
                ref={deckRef}
                markets={filtered}
                loading={loading}
                onBet={handleSwipeBet}
                onDetail={onSelectMarket}
                cardHeight={360}
                deferAdvance
              />
            ) : (
              <MarketListScreen markets={filtered} loading={loading} onSelectMarket={onSelectMarket} />
            )}
          </Animated.View>
        </>
      )}

      {/* Bet sheet — pre-committed to the swiped side */}
      {selectedBet && (
        <View style={styles.betOverlay}>
          <Pressable style={styles.betBackdrop} onPress={handleDismissBet} />
          <BetSheet
            marketId={selectedBet.marketId}
            outcomeLabel={selectedBet.label}
            marketQuestion={selectedBet.question ?? undefined}
            source={selectedBet.source}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "600", color: "#f9fafb", letterSpacing: -0.3 },
  searchBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  searchGlyph: { fontSize: 14 },

  sectionTabs: { flexDirection: "row", gap: 6, paddingHorizontal: 18, marginBottom: 10 },
  sectionTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: "#1e1e1e" },
  sectionTabActive: { backgroundColor: "#22c55e" },
  sectionTabText: { fontSize: 11, fontWeight: "500", color: "#aaa" },
  sectionTabTextActive: { color: "#000", fontWeight: "700" },

  sourceChips: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingBottom: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 16, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  chipActive: { backgroundColor: "#0f172a", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#888" },
  chipTextActive: { color: "#818cf8", fontWeight: "700" },

  toggleWrap: { paddingHorizontal: 18, marginBottom: 14, alignItems: "flex-start" },
  toggle: { flexDirection: "row", backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#2a2a2a", borderRadius: 12, padding: 3 },
  toggleSeg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9 },
  toggleSegActive: { backgroundColor: "#22c55e" },
  toggleText: { fontSize: 12, fontWeight: "700", color: "#888" },
  toggleTextActive: { color: "#000" },

  content: { flex: 1 },

  leaguesStub: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32, paddingBottom: 80 },
  leaguesEmoji: { fontSize: 40 },
  leaguesTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  leaguesSub: { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 20 },

  betOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" },
  betBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
});

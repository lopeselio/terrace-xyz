import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { UnifiedMarket, ParlayLeg } from "@terrace/sdk";
import { useParlay } from "../hooks/useParlay";

// ── Leg card ─────────────────────────────────────────────────────────────────

interface LegCardProps {
  market: UnifiedMarket;
  selected: boolean;
  outcome: 0 | 1 | null;
  onToggle: () => void;
  onOutcome: (o: 0 | 1) => void;
}

function LegCard({ market, selected, outcome, onToggle, onOutcome }: LegCardProps) {
  return (
    <TouchableOpacity
      style={[leg.card, selected && leg.cardSel]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <View style={leg.top}>
        <View style={leg.checkbox}>
          {selected && <Text style={leg.checkmark}>✓</Text>}
        </View>
        <Text style={leg.question} numberOfLines={2}>{market.question}</Text>
      </View>

      {selected && (
        <View style={leg.outcomeRow}>
          <TouchableOpacity
            style={[leg.outcomeBtn, leg.yesBg, outcome === 0 && leg.outcomeSel]}
            onPress={() => onOutcome(0)}
          >
            <Text style={leg.outcomeTxt}>YES {Math.round(market.yesPrice * 100)}¢</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[leg.outcomeBtn, leg.noBg, outcome === 1 && leg.outcomeSel]}
            onPress={() => onOutcome(1)}
          >
            <Text style={leg.outcomeTxt}>NO {Math.round(market.noPrice * 100)}¢</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const leg = StyleSheet.create({
  card:       { backgroundColor: "#111", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: "transparent" },
  cardSel:    { borderColor: "#22c55e" },
  top:        { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#333", alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" },
  checkmark:  { fontSize: 12, color: "#22c55e", fontWeight: "700" },
  question:   { flex: 1, fontSize: 14, fontWeight: "600", color: "#f9fafb", lineHeight: 20 },
  outcomeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  outcomeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: 0.5, borderWidth: 1.5, borderColor: "transparent" },
  outcomeSel: { opacity: 1, borderColor: "#fff" },
  yesBg:      { backgroundColor: "#14532d" },
  noBg:       { backgroundColor: "#7f1d1d" },
  outcomeTxt: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
});

// ── Parlay multiplier display ─────────────────────────────────────────────────

function calcMultiplier(legs: Array<{ market: UnifiedMarket; outcome: 0 | 1 }>): number {
  return legs.reduce((acc, { market, outcome }) => {
    const price = outcome === 0 ? market.yesPrice : market.noPrice;
    if (!price || price <= 0) return acc;
    return acc * (1 / price);
  }, 1);
}

// ── Screen ────────────────────────────────────────────────────────────────────

interface Props {
  markets: UnifiedMarket[];
  walletPubkey: string | null;
  onConnectWallet: () => void;
}

type LegState = { outcome: 0 | 1 | null };

export function ParlayBuilderScreen({ markets, walletPubkey, onConnectWallet }: Props) {
  const openMarkets = markets.filter((m) => m.status === "Open");
  const [selectedLegs, setSelectedLegs] = useState<Record<string, LegState>>({});
  const [stakeStr, setStakeStr] = useState("");
  const { createParlay, status, error, txSig } = useParlay();

  const busy = status !== "idle" && status !== "success" && status !== "error";

  const toggleMarket = (id: string) => {
    setSelectedLegs((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { outcome: null } };
    });
  };

  const setOutcome = (id: string, outcome: 0 | 1) => {
    setSelectedLegs((prev) => ({ ...prev, [id]: { outcome } }));
  };

  // Only legs with a chosen outcome count
  const completedLegs: Array<{ market: UnifiedMarket; outcome: 0 | 1 }> = Object.entries(selectedLegs)
    .filter(([, s]) => s.outcome !== null)
    .map(([id, s]) => ({
      market: openMarkets.find((m) => m.id === id)!,
      outcome: s.outcome as 0 | 1,
    }))
    .filter((l) => l.market != null);

  const multiplier = calcMultiplier(completedLegs);
  const stake = parseFloat(stakeStr) || 0;
  const payout = stake * multiplier;
  const canSubmit = completedLegs.length >= 2 && completedLegs.length <= 8 && stake > 0;

  const handleSubmit = async () => {
    if (!walletPubkey) { onConnectWallet(); return; }
    if (!canSubmit) return;
    const legs: ParlayLeg[] = completedLegs.map(({ market, outcome }) => ({
      market: (market.nativeMarketAddress ?? market.id) as any,
      outcome,
    }));
    const stakeUsdc = BigInt(Math.round(stake * 1_000_000));
    try {
      await createParlay(legs, stakeUsdc);
    } catch {
      // status holds error
    }
  };

  if (!walletPubkey) {
    return (
      <View style={s.disconnected}>
        <Text style={s.disconnectedEmoji}>🃏</Text>
        <Text style={s.disconnectedTitle}>Chain your convictions</Text>
        <Text style={s.disconnectedSub}>Connect a wallet to build and submit a parlay.</Text>
        <TouchableOpacity style={s.connectBtn} onPress={onConnectWallet}>
          <Text style={s.connectBtnText}>Connect wallet</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={s.title}>Build Parlay</Text>
        <Text style={s.subtitle}>Pick 2–8 markets, choose outcomes, set your stake.</Text>
      </View>

      {/* Status banner */}
      {status === "success" && (
        <View style={[s.banner, s.bannerSuccess]}>
          <Text style={s.bannerText}>🎉 Parlay submitted!  {txSig?.slice(0, 8)}…</Text>
        </View>
      )}
      {status === "error" && (
        <View style={[s.banner, s.bannerError]}>
          <Text style={s.bannerText}>⚠️ {error ?? "Failed"}</Text>
        </View>
      )}
      {busy && (
        <View style={[s.banner, s.bannerPending]}>
          <ActivityIndicator size="small" color="#f9fafb" style={{ marginRight: 8 }} />
          <Text style={s.bannerText}>
            {status === "building" ? "Building…" : status === "signing" ? "Waiting for signature…" : "Sending…"}
          </Text>
        </View>
      )}

      {/* Market list */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>OPEN MARKETS ({openMarkets.length})</Text>
        {openMarkets.map((m) => (
          <LegCard
            key={m.id}
            market={m}
            selected={!!selectedLegs[m.id]}
            outcome={selectedLegs[m.id]?.outcome ?? null}
            onToggle={() => toggleMarket(m.id)}
            onOutcome={(o) => setOutcome(m.id, o)}
          />
        ))}
      </View>

      {/* Summary + stake */}
      {completedLegs.length > 0 && (
        <View style={s.summary}>
          <Text style={s.sectionLabel}>PARLAY SUMMARY</Text>
          <View style={s.summaryRow}>
            <Text style={s.summaryKey}>Legs</Text>
            <Text style={s.summaryVal}>{completedLegs.length}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryKey}>Multiplier</Text>
            <Text style={[s.summaryVal, { color: "#22c55e" }]}>{multiplier.toFixed(2)}×</Text>
          </View>
          {stake > 0 && (
            <View style={s.summaryRow}>
              <Text style={s.summaryKey}>Potential payout</Text>
              <Text style={[s.summaryVal, { color: "#f59e0b" }]}>{payout.toFixed(2)} USDC</Text>
            </View>
          )}

          <View style={s.stakeRow}>
            <Text style={s.currencyLabel}>USDC</Text>
            <TextInput
              style={s.stakeInput}
              keyboardType="decimal-pad"
              placeholder="Stake"
              placeholderTextColor="#4b5563"
              value={stakeStr}
              onChangeText={setStakeStr}
            />
          </View>

          <TouchableOpacity
            style={[s.submitBtn, (!canSubmit || busy) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || busy}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.submitBtnText}>
                {completedLegs.length < 2
                  ? `Pick ${2 - completedLegs.length} more market${completedLegs.length === 1 ? "" : "s"}`
                  : `Submit ${completedLegs.length}-leg parlay`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: "#0a0a0a" },

  disconnected:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, marginTop: 80 },
  disconnectedEmoji: { fontSize: 48 },
  disconnectedTitle: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  disconnectedSub:   { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  connectBtn:        { backgroundColor: "#22c55e", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  connectBtnText:    { fontSize: 15, fontWeight: "700", color: "#000" },

  header:   { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 14 },
  title:    { fontSize: 24, fontWeight: "700", color: "#fff" },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },

  banner:        { flexDirection: "row", alignItems: "center", marginHorizontal: 18, marginBottom: 12, borderRadius: 10, padding: 12 },
  bannerSuccess: { backgroundColor: "#14532d" },
  bannerError:   { backgroundColor: "#7f1d1d" },
  bannerPending: { backgroundColor: "#1e3a5f" },
  bannerText:    { color: "#f9fafb", fontSize: 13, fontWeight: "600", flexShrink: 1 },

  section:      { paddingHorizontal: 18 },
  sectionLabel: { fontSize: 10, fontWeight: "600", color: "#4b5563", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },

  summary:    { marginHorizontal: 18, marginTop: 8, backgroundColor: "#111", borderRadius: 16, padding: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryKey: { fontSize: 13, color: "#9ca3af" },
  summaryVal: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },

  stakeRow:     { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 14, marginTop: 12, marginBottom: 14 },
  currencyLabel: { fontSize: 13, color: "#6b7280", fontWeight: "600", marginRight: 8 },
  stakeInput:   { flex: 1, fontSize: 20, fontWeight: "700", color: "#f9fafb", paddingVertical: 14 },

  submitBtn:         { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: 15, fontWeight: "700", color: "#000" },
});

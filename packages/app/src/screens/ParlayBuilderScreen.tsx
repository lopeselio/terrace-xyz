import React, { useState, useMemo } from "react";
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
import { font as TF } from "../theme/tokens";
import { useParlay } from "../hooks/useParlay";
import { TerraceMark } from "../components/BrandIcons";

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
        <View style={leg.titleBlock}>
          {market.jupiterEventTitle ? (
            <Text style={leg.eventPrefix} numberOfLines={1}>{market.jupiterEventTitle}</Text>
          ) : null}
          <Text style={leg.question} numberOfLines={2}>{market.question}</Text>
        </View>
      </View>

      {selected && (
        <View style={leg.outcomeRow}>
          <TouchableOpacity
            style={[leg.outcomeBtn, leg.yesBg, outcome === 1 && leg.outcomeSel]}
            onPress={() => onOutcome(1)}
          >
            <Text style={leg.outcomeTxt}>YES {Math.round(market.yesPrice * 100)}¢</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[leg.outcomeBtn, leg.noBg, outcome === 0 && leg.outcomeSel]}
            onPress={() => onOutcome(0)}
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
  titleBlock: { flex: 1 },
  eventPrefix: { fontSize: 10, color: "#6b7280", marginBottom: 2 },
  question:   { fontSize: 14, fontWeight: "600", color: "#f9fafb", lineHeight: 20 },
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
    const price = outcome === 1 ? market.yesPrice : market.noPrice;
    if (!price || price <= 0) return acc;
    return acc * (1 / price);
  }, 1);
}

// ── Source filter chips ───────────────────────────────────────────────────────
// Only native Terrace markets can be parlay legs (the on-chain program settles
// against native market PDAs; Jupiter market IDs are UUIDs, not pubkeys).

type ParlaySourceFilter = "all" | "native";

const SOURCE_FILTERS: Array<{
  key: ParlaySourceFilter;
  label: string;
  hasLogo: boolean;
}> = [
  { key: "all",    label: "All Markets",  hasLogo: false },
  { key: "native", label: "Terrace",      hasLogo: true  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

interface Props {
  markets: UnifiedMarket[];
  walletPubkey: string | null;
  onConnectWallet: () => void;
  onClose?: () => void;
  onNavigateProfile?: () => void;
}

type LegState = { outcome: 0 | 1 | null };

export function ParlayBuilderScreen({ markets, walletPubkey, onConnectWallet, onClose, onNavigateProfile }: Props) {
  // Parlays are settled on-chain against Terrace market PDAs — Jupiter markets
  // don't have valid Solana pubkeys as IDs, so only native markets can be legs.
  const openMarkets = markets.filter((m) => m.status === "Open" && m.source === "native");
  const [selectedLegs, setSelectedLegs] = useState<Record<string, LegState>>({});
  const [sourceFilter, setSourceFilter] = useState<ParlaySourceFilter>("all");
  const [stakeStr, setStakeStr] = useState("");
  const { createParlay, status, error, txSig } = useParlay();

  const busy = status !== "idle" && status !== "success" && status !== "error";

  // Filter markets by source (all = all native, native = also all native)
  const filteredMarkets = useMemo(() => {
    if (sourceFilter === "native") return openMarkets.filter((m) => m.source === "native");
    return openMarkets;
  }, [openMarkets, sourceFilter]);

  // Group filtered markets by event title
  const groupedMarkets = useMemo(() => {
    const groups = new Map<string, UnifiedMarket[]>();
    for (const m of filteredMarkets) {
      const key = m.source === "native"
        ? "⚡ Terrace Markets"
        : (m.jupiterEventTitle ?? "Other");
      const arr = groups.get(key) ?? [];
      arr.push(m);
      groups.set(key, arr);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => {
        if (a === "⚡ Terrace Markets") return -1;
        if (b === "⚡ Terrace Markets") return 1;
        return a.localeCompare(b);
      })
      .map(([title, items]) => ({ title, items }));
  }, [filteredMarkets]);

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

  if (status === "success") {
    return (
      <ScrollView style={s.root} showsVerticalScrollIndicator={false} contentContainerStyle={s.successScroll}>
        <View style={s.successCard}>
          <Text style={s.successEmoji}>🎉</Text>
          <Text style={s.successTitle}>Parlay submitted!</Text>
          <Text style={s.successSub}>{completedLegs.length}-leg parlay · {multiplier.toFixed(2)}×</Text>
          {txSig && (
            <View style={s.successTxRow}>
              <Text style={s.successTxLabel}>Tx</Text>
              <Text style={s.successTxSig}>{txSig.slice(0, 12)}…{txSig.slice(-6)}</Text>
            </View>
          )}
        </View>

        <View style={s.nextStepsCard}>
          <Text style={s.nextStepsTitle}>What happens next</Text>

          <View style={s.nextStep}>
            <Text style={s.nextStepIcon}>📊</Text>
            <View style={s.nextStepBody}>
              <Text style={s.nextStepHeading}>Track it in Profile</Text>
              <Text style={s.nextStepDesc}>Your parlay appears in Profile → Active tab. You'll see each leg, current status, and your potential payout.</Text>
            </View>
          </View>

          <View style={s.nextStepDivider} />

          <View style={s.nextStep}>
            <Text style={s.nextStepIcon}>⚖️</Text>
            <View style={s.nextStepBody}>
              <Text style={s.nextStepHeading}>Auto-settlement</Text>
              <Text style={s.nextStepDesc}>Once all {completedLegs.length} markets resolve on-chain, your parlay settles automatically. If any leg loses, the whole parlay is lost.</Text>
            </View>
          </View>

          <View style={s.nextStepDivider} />

          <View style={s.nextStep}>
            <Text style={s.nextStepIcon}>💰</Text>
            <View style={s.nextStepBody}>
              <Text style={s.nextStepHeading}>Claiming winnings</Text>
              <Text style={s.nextStepDesc}>Hit all {completedLegs.length} legs? A "Claim" button appears in Profile → Active tab. Tap it to receive your USDC payout on-chain.</Text>
            </View>
          </View>
        </View>

        <View style={s.successActions}>
          <TouchableOpacity
            style={s.profileBtn}
            onPress={() => { onNavigateProfile?.(); onClose?.(); }}
            activeOpacity={0.8}
          >
            <Text style={s.profileBtnText}>View in Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.buildNewBtn}
            onPress={() => { setSelectedLegs({}); setStakeStr(""); }}
            activeOpacity={0.8}
          >
            <Text style={s.buildNewBtnText}>Build another</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView style={s.root} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          {onClose && (
            <TouchableOpacity style={s.backBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={s.title}>Build Parlay</Text>
          <Text style={s.subtitle}>Pick 2–8 markets, choose outcomes, set your stake.</Text>
        </View>

        {/* Status banner */}
        {status === "error" && (
          <View style={[s.banner, s.bannerError]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerText}>
                ⚠️ {error?.includes("Wallet timed out") || error?.includes("Ping")
                  ? "Wallet timed out — open Phantom first, then tap Submit again"
                  : error?.includes("Network request failed") || error?.includes("RPC URL not configured")
                  ? "Network error — check your connection and tap Submit to retry"
                  : (error ?? "Transaction failed — tap Submit to try again")}
              </Text>
            </View>
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

        {/* Live multiplier bar */}
        {completedLegs.length > 0 && (
          <View style={s.liveBar}>
            <View style={s.liveBarLeft}>
              <Text style={s.liveBarLegs}>{completedLegs.length}-leg</Text>
              <Text style={s.liveBarSep}>·</Text>
              <Text style={s.liveBarMult}>{multiplier.toFixed(2)}×</Text>
            </View>
            {stake > 0 ? (
              <Text style={s.liveBarPayout}>→ {payout.toFixed(2)} USDC</Text>
            ) : (
              <Text style={s.liveBarHint}>Enter stake below</Text>
            )}
          </View>
        )}

        {/* Source filter chips */}
        <View style={s.filterRow}>
          {SOURCE_FILTERS.map((f) => {
            const active = sourceFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[s.filterChip, active && s.filterChipActive]}
                onPress={() => setSourceFilter(f.key)}
                activeOpacity={0.7}
              >
                {f.key === "native" && (
                  <TerraceMark size={14} />
                )}
                <Text style={[s.filterChipLabel, active && s.filterChipLabelActive]}>
                  {f.label}
                </Text>
                {f.key !== "all" && (
                  <View style={[s.filterCountBubble, active && s.filterCountBubbleActive]}>
                    <Text style={[s.filterCountText, active && s.filterCountTextActive]}>
                      {openMarkets.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Grouped market picker */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>
            {sourceFilter === "native"
              ? `TERRACE MARKETS (${filteredMarkets.length})`
              : `OPEN MARKETS (${filteredMarkets.length})`}
          </Text>
          {groupedMarkets.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>No open markets in this category</Text>
            </View>
          )}
          {groupedMarkets.map(({ title, items }) => (
            <View key={title} style={s.eventGroup}>
              <Text style={s.eventGroupLabel}>{title}</Text>
              {items.map((m) => (
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
          ))}
        </View>

        {/* Summary rows (legs/multiplier/payout) — stake + submit moved to sticky footer */}
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
          </View>
        )}

        {/* Bottom padding so last market card isn't hidden behind sticky footer */}
        <View style={{ height: completedLegs.length > 0 ? 160 : 100 }} />
      </ScrollView>

      {/* ── Sticky footer — stake + submit ── */}
      {completedLegs.length > 0 && (
        <View style={s.stickyFooter}>
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
            {stake > 0 && (
              <Text style={s.stakePayoutHint}>→ {payout.toFixed(2)}</Text>
            )}
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
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  root:   { flex: 1, backgroundColor: "#0a0a0a" },

  // Success screen
  successScroll:     { padding: 18, paddingTop: 28 },
  successCard:       { backgroundColor: "#0f2e1a", borderRadius: 18, padding: 24, alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#166534", marginBottom: 14 },
  successEmoji:      { fontSize: 44, marginBottom: 4 },
  successTitle:      { fontSize: 22, fontWeight: "800", color: "#4ade80" },
  successSub:        { fontSize: 14, color: "#86efac", fontWeight: "600" },
  successTxRow:      { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: "#052e16", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  successTxLabel:    { fontSize: 10, fontWeight: "700", color: "#4b5563", letterSpacing: 0.5 },
  successTxSig:      { fontSize: 11, fontWeight: "600", color: "#6b7280", fontVariant: ["tabular-nums"] },

  nextStepsCard:     { backgroundColor: "#111", borderRadius: 16, padding: 18, gap: 14, borderWidth: 0.5, borderColor: "#1e1e1e", marginBottom: 14 },
  nextStepsTitle:    { fontSize: 11, fontWeight: "700", color: "#4b5563", letterSpacing: 0.7, textTransform: "uppercase" },
  nextStep:          { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  nextStepIcon:      { fontSize: 22, width: 30, textAlign: "center" },
  nextStepBody:      { flex: 1, gap: 3 },
  nextStepHeading:   { fontSize: 14, fontWeight: "700", color: "#f9fafb" },
  nextStepDesc:      { fontSize: 12, color: "#6b7280", lineHeight: 18 },
  nextStepDivider:   { height: 0.5, backgroundColor: "#1e1e1e" },

  successActions:    { gap: 10 },
  profileBtn:        { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  profileBtnText:    { fontSize: 15, fontWeight: "700", color: "#000" },
  buildNewBtn:       { backgroundColor: "#1a1a1a", borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#2a2a2a" },
  buildNewBtnText:   { fontSize: 14, fontWeight: "600", color: "#9ca3af" },

  disconnected:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, marginTop: 80 },
  disconnectedEmoji: { fontSize: 48 },
  disconnectedTitle: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  disconnectedSub:   { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  connectBtn:        { backgroundColor: "#22c55e", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  connectBtnText:    { fontSize: 15, fontWeight: "700", color: "#000" },

  header:      { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 14 },
  backBtn:     { marginBottom: 10 },
  backBtnText: { fontSize: 13, color: "#22c55e", fontWeight: "600" },
  title:    { fontFamily: TF.condBold, fontSize: 24, fontWeight: "700", color: "#fff", letterSpacing: 0.3, textTransform: "uppercase" },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },

  banner:        { flexDirection: "row", alignItems: "center", marginHorizontal: 18, marginBottom: 12, borderRadius: 10, padding: 12 },
  bannerError:   { backgroundColor: "#7f1d1d" },
  bannerPending: { backgroundColor: "#1e3a5f" },
  bannerText:    { color: "#f9fafb", fontSize: 13, fontWeight: "600", flexShrink: 1 },

  // Live multiplier bar
  liveBar:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 10, backgroundColor: "#0f2e1a", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#166534" },
  liveBarLeft:   { flexDirection: "row", alignItems: "center", gap: 6 },
  liveBarLegs:   { fontSize: 13, fontWeight: "700", color: "#4ade80" },
  liveBarSep:    { fontSize: 13, color: "#4b5563" },
  liveBarMult:   { fontSize: 18, fontWeight: "800", color: "#22c55e" },
  liveBarPayout: { fontSize: 13, fontWeight: "700", color: "#f59e0b" },
  liveBarHint:   { fontSize: 10, color: "#4b5563" },

  // Source filter chips
  filterRow:             { flexDirection: "row", paddingHorizontal: 18, gap: 8, marginBottom: 14 },
  filterChip:            { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#111", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#1e1e1e" },
  filterChipActive:      { backgroundColor: "#0f2e1a", borderColor: "#166534" },
  filterChipLabel:       { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  filterChipLabelActive: { color: "#4ade80" },
  filterCountBubble:     { backgroundColor: "#1e1e1e", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  filterCountBubbleActive: { backgroundColor: "#14532d" },
  filterCountText:       { fontSize: 10, fontWeight: "700", color: "#6b7280" },
  filterCountTextActive: { color: "#4ade80" },

  // Grouped event sections
  section:        { paddingHorizontal: 18 },
  sectionLabel:   { fontSize: 10, fontWeight: "600", color: "#4b5563", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
  eventGroup:     { marginBottom: 8 },
  eventGroupLabel:{ fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.4, paddingVertical: 6, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: "#1e1e1e", marginBottom: 8, textTransform: "uppercase" },

  emptyState:    { paddingVertical: 32, alignItems: "center" },
  emptyText:     { fontSize: 13, color: "#374151" },

  summary:    { marginHorizontal: 18, marginTop: 8, backgroundColor: "#111", borderRadius: 16, padding: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryKey: { fontSize: 13, color: "#9ca3af" },
  summaryVal: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },

  // Sticky footer
  stickyFooter:  { backgroundColor: "#0f0f0f", borderTopWidth: 1, borderTopColor: "#1a1a1a", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 },
  stakeRow:      { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 14, marginBottom: 10 },
  currencyLabel: { fontSize: 13, color: "#6b7280", fontWeight: "600", marginRight: 8 },
  stakeInput:    { flex: 1, fontSize: 20, fontWeight: "700", color: "#f9fafb", paddingVertical: 14 },
  stakePayoutHint: { fontSize: 12, fontWeight: "600", color: "#f59e0b" },

  submitBtn:         { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: 15, fontWeight: "700", color: "#000" },
});

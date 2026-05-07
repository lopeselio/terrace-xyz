import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import { usePrivateMarket } from "../hooks/usePrivateMarket";
import { usePlaceBet } from "../hooks/usePlaceBet";

interface Props {
  market: UnifiedMarket | null;
  visible: boolean;
  onClose: () => void;
}

function fmt(n: number) {
  return n.toFixed(2);
}

function fmtExpiry(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Status badge ────────────────────────────────────────────────────────────

function TxStatusBanner({ status, error, txSig }: {
  status: string;
  error: string | null;
  txSig: string | null;
}) {
  if (status === "idle") return null;
  if (status === "success") {
    return (
      <View style={[banner.root, banner.success]}>
        <Text style={banner.text}>
          ✅ Bet placed!{txSig ? `  ${txSig.slice(0, 8)}…` : ""}
        </Text>
      </View>
    );
  }
  if (status === "error") {
    return (
      <View style={[banner.root, banner.error]}>
        <Text style={banner.text}>⚠️ {error ?? "Transaction failed"}</Text>
      </View>
    );
  }
  return (
    <View style={[banner.root, banner.pending]}>
      <ActivityIndicator size="small" color="#f9fafb" style={{ marginRight: 8 }} />
      <Text style={banner.text}>
        {status === "building" ? "Building…" : status === "signing" ? "Waiting for signature…" : "Sending…"}
      </Text>
    </View>
  );
}

const banner = StyleSheet.create({
  root:    { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 12, marginBottom: 12 },
  success: { backgroundColor: "#14532d" },
  error:   { backgroundColor: "#7f1d1d" },
  pending: { backgroundColor: "#1e3a5f" },
  text:    { color: "#f9fafb", fontSize: 13, fontWeight: "600", flexShrink: 1 },
});

// ── Public bet panel ─────────────────────────────────────────────────────────

function PublicBetPanel({ market, onClose }: { market: UnifiedMarket; onClose: () => void }) {
  const [outcome, setOutcome] = useState<0 | 1 | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const { placeBet, status, error, txSignature } = usePlaceBet();

  const busy = status !== "idle" && status !== "success" && status !== "error";

  const handleBet = async () => {
    if (outcome === null || !amountStr) return;
    const amountUsdc = parseFloat(amountStr);
    try {
      await placeBet({
        marketId: market.id,
        isYes: outcome === 0,
        amountUsdc,
        source: market.source,
      });
    } catch {
      // status reflects the error
    }
  };

  return (
    <View>
      <TxStatusBanner status={status} error={error} txSig={txSignature ?? null} />

      {/* Outcome toggle */}
      <View style={s.outcomeRow}>
        <TouchableOpacity
          style={[s.outcomeBtn, s.yesBg, outcome === 0 && s.outcomeSel]}
          onPress={() => setOutcome(0)}
        >
          <Text style={s.outcomeLbl}>YES</Text>
          <Text style={s.outcomePrice}>{Math.round(market.yesPrice * 100)}¢</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.outcomeBtn, s.noBg, outcome === 1 && s.outcomeSel]}
          onPress={() => setOutcome(1)}
        >
          <Text style={s.outcomeLbl}>NO</Text>
          <Text style={s.outcomePrice}>{Math.round(market.noPrice * 100)}¢</Text>
        </TouchableOpacity>
      </View>

      {/* Amount input */}
      <View style={s.amountRow}>
        <Text style={s.currencyLabel}>USDC</Text>
        <TextInput
          style={s.amountInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#4b5563"
          value={amountStr}
          onChangeText={setAmountStr}
        />
      </View>

      <TouchableOpacity
        style={[s.confirmBtn, (busy || outcome === null || !amountStr) && s.confirmBtnDisabled]}
        onPress={handleBet}
        disabled={busy || outcome === null || !amountStr}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={s.confirmBtnText}>
            Confirm bet {outcome === 0 ? "YES" : outcome === 1 ? "NO" : ""}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Private bet panel ────────────────────────────────────────────────────────

function PrivateBetPanel({ market }: { market: UnifiedMarket }) {
  const [outcome, setOutcome] = useState<0 | 1 | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const { placeBet, revealMarket, claimWinnings, status, error, txSig } = usePrivateMarket();

  const busy = status !== "idle" && status !== "success" && status !== "error";

  const handleBet = async () => {
    if (outcome === null || !amountStr || !market.nativeMarketAddress) return;
    const usdcAmount = BigInt(Math.round(parseFloat(amountStr) * 1_000_000));
    try {
      await placeBet({
        market: market.nativeMarketAddress as any,
        outcome,
        amount: usdcAmount,
        usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as any,
      });
    } catch {
      // status reflects the error
    }
  };

  const handleReveal = async () => {
    if (!market.nativeMarketAddress) return;
    try {
      await revealMarket({ market: market.nativeMarketAddress as any });
    } catch {}
  };

  return (
    <View>
      {/* Private market notice */}
      <View style={s.privNotice}>
        <Text style={s.privNoticeText}>
          🔒 Private market — your position is encrypted via Arcium MPC. No one can see your bet until settlement.
        </Text>
      </View>

      <TxStatusBanner status={status} error={error} txSig={txSig} />

      <View style={s.outcomeRow}>
        <TouchableOpacity
          style={[s.outcomeBtn, s.yesBg, outcome === 0 && s.outcomeSel]}
          onPress={() => setOutcome(0)}
        >
          <Text style={s.outcomeLbl}>YES</Text>
          <Text style={s.outcomePrice}>—</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.outcomeBtn, s.noBg, outcome === 1 && s.outcomeSel]}
          onPress={() => setOutcome(1)}
        >
          <Text style={s.outcomeLbl}>NO</Text>
          <Text style={s.outcomePrice}>—</Text>
        </TouchableOpacity>
      </View>

      <View style={s.amountRow}>
        <Text style={s.currencyLabel}>USDC</Text>
        <TextInput
          style={s.amountInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#4b5563"
          value={amountStr}
          onChangeText={setAmountStr}
        />
      </View>

      <TouchableOpacity
        style={[s.confirmBtn, (busy || outcome === null || !amountStr) && s.confirmBtnDisabled]}
        onPress={handleBet}
        disabled={busy || outcome === null || !amountStr}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={s.confirmBtnText}>Place encrypted bet</Text>
        )}
      </TouchableOpacity>

      {/* Creator can reveal after expiry */}
      {market.status === "Closed" && (
        <TouchableOpacity style={s.secondaryBtn} onPress={handleReveal} disabled={busy}>
          <Text style={s.secondaryBtnText}>Reveal market (creator only)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Sheet root ───────────────────────────────────────────────────────────────

export function MarketDetailSheet({ market, visible, onClose }: Props) {
  if (!market) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.sheetWrapper}
      >
        <ScrollView style={s.sheet} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />

          {/* Header */}
          <View style={s.headerRow}>
            {market.isPrivate && (
              <View style={s.privateBadge}>
                <Text style={s.privateBadgeText}>🔒 Private</Text>
              </View>
            )}
            {market.isFlash && (
              <View style={s.flashBadge}>
                <Text style={s.flashBadgeText}>⚡ Flash</Text>
              </View>
            )}
          </View>

          <Text style={s.question}>{market.question}</Text>

          {/* Meta */}
          <View style={s.metaRow}>
            <Text style={s.metaChip}>
              {market.source === "jupiter" ? "Polymarket" : "Terrace"}
            </Text>
            <Text style={s.metaMuted}>Expires {fmtExpiry(market.expiry)}</Text>
            <Text style={s.metaMuted}>Vol {fmt(market.totalVolumeUsdc)} USDC</Text>
          </View>

          <View style={s.divider} />

          {/* Bet panel — private vs public */}
          {market.status === "Open" ? (
            market.isPrivate ? (
              <PrivateBetPanel market={market} />
            ) : (
              <PublicBetPanel market={market} onClose={onClose} />
            )
          ) : (
            <View style={s.settledNotice}>
              <Text style={s.settledText}>
                {market.status === "Settled" ? "✅ Market settled" : "🔒 Market closed"}
              </Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrapper: { justifyContent: "flex-end" },
  sheet:        { backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, maxHeight: "90%" },
  handle:       { width: 36, height: 4, backgroundColor: "#333", borderRadius: 2, alignSelf: "center", marginBottom: 16 },

  headerRow:     { flexDirection: "row", gap: 8, marginBottom: 10 },
  privateBadge:  { backgroundColor: "#1e3a5f", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  privateBadgeText: { fontSize: 12, color: "#60a5fa", fontWeight: "600" },
  flashBadge:    { backgroundColor: "#451a03", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  flashBadgeText: { fontSize: 12, color: "#f59e0b", fontWeight: "600" },

  question: { fontSize: 18, fontWeight: "700", color: "#f9fafb", lineHeight: 26, marginBottom: 12 },

  metaRow:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  metaChip:  { fontSize: 11, color: "#22c55e", fontWeight: "600", backgroundColor: "#14532d", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  metaMuted: { fontSize: 11, color: "#6b7280" },

  divider: { height: 0.5, backgroundColor: "#1e1e1e", marginBottom: 16 },

  outcomeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  outcomeBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: 0.5, borderWidth: 1.5, borderColor: "transparent" },
  outcomeSel: { opacity: 1, borderColor: "#fff" },
  yesBg:      { backgroundColor: "#14532d" },
  noBg:       { backgroundColor: "#7f1d1d" },
  outcomeLbl: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },
  outcomePrice: { fontSize: 20, fontWeight: "800", color: "#f9fafb", marginTop: 2 },

  amountRow:    { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 },
  currencyLabel: { fontSize: 13, color: "#6b7280", fontWeight: "600", marginRight: 8 },
  amountInput:  { flex: 1, fontSize: 20, fontWeight: "700", color: "#f9fafb", paddingVertical: 14 },

  confirmBtn:         { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText:     { fontSize: 15, fontWeight: "700", color: "#000" },

  secondaryBtn:     { marginTop: 10, backgroundColor: "#1a1a1a", borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 0.5, borderColor: "#333" },
  secondaryBtnText: { fontSize: 13, fontWeight: "600", color: "#9ca3af" },

  privNotice:     { backgroundColor: "#1e3a5f", borderRadius: 10, padding: 12, marginBottom: 14 },
  privNoticeText: { fontSize: 12, color: "#93c5fd", lineHeight: 18 },

  settledNotice: { alignItems: "center", paddingVertical: 24 },
  settledText:   { fontSize: 15, color: "#9ca3af", fontWeight: "600" },
});

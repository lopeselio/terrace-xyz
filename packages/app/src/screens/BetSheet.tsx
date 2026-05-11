import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import type { BetStatus } from "../hooks/usePlaceBet";

const QUICK_STAKES_NATIVE  = [1, 2, 5, 10];
const QUICK_STAKES_JUPITER = [5, 10, 25, 50];

interface Props {
  marketId: string;
  outcomeLabel: string;
  marketQuestion?: string;
  source?: "native" | "jupiter";
  /** YES price in cents (0–100) */
  yesPrice: number | null;
  onConfirm: (amountUsdc: number, isYes: boolean) => void;
  onDismiss: () => void;
  status: BetStatus;
  txSignature: string | null;
  error: string | null;
}

export function BetSheet({
  outcomeLabel,
  marketQuestion,
  source = "native",
  yesPrice,
  onConfirm,
  onDismiss,
  status,
  txSignature,
  error,
}: Props) {
  const minStake = source === "jupiter" ? 5 : 1;
  const quickStakes = source === "jupiter" ? QUICK_STAKES_JUPITER : QUICK_STAKES_NATIVE;
  const [amount, setAmount] = useState(String(minStake));

  const priceLabel = yesPrice !== null ? `${Math.round(yesPrice * 100)}¢` : "—";
  const amountNum = parseFloat(amount) || 0;
  const potentialReturn = yesPrice !== null && yesPrice >= 0.01
    ? (amountNum / yesPrice).toFixed(2)
    : "—";

  const busy = status === "building" || status === "signing" || status === "executing";

  const statusLabel = () => {
    if (status === "building")  return "Building transaction…";
    if (status === "signing")   return "Waiting for wallet…";
    if (status === "executing") return "Submitting…";
    return null;
  };

  if (status === "success") {
    const isYes = outcomeLabel.toUpperCase().includes("YES");
    const titles = isYes
      ? ["You're backing it! 🔥", "Call locked in! 🎯", "Conviction placed! ⚡"]
      : ["Bold call! 🧊", "Fading it! 🎯", "Contrarian play! 💡"];
    const title = titles[Math.floor(Date.now() / 1000) % titles.length];

    return (
      <View style={styles.root}>
        <View style={styles.handle} />

        <View style={styles.successHeader}>
          <Text style={styles.successTitle}>{title}</Text>
          {marketQuestion && (
            <Text style={styles.successMarket} numberOfLines={3}>{marketQuestion}</Text>
          )}
          <View style={[styles.successBadge, isYes ? styles.yesBadge : styles.noBadge]}>
            <Text style={styles.successBadgeText}>
              {outcomeLabel}  ·  {amountNum > 0 ? `$${amount} USDC` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.nextCard}>
          <Text style={styles.nextCardLabel}>WHAT HAPPENS NEXT</Text>
          <View style={styles.nextRow}>
            <Text style={styles.nextIcon}>📊</Text>
            <Text style={styles.nextText}>
              Track it in <Text style={styles.nextHighlight}>Profile → Active</Text> tab
            </Text>
          </View>
          <View style={styles.nextRow}>
            <Text style={styles.nextIcon}>⚖️</Text>
            <Text style={styles.nextText}>
              When the market settles, a <Text style={styles.nextHighlight}>Claim</Text> button appears if you called it right
            </Text>
          </View>
          <View style={styles.nextRow}>
            <Text style={styles.nextIcon}>💰</Text>
            <Text style={styles.nextText}>
              Winnings land directly in your wallet — no middleman, on-chain
            </Text>
          </View>
        </View>

        {txSignature && (
          <Text style={styles.successSig} numberOfLines={1}>
            tx {txSignature.slice(0, 10)}…{txSignature.slice(-6)}
          </Text>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={onDismiss}>
          <Text style={styles.doneBtnText}>Back to Markets</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.outcomeLabel}>{outcomeLabel}</Text>
          <Text style={styles.priceRow}>at {priceLabel} per contract</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Stake input */}
      <View style={styles.inputRow}>
        <Text style={styles.inputPrefix}>$</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholderTextColor="#555"
          editable={!busy}
        />
        <Text style={styles.inputSuffix}>USDC</Text>
      </View>

      {/* Quick-pick buttons */}
      <View style={styles.quickRow}>
        {quickStakes.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.quickBtn, amount === String(s) && styles.quickBtnActive]}
            onPress={() => setAmount(String(s))}
            disabled={busy}
          >
            <Text style={[styles.quickBtnText, amount === String(s) && styles.quickBtnTextActive]}>
              ${s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {source === "jupiter" && amountNum > 0 && amountNum < minStake && (
        <Text style={styles.minStakeHint}>Minimum order is ${minStake} USDC on Jupiter markets</Text>
      )}

      {/* Payout estimate */}
      <View style={styles.estimateRow}>
        <Text style={styles.estimateLabel}>Max return</Text>
        <Text style={styles.estimateValue}>
          {potentialReturn === "—" ? "—" : `$${potentialReturn} USDC`}
        </Text>
      </View>

      {/* Error */}
      {error && (
        <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
      )}

      {/* Status / CTA */}
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color="#22c55e" size="small" />
          <Text style={styles.busyText}>{statusLabel()}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.confirmBtn, amountNum < minStake && styles.confirmBtnDisabled]}
          onPress={() => onConfirm(amountNum, true)}
          disabled={amountNum < minStake}
        >
          <Text style={styles.confirmBtnText}>Back {outcomeLabel} · ${amount} USDC</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footnote}>$1 per winning contract · Jupiter · Polymarket</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#111",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  handle: { width: 36, height: 4, backgroundColor: "#333", borderRadius: 2, alignSelf: "center", marginBottom: 4 },

  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  outcomeLabel: { fontSize: 20, fontWeight: "700", color: "#fff" },
  priceRow: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  closeBtnText: { fontSize: 11, color: "#6b7280" },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "#333",
    paddingHorizontal: 16,
    height: 56,
    gap: 8,
  },
  inputPrefix: { fontSize: 20, fontWeight: "700", color: "#6b7280" },
  input: { flex: 1, fontSize: 28, fontWeight: "700", color: "#fff", padding: 0 },
  inputSuffix: { fontSize: 12, fontWeight: "600", color: "#4b5563" },

  quickRow: { flexDirection: "row", gap: 8 },
  quickBtn: { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 10, paddingVertical: 8, alignItems: "center", borderWidth: 0.5, borderColor: "#2a2a2a" },
  quickBtnActive: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  quickBtnText: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  quickBtnTextActive: { color: "#22c55e" },

  estimateRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  estimateLabel: { fontSize: 12, color: "#6b7280" },
  estimateValue: { fontSize: 12, fontWeight: "600", color: "#22c55e" },

  errorText: { fontSize: 12, color: "#f87171", textAlign: "center" },

  busyRow: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  busyText: { fontSize: 13, color: "#9ca3af" },

  confirmBtn: { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },

  footnote: { fontSize: 10, color: "#374151", textAlign: "center" },
  minStakeHint: { fontSize: 11, color: "#f59e0b", textAlign: "center" },

  // Success state
  successHeader:  { gap: 8, alignItems: "center" },
  successTitle:   { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center" },
  successMarket:  { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 18, paddingHorizontal: 8 },
  successBadge:   { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginTop: 2 },
  yesBadge:       { backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e" },
  noBadge:        { backgroundColor: "#3b0a0a", borderWidth: 1, borderColor: "#ef4444" },
  successBadgeText: { fontSize: 13, fontWeight: "700", color: "#f9fafb" },

  nextCard:       { backgroundColor: "#0d0d0d", borderRadius: 14, padding: 14, gap: 12, borderWidth: 0.5, borderColor: "#1e1e1e" },
  nextCardLabel:  { fontSize: 9, fontWeight: "700", color: "#4b5563", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  nextRow:        { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nextIcon:       { fontSize: 16, width: 22, textAlign: "center", marginTop: 1 },
  nextText:       { flex: 1, fontSize: 12, color: "#9ca3af", lineHeight: 18 },
  nextHighlight:  { color: "#22c55e", fontWeight: "600" },

  successSig:     { fontSize: 10, color: "#374151", textAlign: "center", fontFamily: "monospace" },
  doneBtn:        { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  doneBtnText:    { fontSize: 15, fontWeight: "700", color: "#000" },
});

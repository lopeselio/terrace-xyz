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

// Quick-pick stake amounts in USDC
const QUICK_STAKES = [1, 5, 10, 25];

interface Props {
  marketId: string;
  outcomeLabel: string;
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
  yesPrice,
  onConfirm,
  onDismiss,
  status,
  txSignature,
  error,
}: Props) {
  const [amount, setAmount] = useState("2");

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
    return (
      <View style={styles.root}>
        <View style={styles.handle} />
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>Bet placed!</Text>
        {txSignature && (
          <Text style={styles.successSig} numberOfLines={1}>
            {txSignature.slice(0, 12)}…{txSignature.slice(-8)}
          </Text>
        )}
        <TouchableOpacity style={styles.doneBtn} onPress={onDismiss}>
          <Text style={styles.doneBtnText}>Done</Text>
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
        {QUICK_STAKES.map((s) => (
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
          style={[styles.confirmBtn, amountNum <= 0 && styles.confirmBtnDisabled]}
          onPress={() => onConfirm(amountNum, true)}
          disabled={amountNum <= 0}
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

  // Success state
  successEmoji: { fontSize: 44, textAlign: "center" },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  successSig: { fontSize: 11, color: "#4b5563", textAlign: "center", fontFamily: "monospace" },
  doneBtn: { backgroundColor: "#1a1a1a", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  doneBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});

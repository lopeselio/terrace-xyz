import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useCreateMarket } from "../hooks/useCreateMarket";
import type { UnifiedMarket } from "@terrace/sdk";
import { ArciumBadge } from "../components/ArciumBadge";
import { broadcastLeagueEvent } from "../utils/leagueNotify";

// ---------------------------------------------------------------------------
// Expiry presets
// ---------------------------------------------------------------------------

const HEAD_TO_HEAD_PRESETS = [
  { label: "+1h",  seconds: 3_600 },
  { label: "+4h",  seconds: 14_400 },
  { label: "+24h", seconds: 86_400 },
  { label: "+7d",  seconds: 604_800 },
] as const;

const FLASH_PRESETS = [
  { label: "+15m", seconds: 900 },
  { label: "+30m", seconds: 1_800 },
  { label: "+60m", seconds: 3_600 },
  { label: "+90m", seconds: 5_400 },
] as const;

// ---------------------------------------------------------------------------

interface Props {
  walletPubkey: string | null;
  onConnectWallet: () => void;
  onMarketCreated: (market: UnifiedMarket) => void;
}

export function CreateMarketScreen({ walletPubkey, onConnectWallet, onMarketCreated }: Props) {
  const [question, setQuestion] = useState("");
  const [expiryOffset, setExpiryOffset] = useState(86_400); // default +24h
  const [creatorFeePct, setCreatorFeePct] = useState("1");
  const [isFlash, setIsFlash] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const { status, txSignature, marketAddress, error, createMarket, reset } = useCreateMarket();

  const busy = status === "building" || status === "signing" || status === "executing";

  const presets = isFlash ? FLASH_PRESETS : HEAD_TO_HEAD_PRESETS;

  // Clamp offset when switching to flash mode
  const handleFlashToggle = useCallback((val: boolean) => {
    setIsFlash(val);
    if (val && expiryOffset > 5_400) setExpiryOffset(5_400);
  }, [expiryOffset]);

  const handleSubmit = useCallback(async () => {
    if (!walletPubkey) { onConnectWallet(); return; }
    const feeBps = Math.min(500, Math.max(0, Math.round(parseFloat(creatorFeePct || "0") * 100)));
    const expiryTimestamp = Math.floor(Date.now() / 1000) + expiryOffset;
    await createMarket({ question: question.trim(), expiryTimestamp, creatorFeeBps: feeBps, isPrivate, isFlash });
  }, [walletPubkey, question, expiryOffset, creatorFeePct, isPrivate, isFlash, createMarket, onConnectWallet]);

  // After success: surface the optimistic market and reset form
  const handleDone = useCallback(() => {
    if (!marketAddress) { reset(); return; }
    const feeBps = Math.min(500, Math.max(0, Math.round(parseFloat(creatorFeePct || "0") * 100)));
    const optimistic: UnifiedMarket = {
      source: "native",
      id: marketAddress,
      nativeMarketAddress: marketAddress,
      question: question.trim(),
      yesPrice: 0.5,
      noPrice: 0.5,
      totalVolumeUsdc: 0,
      expiry: new Date((Math.floor(Date.now() / 1000) + expiryOffset) * 1000),
      status: "Open",
      isFlash,
      isPrivate,
    };
    onMarketCreated(optimistic);
    // Fan out a "market_create" event to every league the creator belongs to.
    if (walletPubkey) {
      broadcastLeagueEvent(walletPubkey, "market_create", {
        marketAddress,
        question: optimistic.question,
      });
    }
    // Reset form
    setQuestion("");
    setExpiryOffset(86_400);
    setCreatorFeePct("1");
    setIsFlash(false);
    setIsPrivate(false);
    reset();
  }, [marketAddress, question, expiryOffset, creatorFeePct, isFlash, isPrivate, onMarketCreated, reset, walletPubkey]);

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <View style={styles.root}>
        <View style={styles.successCard}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Market created!</Text>
          {txSignature && (
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
                )
              }
            >
              <Text style={styles.successSig} numberOfLines={1}>
                {txSignature.slice(0, 16)}…{txSignature.slice(-8)}
              </Text>
              <Text style={styles.explorerLink}>View on Solana Explorer ↗</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>View in Markets →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Create market</Text>
        <Text style={styles.sub}>Deploy a permissionless prediction market on Terrace</Text>

        {walletPubkey && (
          <View style={styles.creatorBanner}>
            <Text style={styles.creatorBannerLabel}>Creator (signer)</Text>
            <Text style={styles.creatorBannerAddr} numberOfLines={1}>
              {walletPubkey.slice(0, 6)}…{walletPubkey.slice(-6)}
            </Text>
          </View>
        )}

        {/* ── Question ── */}
        <Text style={styles.label}>Question</Text>
        <TextInput
          style={[styles.input, styles.questionInput]}
          placeholder="e.g. Will Arsenal finish top 4 this season?"
          placeholderTextColor="#4b5563"
          value={question}
          onChangeText={(t) => setQuestion(t.slice(0, 200))}
          multiline
          maxLength={200}
          editable={!busy}
        />
        <Text style={styles.charCount}>{question.length}/200</Text>

        {/* ── Flash toggle ── */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.label}>Flash market</Text>
            <Text style={styles.toggleSub}>In-match, 15–90 min window</Text>
          </View>
          <Switch
            value={isFlash}
            onValueChange={handleFlashToggle}
            trackColor={{ true: "#7c3aed", false: "#2a2a2a" }}
            thumbColor="#fff"
            disabled={busy}
          />
        </View>

        {/* ── Expiry presets ── */}
        <Text style={styles.label}>Expires in</Text>
        <View style={styles.presetRow}>
          {presets.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetBtn, expiryOffset === p.seconds && styles.presetBtnActive]}
              onPress={() => setExpiryOffset(p.seconds)}
              disabled={busy}
            >
              <Text style={[styles.presetText, expiryOffset === p.seconds && styles.presetTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Creator fee ── */}
        <Text style={styles.label}>Creator fee (0–5%)</Text>
        <View style={styles.feeRow}>
          <TextInput
            style={styles.feeInput}
            keyboardType="decimal-pad"
            value={creatorFeePct}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (t === "" || t === ".") { setCreatorFeePct(t); return; }
              if (!isNaN(n) && n <= 5) setCreatorFeePct(t);
            }}
            editable={!busy}
            maxLength={4}
          />
          <Text style={styles.feePct}>%</Text>
        </View>

        {/* ── Private toggle ── */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelCol}>
            <View style={styles.toggleLabelRow}>
              <Text style={styles.label}>Private market</Text>
              <ArciumBadge label="Arcium MPC" />
            </View>
            <Text style={styles.toggleSub}>Positions encrypted — hidden until MPC reveal</Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ true: "#7c3aed", false: "#2a2a2a" }}
            thumbColor="#fff"
            disabled={busy}
          />
        </View>

        {/* ── Error ── */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* ── Submit ── */}
        <TouchableOpacity
          style={[styles.submitBtn, (busy || !question.trim()) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={busy || !question.trim()}
          activeOpacity={0.8}
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitText}>{statusLabel(status)}</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>
              {walletPubkey ? "Deploy market" : "Connect wallet to deploy"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function statusLabel(s: string): string {
  if (s === "building")  return "Building transaction…";
  if (s === "signing")   return "Waiting for wallet…";
  if (s === "executing") return "Submitting…";
  return "";
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },
  scroll: { padding: 20 },

  heading: { fontSize: 24, fontWeight: "700", color: "#f9fafb", marginTop: 8 },
  sub:     { fontSize: 13, color: "#6b7280", marginTop: 4, marginBottom: 24 },

  label:   { fontSize: 12, fontWeight: "600", color: "#9ca3af", marginBottom: 6, marginTop: 16, letterSpacing: 0.5, textTransform: "uppercase" },
  charCount: { fontSize: 11, color: "#4b5563", textAlign: "right", marginTop: 4 },

  input: {
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    color: "#f9fafb",
    fontSize: 15,
    padding: 12,
  },
  questionInput: { minHeight: 80, textAlignVertical: "top" },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 4,
  },
  toggleLabelCol: { flex: 1, marginRight: 12 },
  toggleLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  toggleSub: { fontSize: 11, color: "#6b7280", marginTop: 2 },

  presetRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
    alignItems: "center",
  },
  presetBtnActive: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  presetText: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  presetTextActive: { color: "#22c55e" },

  feeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  feeInput: {
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    color: "#f9fafb",
    fontSize: 16,
    padding: 12,
    width: 80,
    textAlign: "center",
  },
  feePct: { fontSize: 16, color: "#9ca3af" },

  errorText: { color: "#f87171", fontSize: 13, marginTop: 12 },

  submitBtn: {
    marginTop: 28,
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  busyRow: { flexDirection: "row", gap: 8, alignItems: "center" },

  successCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  successEmoji: { fontSize: 48 },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#f9fafb" },
  successSig:   { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  explorerLink: { fontSize: 12, color: "#22c55e", textAlign: "center", marginTop: 4 },
  creatorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  creatorBannerLabel: { fontSize: 11, color: "#6b7280", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  creatorBannerAddr:  { fontSize: 12, color: "#22c55e", fontFamily: "monospace", fontWeight: "600" },

  doneBtn: {
    marginTop: 8,
    backgroundColor: "#052e16",
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  doneBtnText: { color: "#22c55e", fontWeight: "600", fontSize: 15 },
});

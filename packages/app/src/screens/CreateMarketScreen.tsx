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
import { broadcastLeagueEvent } from "../utils/leagueNotify";
import { color as C, font, radius } from "../theme/tokens";
import { Icon } from "../components/Icon";
import { Badge } from "../components/ui";

const HEAD_TO_HEAD_PRESETS = [
  { label: "1 hour", seconds: 3_600 },
  { label: "4 hours", seconds: 14_400 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
] as const;

const FLASH_PRESETS = [
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1_800 },
  { label: "60 min", seconds: 3_600 },
  { label: "90 min", seconds: 5_400 },
] as const;

const FEE_PRESETS = ["0", "0.5", "1", "2", "5"] as const;

interface Props {
  walletPubkey: string | null;
  onConnectWallet: () => void;
  onMarketCreated: (market: UnifiedMarket) => void;
}

export function CreateMarketScreen({ walletPubkey, onConnectWallet, onMarketCreated }: Props) {
  const [question, setQuestion] = useState("");
  const [expiryOffset, setExpiryOffset] = useState(86_400);
  const [creatorFeePct, setCreatorFeePct] = useState("1");
  const [isFlash, setIsFlash] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const { status, txSignature, marketAddress, error, createMarket, reset } = useCreateMarket();
  const busy = status === "building" || status === "signing" || status === "executing";
  const presets = isFlash ? FLASH_PRESETS : HEAD_TO_HEAD_PRESETS;

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

  const handleDone = useCallback(() => {
    if (!marketAddress) { reset(); return; }
    const feeBps = Math.min(500, Math.max(0, Math.round(parseFloat(creatorFeePct || "0") * 100)));
    void feeBps;
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
    if (walletPubkey) {
      broadcastLeagueEvent(walletPubkey, "market_create", { marketAddress, question: optimistic.question });
    }
    setQuestion("");
    setExpiryOffset(86_400);
    setCreatorFeePct("1");
    setIsFlash(false);
    setIsPrivate(false);
    reset();
  }, [marketAddress, question, expiryOffset, creatorFeePct, isFlash, isPrivate, onMarketCreated, reset, walletPubkey]);

  // ── Success ────────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <View style={s.root}>
        <View style={s.successCard}>
          <View style={s.okCircle}><Icon name="check" size={26} color={C.green} /></View>
          <Text style={s.okTitle}>Market created</Text>
          {txSignature ? (
            <TouchableOpacity onPress={() => Linking.openURL(`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`)}>
              <Text style={s.explorerLink}>View on Solana Explorer ↗</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.cta} onPress={handleDone}>
            <Text style={s.ctaTxt}>View in Markets</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const canSubmit = !busy && !!question.trim();

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.canvas }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.header}>
        <Text style={s.title}>New market</Text>
        <Text style={s.sub}>Permissionless · settles automatically</Text>
      </View>

      <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* The question */}
        <Text style={s.flabel}>The question</Text>
        <View style={s.field}>
          <TextInput
            style={s.textarea}
            placeholder="e.g. Will Arsenal beat Chelsea on Sunday?"
            placeholderTextColor={C.ink4}
            value={question}
            onChangeText={(t) => setQuestion(t.slice(0, 140))}
            multiline
            maxLength={140}
            editable={!busy}
          />
        </View>
        <View style={s.hintRow}>
          <Text style={s.hint}>Keep it settleable from the final score.</Text>
          <Text style={s.hint}>{question.length} / 140</Text>
        </View>

        {/* Closes */}
        <Text style={s.flabel}>Closes</Text>
        <View style={s.seg}>
          {presets.map((p) => {
            const on = expiryOffset === p.seconds;
            return (
              <TouchableOpacity key={p.label} style={[s.segBtn, on && s.segBtnOn]} onPress={() => setExpiryOffset(p.seconds)} disabled={busy}>
                <Text style={[s.segTxt, on && s.segTxtOn]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Your cut */}
        <Text style={s.flabel}>Your cut</Text>
        <View style={s.card}>
          <View style={s.feeTop}>
            <Text style={s.feeLabel}>Creator fee</Text>
            <Text style={s.feeVal}>{parseFloat(creatorFeePct || "0").toFixed(1)}%</Text>
          </View>
          <View style={s.feeChips}>
            {FEE_PRESETS.map((f) => {
              const on = creatorFeePct === f;
              return (
                <TouchableOpacity key={f} style={[s.feeChip, on && s.feeChipOn]} onPress={() => setCreatorFeePct(f)} disabled={busy}>
                  <Text style={[s.feeChipTxt, on && s.feeChipTxtOn]}>{f}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Options */}
        <Text style={s.flabel}>Options</Text>
        <View style={s.card}>
          <View style={[s.optRow, { borderBottomWidth: 1, borderBottomColor: C.lineHair }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.optTitle}>Flash market</Text>
              <Text style={s.optSub}>Opens in-match, 15–90 min window</Text>
            </View>
            <Switch value={isFlash} onValueChange={handleFlashToggle} trackColor={{ true: C.green, false: "#242424" }} thumbColor="#fff" disabled={busy} />
          </View>
          <View style={s.optRow}>
            <View style={{ flex: 1 }}>
              <View style={s.optTitleRow}>
                <Text style={s.optTitle}>Private league only</Text>
                <Badge tone="private" label="Arcium" icon="lock" />
              </View>
              <Text style={s.optSub}>Positions hidden until the whistle</Text>
            </View>
            <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: C.green, false: "#242424" }} thumbColor="#fff" disabled={busy} />
          </View>
        </View>

        {error ? <Text style={s.err}>{error}</Text> : null}

        <TouchableOpacity style={[s.cta, !canSubmit && s.ctaDisabled]} onPress={handleSubmit} disabled={!canSubmit} activeOpacity={0.9}>
          {busy ? (
            <View style={s.busyRow}>
              <ActivityIndicator size="small" color={C.onGreen} />
              <Text style={s.ctaTxt}>{statusLabel(status)}</Text>
            </View>
          ) : (
            <Text style={s.ctaTxt}>{walletPubkey ? "Publish market" : "Connect wallet to publish"}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function statusLabel(st: string): string {
  return st === "building" ? "Building…" : st === "signing" ? "Waiting for wallet…" : st === "executing" ? "Submitting…" : "";
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontFamily: font.condBold, fontSize: 23, fontWeight: "700", color: C.ink, letterSpacing: 0.2, textTransform: "uppercase" },
  sub: { fontFamily: font.sans, fontSize: 11, color: C.ink3, fontWeight: "500", marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 90 },

  flabel: { fontFamily: font.sansBold, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: C.ink3, marginTop: 20, marginBottom: 7 },
  field: { backgroundColor: C.deep, borderWidth: 1, borderColor: C.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  textarea: { fontFamily: font.sansMed, fontSize: 15, fontWeight: "500", color: C.ink, minHeight: 64, textAlignVertical: "top" },
  hintRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  hint: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3 },

  seg: { flexDirection: "row", backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, borderRadius: radius.md, padding: 3, gap: 2 },
  segBtn: { flex: 1, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segBtnOn: { backgroundColor: "#242424" },
  segTxt: { fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.ink2 },
  segTxtOn: { color: C.ink, fontFamily: font.sansBold, fontWeight: "700" },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.lg, padding: 14 },
  feeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  feeLabel: { fontFamily: font.sans, fontSize: 13.5, color: C.ink2 },
  feeVal: { fontFamily: font.condBold, fontSize: 24, fontWeight: "700", color: C.green },
  feeChips: { flexDirection: "row", gap: 6, marginTop: 12 },
  feeChip: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: C.deep, borderWidth: 1, borderColor: C.lineSoft, alignItems: "center" },
  feeChipOn: { backgroundColor: C.greenDeep, borderColor: C.green },
  feeChipTxt: { fontFamily: font.condBold, fontSize: 14, fontWeight: "700", color: C.ink2 },
  feeChipTxtOn: { color: C.green },

  optRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  optTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  optTitle: { fontFamily: font.sansSemi, fontSize: 14, fontWeight: "600", color: C.ink },
  optSub: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3, marginTop: 2 },

  err: { fontFamily: font.sans, fontSize: 13, color: C.redInk, marginTop: 14 },

  cta: { marginTop: 24, height: 52, borderRadius: radius.md, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  ctaDisabled: { backgroundColor: "#1c2a20" },
  ctaTxt: { fontFamily: font.sansBold, fontSize: 15, fontWeight: "700", color: C.onGreen, letterSpacing: 0.2 },
  busyRow: { flexDirection: "row", gap: 8, alignItems: "center" },

  successCard: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  okCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.greenDeep, borderWidth: 1.5, borderColor: C.green, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  okTitle: { fontFamily: font.condBold, fontSize: 26, fontWeight: "700", color: C.ink, textTransform: "uppercase", letterSpacing: 0.4 },
  explorerLink: { fontFamily: font.sans, fontSize: 12, color: C.greenInk, marginTop: 2 },
});

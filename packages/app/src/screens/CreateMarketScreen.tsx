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
import { formatDeadline } from "../utils/marketState";
import { serverNow } from "../hooks/useServerTime";

// Expiry presets (TODO Sprint 12 #5). A four-option dropdown couldn't express
// most of what fans actually create — "the next 20 minutes", "until Sunday
// evening" — so these are quick chips over the common windows, with Custom
// for anything else.
const HEAD_TO_HEAD_PRESETS = [
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1_800 },
  { label: "1h", seconds: 3_600 },
  { label: "2h", seconds: 7_200 },
  { label: "4h", seconds: 14_400 },
  { label: "8h", seconds: 28_800 },
  { label: "24h", seconds: 86_400 },
  { label: "3d", seconds: 259_200 },
  { label: "7d", seconds: 604_800 },
] as const;

// Flash markets are in-match by definition; the program enforces the window
// and these chips stay inside it.
const FLASH_PRESETS = [
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1_800 },
  { label: "45m", seconds: 2_700 },
  { label: "60m", seconds: 3_600 },
  { label: "90m", seconds: 5_400 },
] as const;

/** Bounds for the custom picker, per market kind. */
const FLASH_MIN_S = 900;
const FLASH_MAX_S = 5_400;
const NORMAL_MIN_S = 300;        // 5 minutes — below this nobody can react
const NORMAL_MAX_S = 30 * 86_400; // 30 days

const FEE_PRESETS = ["0", "0.5", "1", "2", "5"] as const;

function clampOffset(seconds: number, isFlash: boolean): number {
  const min = isFlash ? FLASH_MIN_S : NORMAL_MIN_S;
  const max = isFlash ? FLASH_MAX_S : NORMAL_MAX_S;
  return Math.min(max, Math.max(min, seconds));
}

/** "3d 19h" / "1h 30m" / "45m" — how long the market will run. */
function formatOffset(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

interface Props {
  walletPubkey: string | null;
  onConnectWallet: () => void;
  onMarketCreated: (market: UnifiedMarket) => void;
}

/** One +/- row of the custom picker. */
function StepRow({ label, value, onStep, disabled }: {
  label: string;
  value: string;
  onStep: (direction: 1 | -1) => void;
  disabled?: boolean;
}) {
  return (
    <View style={s.stepRow}>
      <Text style={s.stepLabel}>{label}</Text>
      <View style={s.stepper}>
        <TouchableOpacity style={s.stepBtn} onPress={() => onStep(-1)} disabled={disabled}>
          <Icon name="minus" size={15} color={C.ink} />
        </TouchableOpacity>
        <Text style={s.stepVal}>{value}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={() => onStep(1)} disabled={disabled}>
          <Icon name="plus" size={15} color={C.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CreateMarketScreen({ walletPubkey, onConnectWallet, onMarketCreated }: Props) {
  const [question, setQuestion] = useState("");
  const [expiryOffset, setExpiryOffset] = useState(86_400);
  const [customOpen, setCustomOpen] = useState(false);
  const [creatorFeePct, setCreatorFeePct] = useState("1");
  const [isFlash, setIsFlash] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const { status, txSignature, marketAddress, error, createMarket, reset } = useCreateMarket();
  const busy = status === "building" || status === "signing" || status === "executing";
  const presets = isFlash ? FLASH_PRESETS : HEAD_TO_HEAD_PRESETS;
  const onAPreset = presets.some((p) => p.seconds === expiryOffset);

  const handleFlashToggle = useCallback((val: boolean) => {
    setIsFlash(val);
    setExpiryOffset((prev) => clampOffset(prev, val));
  }, []);

  const stepBy = useCallback((unitSeconds: number, direction: 1 | -1) => {
    setExpiryOffset((prev) => clampOffset(prev + direction * unitSeconds, isFlash));
  }, [isFlash]);

  const handleSubmit = useCallback(async () => {
    if (!walletPubkey) { onConnectWallet(); return; }
    const feeBps = Math.min(500, Math.max(0, Math.round(parseFloat(creatorFeePct || "0") * 100)));
    // Cluster time, not the device's: the program checks the expiry against the
    // chain's clock, so a phone running two minutes fast would otherwise write
    // a deadline two minutes off what the creator picked.
    const expiryTimestamp = Math.floor(serverNow() / 1000) + expiryOffset;
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
      expiry: new Date((Math.floor(serverNow() / 1000) + expiryOffset) * 1000),
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
    setCustomOpen(false);
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
        <View style={s.chipWrap}>
          {presets.map((p) => {
            const on = expiryOffset === p.seconds && !customOpen;
            return (
              <TouchableOpacity
                key={p.label}
                style={[s.timeChip, on && s.timeChipOn]}
                onPress={() => { setExpiryOffset(p.seconds); setCustomOpen(false); }}
                disabled={busy}
              >
                <Text style={[s.timeChipTxt, on && s.timeChipTxtOn]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[s.timeChip, (customOpen || !onAPreset) && s.timeChipOn]}
            onPress={() => setCustomOpen((v) => !v)}
            disabled={busy}
          >
            <Icon name="sliders" size={13} color={customOpen || !onAPreset ? C.green : C.ink2} />
            <Text style={[s.timeChipTxt, (customOpen || !onAPreset) && s.timeChipTxtOn]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {customOpen && (
          <View style={[s.card, { marginTop: 8 }]}>
            {!isFlash && (
              <StepRow
                label="Days"
                value={String(Math.floor(expiryOffset / 86_400))}
                onStep={(d) => stepBy(86_400, d)}
                disabled={busy}
              />
            )}
            <StepRow
              label="Hours"
              value={String(Math.floor((expiryOffset % 86_400) / 3_600))}
              onStep={(d) => stepBy(3_600, d)}
              disabled={busy}
            />
            <StepRow
              label="Minutes"
              value={String(Math.floor((expiryOffset % 3_600) / 60)).padStart(2, "0")}
              onStep={(d) => stepBy(300, d)}
              disabled={busy}
            />
            <Text style={s.stepHint}>
              {isFlash ? "Flash markets run 15–90 minutes." : "Anything from 5 minutes to 30 days."}
            </Text>
          </View>
        )}

        {/* What the creator actually gets — relative and absolute, because
            "3d 19h" is the feel and the date is the commitment. */}
        <View style={s.previewRow}>
          <Icon name="clock" size={13} color={C.green} />
          <Text style={s.previewStrong}>Expires in {formatOffset(expiryOffset)}</Text>
          <Text style={s.previewMuted}>
            {formatDeadline(new Date(serverNow() + expiryOffset * 1_000))}
          </Text>
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

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  timeChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, height: 34, borderRadius: radius.pill,
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.line,
  },
  timeChipOn: { backgroundColor: C.greenDeep, borderColor: C.green },
  timeChipTxt: { fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.ink2 },
  timeChipTxtOn: { color: C.green },

  stepRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  stepLabel: { flex: 1, fontFamily: font.sans, fontSize: 13.5, color: C.ink2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: C.deep, borderWidth: 1, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  stepVal: {
    minWidth: 42, textAlign: "center",
    fontFamily: font.condBold, fontSize: 20, fontWeight: "700", color: C.ink,
    fontVariant: ["tabular-nums"],
  },
  stepHint: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3, marginTop: 6 },

  previewRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" },
  previewStrong: { fontFamily: font.sansBold, fontSize: 12.5, fontWeight: "700", color: C.green },
  previewMuted: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3 },

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

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from "react-native";
import type { BetStatus } from "../hooks/usePlaceBet";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional, money, COPY } from "../utils/format";
import { Icon } from "../components/Icon";
import { Badge } from "../components/ui";

const QUICK_STAKES_NATIVE = [1, 2, 5, 10];
const QUICK_STAKES_JUPITER = [5, 10, 25, 50];

interface Props {
  marketId: string;
  outcomeLabel: string;
  marketQuestion?: string;
  source?: "native" | "jupiter";
  /** true = backing YES, false = fading NO. */
  isYes?: boolean;
  /** Implied probability (0–1) of the chosen side, used for odds + returns. */
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
  isYes = true,
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

  const odds = probToFractional(yesPrice);
  const amountNum = parseFloat(amount) || 0;
  const returns = yesPrice !== null && yesPrice >= 0.01 ? amountNum / yesPrice : null;
  const busy = status === "building" || status === "signing" || status === "executing";
  const sideColor = isYes ? C.green : C.red;

  const statusLabel = () =>
    status === "building" ? "Building transaction…" : status === "signing" ? "Waiting for wallet…" : status === "executing" ? "Submitting…" : null;

  // ── Success ──────────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.okCircle}>
          <Icon name="check" size={26} color={C.green} />
        </View>
        <Text style={s.okTitle}>Bet placed</Text>
        <Text style={s.okSub}>
          {money(amountNum)} on {marketQuestion ?? "this market"} · {isYes ? "Back" : "Fade"} at {odds}
        </Text>
        <View style={s.okCard}>
          <Text style={s.kvK}>Returns if it lands</Text>
          <Text style={[s.kvV, { color: C.green }]}>{returns != null ? money(returns) : "—"}</Text>
        </View>
        {txSignature ? (
          <Text style={s.sig} numberOfLines={1}>tx {txSignature.slice(0, 10)}…{txSignature.slice(-6)}</Text>
        ) : null}
        <TouchableOpacity style={s.cta} onPress={onDismiss}>
          <Text style={s.ctaTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Slip ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.sheet}>
      <View style={s.grabber} />

      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          {marketQuestion ? <Text style={s.eyebrow} numberOfLines={1}>{marketQuestion}</Text> : null}
          <Text style={s.selection}>
            {(isYes ? "Back" : "Fade").toUpperCase()} <Text style={{ color: sideColor }}>{odds}</Text>
          </Text>
        </View>
        <TouchableOpacity style={s.closeBtn} onPress={onDismiss}>
          <Icon name="close" size={18} color={C.ink2} />
        </TouchableOpacity>
      </View>

      <Text style={s.flabel}>{COPY.stake}</Text>
      <View style={s.field}>
        <Text style={s.dollar}>$</Text>
        <TextInput
          style={s.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholderTextColor={C.ink4}
          editable={!busy}
        />
        <Badge tone="settled" label={`Min $${minStake}`} />
      </View>

      <View style={s.quickRow}>
        {quickStakes.map((v) => {
          const on = amount === String(v);
          return (
            <TouchableOpacity key={v} style={[s.quick, on && s.quickOn]} onPress={() => setAmount(String(v))} disabled={busy}>
              <Text style={[s.quickTxt, on && s.quickTxtOn]}>${v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.kvRow}>
        <Text style={s.kvK}>{COPY.potentialReturns}</Text>
        <Text style={[s.kvV, { color: C.green }]}>{returns != null ? money(returns) : "—"}</Text>
      </View>

      {error ? <Text style={s.err} numberOfLines={2}>{error}</Text> : null}

      {busy ? (
        <View style={s.busy}>
          <ActivityIndicator color={C.green} size="small" />
          <Text style={s.busyTxt}>{statusLabel()}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.cta, amountNum < minStake && s.ctaDisabled]}
          onPress={() => onConfirm(amountNum, isYes)}
          disabled={amountNum < minStake}
        >
          <Text style={s.ctaTxt}>{COPY.placeBet} · {money(amountNum)}</Text>
        </TouchableOpacity>
      )}

      <View style={s.trust}>
        {source === "jupiter" && <Badge tone="poly" label="Polymarket liquidity" />}
        <Badge tone="terrace" label="Settled on Solana" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: "#131313", borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderColor: C.line, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#333", alignSelf: "center", marginBottom: 14 },

  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eyebrow: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: C.ink3, marginBottom: 4 },
  selection: { fontFamily: font.condBold, fontSize: 27, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: C.ink },
  closeBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },

  flabel: { fontFamily: font.sansBold, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: C.ink3, marginTop: 18, marginBottom: 7 },
  field: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.deep, borderWidth: 1, borderColor: C.line, borderRadius: radius.md, paddingHorizontal: 14, height: 52 },
  dollar: { fontFamily: font.sansSemi, fontSize: 19, fontWeight: "600", color: C.ink3 },
  input: { flex: 1, fontFamily: font.sansSemi, fontSize: 19, fontWeight: "600", color: C.ink, padding: 0 },

  quickRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  quick: { flex: 1, minHeight: 42, borderRadius: radius.sm, backgroundColor: C.deep, borderWidth: 1, borderColor: C.lineSoft, alignItems: "center", justifyContent: "center" },
  quickOn: { backgroundColor: C.greenDeep, borderColor: C.green },
  quickTxt: { fontFamily: font.condBold, fontSize: 16, fontWeight: "700", color: C.ink },
  quickTxtOn: { color: C.green },

  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.lineHair, marginTop: 14, paddingTop: 14 },
  kvK: { fontFamily: font.sans, fontSize: 13.5, color: C.ink2 },
  kvV: { fontFamily: font.condBold, fontSize: 22, fontWeight: "700" },

  err: { fontFamily: font.sans, fontSize: 12, color: C.redInk, textAlign: "center", marginTop: 8 },
  busy: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 12, marginTop: 6 },
  busyTxt: { fontFamily: font.sans, fontSize: 13, color: C.ink2 },

  cta: { height: 52, borderRadius: radius.md, backgroundColor: C.green, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ctaDisabled: { backgroundColor: "#1c2a20" },
  ctaTxt: { fontFamily: font.sansBold, fontSize: 15, fontWeight: "700", color: C.onGreen, letterSpacing: 0.2 },

  trust: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
  sig: { fontFamily: font.sans, fontSize: 10, color: C.ink5, textAlign: "center", marginTop: 8 },

  // success
  okCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.greenDeep, borderWidth: 1.5, borderColor: C.green, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  okTitle: { fontFamily: font.condBold, fontSize: 26, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: C.ink, textAlign: "center" },
  okSub: { fontFamily: font.sans, fontSize: 13, color: C.ink2, textAlign: "center", marginTop: 4, lineHeight: 18 },
  okCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.lg, padding: 14, marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
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
import { getPrivateBetRecordPda, TERRACE_PROGRAM_ID } from "@terrace/sdk";
import * as SecureStore from "expo-secure-store";
import { usePrivateMarket } from "../hooks/usePrivateMarket";
import { useWallet } from "../hooks/useWallet";
import { usePlaceBet } from "../hooks/usePlaceBet";
import { useMarketVaultBalance } from "../hooks/useMarketVaultBalance";
import { ArciumBadge, ArciumPrivacyBanner, ArciumSettledBanner } from "./ArciumBadge";
import { BetPlacedCelebrationModal } from "./BetPlacedCelebrationModal";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional, money, moneyWhole, COPY } from "../utils/format";
import { Badge } from "./ui";
import { Icon } from "./Icon";

interface Props {
  market: UnifiedMarket | null;
  visible: boolean;
  onClose: () => void;
  /**
   * Side to open pre-selected, when the user got here by tapping Back or Fade
   * rather than the card body. Keeps a one-tap price tap from becoming three.
   */
  initialOutcome?: 0 | 1 | null;
}

function fmt(n: number) {
  return n.toFixed(2);
}

function fmtExpiry(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Status badge ────────────────────────────────────────────────────────────

function TxStatusBanner({ status, error }: {
  status: string;
  error: string | null;
}) {
  // Success is intentionally not rendered here — BetPlacedCelebrationModal
  // owns the success moment now (full-screen fan-friendly celebration).
  if (status === "idle" || status === "success") return null;
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

function PublicBetPanel({ market, onClose, initialOutcome }: { market: UnifiedMarket; onClose: () => void; initialOutcome?: 0 | 1 | null }) {
  const [outcome, setOutcome] = useState<0 | 1 | null>(initialOutcome ?? null);
  const [amountStr, setAmountStr] = useState("");
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const { placeBet, status, error, txSignature } = usePlaceBet();

  // Open the celebration the moment the tx confirms.
  useEffect(() => {
    if (status === "success" && txSignature) setCelebrationOpen(true);
  }, [status, txSignature]);

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

  const stakeForCelebration = amountStr ? parseFloat(amountStr) : null;
  const outcomeLabelForCelebration: "YES" | "NO" = outcome === 1 ? "NO" : "YES";

  return (
    <View>
      <TxStatusBanner status={status} error={error} />
      <BetPlacedCelebrationModal
        visible={celebrationOpen}
        marketQuestion={market.question}
        outcomeLabel={outcomeLabelForCelebration}
        stakeUsdc={stakeForCelebration}
        isPrivate={false}
        txSignature={txSignature ?? null}
        onDismiss={() => setCelebrationOpen(false)}
        onBackAnother={() => { setCelebrationOpen(false); onClose(); }}
      />

      {/* Back / Fade */}
      <View style={s.outcomeRow}>
        <TouchableOpacity style={[s.oddBtn, s.oddYes, outcome === 0 && s.oddYesOn]} onPress={() => setOutcome(0)}>
          <Text style={[s.oddLbl, { color: outcome === 0 ? C.green : C.greenInk }]}>BACK</Text>
          <Text style={[s.oddVal, { color: outcome === 0 ? C.green : C.ink }]}>{probToFractional(market.yesPrice)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.oddBtn, s.oddNo, outcome === 1 && s.oddNoOn]} onPress={() => setOutcome(1)}>
          <Text style={[s.oddLbl, { color: outcome === 1 ? C.red : C.redInk }]}>FADE</Text>
          <Text style={[s.oddVal, { color: outcome === 1 ? C.red : C.ink }]}>{probToFractional(market.noPrice > 0 ? market.noPrice : 1 - market.yesPrice)}</Text>
        </TouchableOpacity>
      </View>

      {/* Amount input */}
      <View style={s.amountRow}>
        <Text style={s.currencyLabel}>$</Text>
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
            {outcome === null ? "Pick a side" : COPY.placeBet}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Private bet panel ────────────────────────────────────────────────────────

function PrivateBetPanel({ market, onClose }: { market: UnifiedMarket; onClose: () => void }) {
  const [outcome, setOutcome] = useState<0 | 1 | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const { placeBet, revealMarket, claimWinnings, status, error, txSig } = usePrivateMarket();
  const { publicKey } = useWallet();

  // Open the celebration once the encrypted bet tx confirms. Only fires on
  // placeBet success (status flips through building→signing→success); reveal
  // and claim go through the same status field but those don't need a bet
  // celebration so we gate on the user having a pending outcome selection.
  useEffect(() => {
    if (status === "success" && txSig && outcome !== null) setCelebrationOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, txSig]);

  // Claim state — populated if user has an unclaimed private bet on this market
  const [hasBetSecret, setHasBetSecret] = useState(false);
  const [betOutcome, setBetOutcome] = useState<0 | 1 | null>(null);

  useEffect(() => {
    if (market.status !== "Settled" || !publicKey || !market.nativeMarketAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const [privateBetRecord] = await getPrivateBetRecordPda(
          market.nativeMarketAddress as any,
          publicKey as any,
          TERRACE_PROGRAM_ID
        );
        const stored = await SecureStore.getItemAsync(`terrace_bet_secret_${privateBetRecord}`);
        if (!cancelled && stored) {
          const parsed = JSON.parse(stored) as { secret: string; outcome: 0 | 1 };
          setHasBetSecret(true);
          setBetOutcome(parsed.outcome);
        }
      } catch {
        // no bet or SecureStore unavailable
      }
    })();
    return () => { cancelled = true; };
  }, [market.status, market.nativeMarketAddress, publicKey]);

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

  const handleClaim = async () => {
    if (!market.nativeMarketAddress || !market.creator) return;
    try {
      await claimWinnings({
        market: market.nativeMarketAddress as any,
        creator: market.creator as any,
        usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as any,
      });
      setHasBetSecret(false);
    } catch {}
  };

  // Settled state: show claim UI only
  if (market.status === "Settled") {
    return (
      <View>
        <ArciumSettledBanner />
        <TxStatusBanner status={status} error={error} />
        {hasBetSecret ? (
          <View style={s.claimSection}>
            <Text style={s.claimText}>
              You bet <Text style={{ color: betOutcome === 0 ? "#22c55e" : "#ef4444", fontWeight: "700" }}>
                {betOutcome === 0 ? "YES" : "NO"}
              </Text> on this market. If correct, claim your USDC now.
            </Text>
            <TouchableOpacity
              style={[s.claimBtn, busy && s.confirmBtnDisabled]}
              onPress={handleClaim}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={s.claimBtnInner}>
                  <Image source={require("../assets/arcium-logo.png")} style={s.claimBtnLogo} />
                  <Text style={s.claimBtnText}>Claim private winnings</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.claimSection}>
            <Text style={[s.claimText, { color: "#4b5563" }]}>
              No unclaimed private bet found for this wallet.
            </Text>
          </View>
        )}
      </View>
    );
  }

  const stakeForCelebration = amountStr ? parseFloat(amountStr) : null;
  const outcomeLabelForCelebration: "YES" | "NO" = outcome === 1 ? "NO" : "YES";

  return (
    <View>
      <ArciumPrivacyBanner subtitle="Your pick stays sealed until full-time" />
      <TxStatusBanner status={status} error={error} />
      <BetPlacedCelebrationModal
        visible={celebrationOpen}
        marketQuestion={market.question}
        outcomeLabel={outcomeLabelForCelebration}
        stakeUsdc={stakeForCelebration}
        isPrivate={true}
        txSignature={txSig ?? null}
        onDismiss={() => setCelebrationOpen(false)}
        onBackAnother={() => { setCelebrationOpen(false); onClose(); }}
      />

      <View style={s.outcomeRow}>
        <TouchableOpacity
          style={[s.outcomeBtn, s.yesBg, outcome === 0 && s.outcomeSel]}
          onPress={() => setOutcome(0)}
        >
          <Text style={s.outcomeLbl}>YES</Text>
          <Text style={s.outcomePriceSealed}>🔒</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.outcomeBtn, s.noBg, outcome === 1 && s.outcomeSel]}
          onPress={() => setOutcome(1)}
        >
          <Text style={s.outcomeLbl}>NO</Text>
          <Text style={s.outcomePriceSealed}>🔒</Text>
        </TouchableOpacity>
      </View>

      {/* Pre-reveal explainer: private markets have no price curve.
          Every YES is equal weight, every NO too — the pool decides at
          full-time after Arcium MPC reveals the encrypted totals. */}
      <Text style={s.sealedHint}>
        Pre-reveal: every YES and every NO is equal. The pool decides at full-time.
      </Text>

      <View style={s.amountRow}>
        <Text style={s.currencyLabel}>$</Text>
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
        <TouchableOpacity style={s.revealBtn} onPress={handleReveal} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#c4b5fd" />
          ) : (
            <View style={s.revealBtnInner}>
              <Image source={require("../assets/arcium-logo.png")} style={s.revealBtnLogo} />
              <Text style={s.revealBtnText}>Reveal via Arcium MPC</Text>
              <Text style={s.revealBtnSub}>Creator only</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Sheet root ───────────────────────────────────────────────────────────────

export function MarketDetailSheet({ market, visible, onClose, initialOutcome }: Props) {
  // Hook must run before any early return.
  // For private markets the on-chain total_volume is intentionally never
  // updated, so we read the market vault's USDC ATA balance instead. This
  // leaks total pool (every YES + every NO summed) but not per-side volumes.
  const vaultBalance = useMarketVaultBalance(
    market?.isPrivate ? (market.nativeMarketAddress ?? market.id) : null,
  );
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

          {/* Header badges */}
          <View style={s.headerRow}>
            <Badge tone={market.source === "jupiter" ? "poly" : "terrace"} label={market.source === "jupiter" ? "Polymarket" : "Terrace"} />
            {market.isPrivate && <Badge tone="private" label="Arcium · Private" icon="lock" />}
            {market.isFlash && <Badge tone="flash" label="Flash" icon="bolt" />}
            {market.status !== "Open" && <Badge tone="settled" label={market.status === "Settled" ? "Settled" : "Closed"} />}
          </View>

          <Text style={s.question}>{market.question}</Text>

          {/* Meta — matched pool + expiry (per-side volumes stay sealed for private) */}
          <View style={s.metaRow}>
            {market.isPrivate ? (
              <Text style={s.matched}>MATCHED {vaultBalance !== null ? money(vaultBalance) : "—"}</Text>
            ) : (
              market.totalVolumeUsdc > 0 ? <Text style={s.matched}>MATCHED {moneyWhole(market.totalVolumeUsdc)}</Text> : <View />
            )}
            <View style={{ flex: 1 }} />
            <Text style={s.metaMuted}>Expires {fmtExpiry(market.expiry)}</Text>
          </View>

          <View style={s.divider} />

          {/* Bet panel — private vs public */}
          {market.isPrivate ? (
            <PrivateBetPanel market={market} onClose={onClose} />
          ) : market.status === "Open" ? (
            <PublicBetPanel market={market} onClose={onClose} initialOutcome={initialOutcome} />
          ) : (
            <View style={s.settledNotice}>
              <Text style={s.settledText}>
                {market.status === "Settled" ? "✅ Market settled" : "Market closed"}
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
  sheet:        { backgroundColor: "#131313", borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 18, paddingTop: 8, maxHeight: "90%" },
  handle:       { width: 38, height: 4, backgroundColor: "#333", borderRadius: 2, alignSelf: "center", marginBottom: 14 },

  headerRow:     { flexDirection: "row", gap: 8, marginBottom: 10 },
  privateBadge:  { backgroundColor: "#1e3a5f", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  privateBadgeText: { fontSize: 12, color: "#60a5fa", fontWeight: "600" },
  flashBadge:    { backgroundColor: "#451a03", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  flashBadgeText: { fontSize: 12, color: "#f59e0b", fontWeight: "600" },

  question: { fontFamily: font.condBold, fontSize: 26, fontWeight: "700", color: C.ink, lineHeight: 30, letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 12 },
  matched: { fontFamily: font.sansSemi, fontSize: 11, fontWeight: "600", color: C.ink3, letterSpacing: 0.4 },

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
  outcomePriceSealed: { fontSize: 18, color: "#c4b5fd", marginTop: 4 },

  // Back / Fade fractional odd buttons (public panel)
  oddBtn:   { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center", gap: 3, borderWidth: 1 },
  oddYes:   { backgroundColor: "#0c1f14", borderColor: "#17422a" },
  oddNo:    { backgroundColor: "#1d0d0d", borderColor: "#452020" },
  oddYesOn: { backgroundColor: C.greenDeep, borderColor: C.green },
  oddNoOn:  { backgroundColor: C.redDeep, borderColor: C.red },
  oddLbl:   { fontFamily: font.sansSemi, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  oddVal:   { fontFamily: font.condBold, fontSize: 22, fontWeight: "700", letterSpacing: 0.3 },

  sealedHint: {
    fontSize: 11.5,
    color: "#a78bfa",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: -6, marginBottom: 14,
    paddingHorizontal: 8,
    lineHeight: 16,
  },

  metaMutedPool: {
    fontSize: 11,
    color: "#fbbf24",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  amountRow:    { flexDirection: "row", alignItems: "center", backgroundColor: C.deep, borderWidth: 1, borderColor: C.line, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 14 },
  currencyLabel: { fontFamily: font.sansSemi, fontSize: 19, color: C.ink3, fontWeight: "600", marginRight: 8 },
  amountInput:  { flex: 1, fontFamily: font.sansSemi, fontSize: 19, fontWeight: "600", color: C.ink, paddingVertical: 14 },

  confirmBtn:         { backgroundColor: C.green, borderRadius: radius.md, height: 52, alignItems: "center", justifyContent: "center" },
  confirmBtnDisabled: { backgroundColor: "#1c2a20" },
  confirmBtnText:     { fontFamily: font.sansBold, fontSize: 15, fontWeight: "700", color: C.onGreen, letterSpacing: 0.2 },

  // Reveal button (Arcium MPC, creator-only)
  revealBtn: {
    marginTop: 10,
    backgroundColor: "#0b0520",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#4c1d95",
    alignItems: "center",
  },
  revealBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  revealBtnLogo:  { width: 22, height: 22, borderRadius: 11 },
  revealBtnText:  { fontSize: 13, fontWeight: "700", color: "#c4b5fd", flex: 1 },
  revealBtnSub:   { fontSize: 11, color: "#5b21b6" },

  // Claim winnings section
  claimSection:   { marginTop: 8, gap: 12 },
  claimText:      { fontSize: 13, color: "#d1d5db", lineHeight: 20 },
  claimBtn:       { backgroundColor: "#2d1469", borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: "#7c3aed" },
  claimBtnInner:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  claimBtnLogo:   { width: 20, height: 20, borderRadius: 10 },
  claimBtnText:   { fontSize: 14, fontWeight: "700", color: "#e9d5ff" },

  settledNotice: { alignItems: "center", paddingVertical: 24 },
  settledText:   { fontSize: 15, color: "#9ca3af", fontWeight: "600" },
});

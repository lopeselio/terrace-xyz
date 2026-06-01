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
import { ArciumBadge, ArciumPrivacyBanner, ArciumSettledBanner } from "./ArciumBadge";
import { BetPlacedCelebrationModal } from "./BetPlacedCelebrationModal";

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

function PublicBetPanel({ market, onClose }: { market: UnifiedMarket; onClose: () => void }) {
  const [outcome, setOutcome] = useState<0 | 1 | null>(null);
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
            {market.isPrivate && <ArciumBadge label="Private · Arcium MPC" />}
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
          {market.isPrivate ? (
            <PrivateBetPanel market={market} onClose={onClose} />
          ) : market.status === "Open" ? (
            <PublicBetPanel market={market} onClose={onClose} />
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

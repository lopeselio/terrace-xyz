import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font as TF } from "../theme/tokens";
import type { UnifiedMarket } from "@terrace/sdk";
import type { Address } from "@solana/kit";
import type { Matchup } from "@terrace/sdk";
import { deserializeMarketAccount } from "@terrace/sdk";
import { useMatchup } from "../hooks/useMatchup";

const HELIUS_RPC_URL  = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const WORKER_BASE_URL = "https://terrace-notifications.terrace-xyz.workers.dev";

async function fetchMarketOutcome(marketAddr: string): Promise<number | null> {
  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getAccountInfo",
        params: [marketAddr, { encoding: "base64", commitment: "confirmed" }],
      }),
    });
    const json = await res.json();
    const b64 = json.result?.value?.data?.[0];
    if (!b64) return null;
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const market = deserializeMarketAccount(raw, marketAddr as Address);
    return market.outcome ?? null;
  } catch {
    return null;
  }
}
import { useFollowing } from "../hooks/useFollowing";
import { useTerraceUsers } from "../hooks/useTerraceUsers";
import { useWalletBalances } from "../hooks/useWalletBalances";
import { avatarColorFromPubkey } from "../hooks/useLeaderboard";
import { JerseyAvatar } from "../components/JerseyAvatar";
import type { BadgeTier } from "../hooks/useLeaderboard";
import { TerraceMark, PolyJupLogos } from "../components/BrandIcons";
import { Confetti } from "../components/Confetti";
import { cueWin } from "../utils/cues";
import { useFollowedSources } from "../hooks/useFollowedSources";
import type { UserSource } from "../hooks/useFollowedSources";
import { handleOf } from "../utils/identity";
import { truncatePubkey } from "../hooks/useLeaderboard";

type ScreenTab = "Create" | "Active" | "Challenges";

const BADGE_EMOJI: Record<BadgeTier, string> = {
  Legend: "👑",
  Sharp:  "⚡",
  Casual: "🎯",
};

// Inline source chip — mirrors SocialScreen's SourceChip using shared BrandIcons
function SourcePills({ sources }: { sources: UserSource[] }) {
  return (
    <View style={sp.row}>
      {sources.includes("terrace") && (
        <View style={[sp.pill, sp.terraceP]}>
          <TerraceMark size={10} />
          <Text style={[sp.label, sp.terraceT]}>Terrace</Text>
        </View>
      )}
      {sources.includes("polymarket") && (
        <View style={[sp.pill, sp.polyP]}>
          <PolyJupLogos size={10} />
          <Text style={[sp.label, sp.polyT]}>Polymarket</Text>
        </View>
      )}
    </View>
  );
}

const sp = StyleSheet.create({
  row:      { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  pill:     { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  terraceP: { backgroundColor: "#052e16" },
  polyP:    { backgroundColor: "#1e3a5f" },
  label:    { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  terraceT: { color: "#4ade80" },
  polyT:    { color: "#60a5fa" },
});

// People get a handle; market/vault addresses keep `truncatePubkey`.
function shortAddr(addr: string): string {
  return handleOf(addr);
}

function fmtUsdc(lamports: bigint): string {
  return `$${(Number(lamports) / 1_000_000).toFixed(2)}`;
}

const STATUS_LABEL: Record<string, string> = {
  Pending:  "⏳ Pending",
  Accepted: "⚔️ Active",
  Settled:  "✅ Settled",
  Declined: "❌ Declined",
};

// ---------------------------------------------------------------------------
// FriendAvatar — colored circle with initial + badge pip
// ---------------------------------------------------------------------------
function FriendAvatar({ pubkey, badge, size = 40 }: { pubkey: string; badge?: BadgeTier; size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <JerseyAvatar pubkey={pubkey} size={size} />
      {badge && (
        <View style={avStyle.pip}>
          <Text style={avStyle.pipText}>{BADGE_EMOJI[badge]}</Text>
        </View>
      )}
    </View>
  );
}

const avStyle = StyleSheet.create({
  circle:   { alignItems: "center", justifyContent: "center" },
  initial:  { color: "#fff", fontWeight: "700" },
  pip:      { position: "absolute", bottom: -2, right: -4 },
  pipText:  { fontSize: 12 },
});

// ---------------------------------------------------------------------------
// FriendPicker — trigger + separate sheet rendered at screen level (no Modal)
// ---------------------------------------------------------------------------
interface Friend {
  pubkey: string;
  displayName: string;
  badge: BadgeTier;
  winRate: number | null;
  totalBets: number;
  sources: UserSource[];
}

// The sheet is rendered at MatchupScreen level (sibling to tab content) to avoid
// Android z-ordering issues when Modal is nested inside an absolute-positioned overlay.
interface FriendSheetProps {
  friends: Friend[];
  selected: Friend | null;
  loading: boolean;
  walletPubkey: string | null;
  onSelect: (f: Friend) => void;
  onManualEntry: () => void;
  onClose: () => void;
}

export function FriendPickerSheet({ friends, selected, loading, walletPubkey, onSelect, onManualEntry, onClose }: FriendSheetProps) {
  const handleSelect = (f: Friend) => { onSelect(f); onClose(); };

  return (
    <View style={fp.overlay}>
      <Pressable style={fp.backdrop} onPress={onClose} />
      <View style={fp.sheet}>
        <View style={fp.sheetHeader}>
          <Text style={fp.sheetTitle}>Challenge a friend</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={fp.sheetClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color="#22c55e" style={{ marginVertical: 20 }} />}

        {!loading && !walletPubkey && (
          <View style={fp.emptyState}>
            <Text style={fp.emptyText}>Connect your wallet to see friends</Text>
          </View>
        )}

        {!loading && walletPubkey && friends.length === 0 && (
          <View style={fp.emptyState}>
            <Text style={fp.emptyEmoji}>👥</Text>
            <Text style={fp.emptyTitle}>No friends yet</Text>
            <Text style={fp.emptyText}>Follow people in the Social tab first, then challenge them here</Text>
          </View>
        )}

        <ScrollView style={fp.list} contentContainerStyle={{ gap: 2 }}>
          {friends.map((f) => {
            const isSelected = selected?.pubkey === f.pubkey;
            return (
              <TouchableOpacity
                key={f.pubkey}
                style={[fp.row, isSelected && fp.rowSelected]}
                onPress={() => handleSelect(f)}
              >
                <FriendAvatar pubkey={f.pubkey} badge={f.badge} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={fp.rowName}>{f.displayName}</Text>
                    <Text style={fp.rowBadge}>{BADGE_EMOJI[f.badge]}</Text>
                  </View>
                  <Text style={fp.rowAddr}>{shortAddr(f.pubkey)}</Text>
                  {f.sources.length > 0 && <SourcePills sources={f.sources} />}
                  <Text style={fp.rowStats}>
                    {f.totalBets} bets · {f.winRate !== null ? `${Math.round(f.winRate * 100)}% WR` : "no on-chain history"}
                  </Text>
                </View>
                {isSelected && <Text style={fp.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={fp.manualBtn} onPress={() => { onClose(); onManualEntry(); }}>
          <Text style={fp.manualBtnText}>Enter wallet address manually</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Trigger button — lives inside the scroll form
interface FriendPickerTriggerProps {
  selected: Friend | null;
  onOpen: () => void;
}

function FriendPickerTrigger({ selected, onOpen }: FriendPickerTriggerProps) {
  const content = selected ? (
    <View style={fp.triggerInner}>
      <FriendAvatar pubkey={selected.pubkey} badge={selected.badge} size={32} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={fp.triggerName}>{selected.displayName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={fp.triggerAddr}>{shortAddr(selected.pubkey)}</Text>
          {selected.sources.length > 0 && <SourcePills sources={selected.sources} />}
        </View>
      </View>
      <Text style={fp.chevron}>▾</Text>
    </View>
  ) : (
    <View style={fp.triggerInner}>
      <View style={fp.emptyAvatar}><Text style={fp.emptyAvatarText}>?</Text></View>
      <Text style={fp.triggerPlaceholder}>Pick a friend to challenge</Text>
      <Text style={fp.chevron}>▾</Text>
    </View>
  );
  return <TouchableOpacity style={fp.trigger} onPress={onOpen}>{content}</TouchableOpacity>;
}

const fp = StyleSheet.create({
  overlay:       { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  trigger:       { backgroundColor: "#111", borderRadius: 12, borderWidth: 0.5, borderColor: "#333", paddingHorizontal: 12, paddingVertical: 10 },
  triggerInner:  { flexDirection: "row", alignItems: "center", gap: 10 },
  triggerName:   { fontSize: 14, fontWeight: "600", color: "#fff" },
  triggerAddr:   { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  triggerPlaceholder: { flex: 1, fontSize: 13, color: "#555" },
  chevron:       { fontSize: 12, color: "#6b7280" },
  emptyAvatar:   { width: 32, height: 32, borderRadius: 16, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  emptyAvatarText: { fontSize: 14, color: "#555" },

  backdrop:      { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet:         { backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 32, maxHeight: "75%" },
  sheetHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  sheetTitle:    { fontSize: 17, fontWeight: "700", color: "#fff" },
  sheetClose:    { fontSize: 14, color: "#6b7280", padding: 4 },

  list:          { paddingHorizontal: 16 },
  row:           { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12 },
  rowSelected:   { backgroundColor: "#052e16" },
  rowName:       { fontSize: 14, fontWeight: "600", color: "#fff" },
  rowBadge:      { fontSize: 13 },
  rowAddr:       { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  rowStats:      { fontSize: 11, color: "#4b5563" },
  checkmark:     { fontSize: 16, color: "#22c55e", fontWeight: "700" },

  emptyState:    { alignItems: "center", paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  emptyEmoji:    { fontSize: 32 },
  emptyTitle:    { fontSize: 15, fontWeight: "700", color: "#fff" },
  emptyText:     { fontSize: 13, color: "#6b7280", textAlign: "center" },

  manualBtn:     { marginHorizontal: 16, marginTop: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5, borderColor: "#333", alignItems: "center" },
  manualBtnText: { fontSize: 13, color: "#6b7280" },
});

// ---------------------------------------------------------------------------
// MarketPicker — flat list of open Terrace markets
// ---------------------------------------------------------------------------
function MarketPicker({ markets, selected, onSelect }: {
  markets: UnifiedMarket[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const open = useMemo(
    () => markets.filter((m) => m.source === "native" && m.status === "Open"),
    [markets]
  );

  if (!open.length) {
    return (
      <View style={styles.pickerEmpty}>
        <ActivityIndicator size="small" color="#6b7280" />
        <Text style={styles.emptyText}>Loading open markets…</Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.pickerCount}>{open.length} open market{open.length !== 1 ? "s" : ""} available</Text>
      <ScrollView style={styles.picker} nestedScrollEnabled>
        {open.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.pickerItem, selected === m.id && styles.pickerItemSel]}
            onPress={() => onSelect(m.id)}
          >
            <Text style={styles.pickerItemText} numberOfLines={2}>{m.question}</Text>
            <Text style={styles.pickerItemSub}>
              {Math.round(m.yesPrice * 100)}¢ YES · {Math.round(m.noPrice * 100)}¢ NO
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}

// ---------------------------------------------------------------------------
// UsdcBalanceLine — shows wallet's devnet USDC so user knows max stake
// ---------------------------------------------------------------------------
function UsdcBalanceLine({ walletPubkey }: { walletPubkey: string | null }) {
  const { devnetUsdc } = useWalletBalances(walletPubkey);
  if (devnetUsdc === null) return null;
  return (
    <View style={ub.row}>
      <Text style={ub.label}>Your USDC balance</Text>
      <Text style={[ub.val, devnetUsdc < 1 && ub.low]}>${devnetUsdc.toFixed(2)}</Text>
    </View>
  );
}

const ub = StyleSheet.create({
  row:  { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, marginBottom: -4 },
  label:{ fontSize: 11, color: "#6b7280" },
  val:  { fontSize: 11, fontWeight: "700", color: "#22c55e" },
  low:  { color: "#f87171" },
});

// ---------------------------------------------------------------------------
// CreateTab
// ---------------------------------------------------------------------------
function CreateTab({
  markets,
  walletPubkey,
  status,
  selectedFriend,
  showManual,
  manualInput,
  onOpenFriendPicker,
  onSetShowManual,
  onSetManualInput,
  onConnectWallet,
  onSubmit,
}: {
  markets: UnifiedMarket[];
  walletPubkey: string | null;
  status: string;
  selectedFriend: Friend | null;
  showManual: boolean;
  manualInput: string;
  onOpenFriendPicker: () => void;
  onSetShowManual: (v: boolean) => void;
  onSetManualInput: (v: string) => void;
  onConnectWallet: () => void;
  onSubmit: (market: Address, opponent: Address, outcome: 0 | 1, stakeUsdc: bigint) => void;
}) {
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<0 | 1>(1);
  const [stake, setStake] = useState("5");

  const busy = status === "building" || status === "signing" || status === "executing";

  const effectiveOpponent = selectedFriend?.pubkey ?? (showManual ? manualInput.trim() : "");
  const canSubmit = !!selectedMarket && effectiveOpponent.length >= 32 && parseFloat(stake) >= 1;

  const handleSubmit = () => {
    if (!walletPubkey) { onConnectWallet(); return; }
    if (!canSubmit) return;
    onSubmit(
      selectedMarket as Address,
      effectiveOpponent as Address,
      outcome,
      BigInt(Math.round(parseFloat(stake) * 1_000_000))
    );
  };

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      <Text style={styles.fieldLabel}>Pick a market</Text>
      <MarketPicker markets={markets} selected={selectedMarket} onSelect={setSelectedMarket} />

      <Text style={styles.fieldLabel}>Your outcome</Text>
      <View style={styles.outcomeRow}>
        <TouchableOpacity
          style={[styles.outcomeBtn, styles.yesBg, outcome === 1 && styles.outcomeSel]}
          onPress={() => setOutcome(1)}
        >
          <Text style={styles.outcomeTxt}>YES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.outcomeBtn, styles.noBg, outcome === 0 && styles.outcomeSel]}
          onPress={() => setOutcome(0)}
        >
          <Text style={styles.outcomeTxt}>NO</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>Challenge</Text>
      {!showManual ? (
        <FriendPickerTrigger selected={selectedFriend} onOpen={onOpenFriendPicker} />
      ) : (
        <View style={{ gap: 6 }}>
          <TextInput
            style={styles.input}
            value={manualInput}
            onChangeText={onSetManualInput}
            placeholder="Paste Solana wallet address…"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <TouchableOpacity onPress={() => { onSetManualInput(""); onSetShowManual(false); }}>
            <Text style={styles.switchLink}>← Choose from friends instead</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedFriend && (
        <View style={styles.opponentConfirm}>
          <FriendAvatar pubkey={selectedFriend.pubkey} badge={selectedFriend.badge} size={36} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.opponentName}>{selectedFriend.displayName}</Text>
              <Text style={{ fontSize: 13 }}>{BADGE_EMOJI[selectedFriend.badge]}</Text>
            </View>
            {selectedFriend.sources.length > 0 && <SourcePills sources={selectedFriend.sources} />}
            <Text style={styles.opponentAddr}>{selectedFriend.pubkey}</Text>
          </View>
        </View>
      )}

      <UsdcBalanceLine walletPubkey={walletPubkey} />
      <Text style={styles.fieldLabel}>Stake (USDC) — equal on both sides</Text>
      <View style={styles.stakeRow}>
        {[1, 5, 10, 25].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.quickBtn, stake === String(s) && styles.quickBtnActive]}
            onPress={() => setStake(String(s))}
            disabled={busy}
          >
            <Text style={[styles.quickBtnText, stake === String(s) && styles.quickBtnTextActive]}>${s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.inputPrefix}>$</Text>
        <TextInput
          style={styles.stakeInput}
          value={stake}
          onChangeText={setStake}
          keyboardType="decimal-pad"
          placeholderTextColor="#555"
          editable={!busy}
        />
        <Text style={styles.inputSuffix}>USDC</Text>
      </View>

      {effectiveOpponent.length > 0 && parseFloat(stake) >= 1 && (
        <View style={styles.potRow}>
          <Text style={styles.potLabel}>Total pot if accepted</Text>
          <Text style={styles.potValue}>${(parseFloat(stake) * 2).toFixed(2)} USDC</Text>
        </View>
      )}

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color="#22c55e" size="small" />
          <Text style={styles.busyText}>
            {status === "building" ? "Building…" : status === "signing" ? "Waiting for wallet…" : "Submitting…"}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.confirmBtn, !canSubmit && styles.confirmBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.confirmBtnText}>
            {walletPubkey ? "⚔️ Issue Challenge" : "Connect Wallet"}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// MatchupCard
// ---------------------------------------------------------------------------
function MatchupCard({
  matchup,
  role,
  onAccept,
  onDecline,
  onSettle,
  onShare,
  busy,
  marketQuestion,
  opponentDisplayName,
  highlighted,
}: {
  matchup: Matchup;
  role: "challenger" | "opponent";
  onAccept?: (m: Matchup) => void;
  onDecline?: (m: Matchup) => void;
  onSettle?: (m: Matchup) => void;
  onShare?: (m: Matchup) => void;
  busy: boolean;
  marketQuestion?: string;
  opponentDisplayName?: string;
  highlighted?: boolean;
}) {
  const otherPubkey = role === "challenger" ? matchup.opponent : matchup.challenger;
  const myOutcome   = role === "challenger"
    ? matchup.challengerOutcome
    : (matchup.challengerOutcome === 1 ? 0 : 1) as 0 | 1;

  return (
    <View style={[mcard.root, highlighted && mcard.rootHighlighted]}>
      <View style={mcard.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <FriendAvatar pubkey={otherPubkey} size={36} />
          <View>
            <Text style={mcard.role}>{role === "challenger" ? "You challenged" : "Challenge from"}</Text>
            <Text style={mcard.addr}>{opponentDisplayName ?? shortAddr(otherPubkey)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {matchup.status === "Pending" && onShare && (
            <TouchableOpacity style={mcard.shareBtn} onPress={() => onShare(matchup)}>
              <Text style={mcard.shareBtnText}>Share</Text>
            </TouchableOpacity>
          )}
          <Text style={mcard.status}>{STATUS_LABEL[matchup.status] ?? matchup.status}</Text>
        </View>
      </View>

      <Text style={mcard.market} numberOfLines={2}>
        📍 {marketQuestion ?? truncatePubkey(String(matchup.market))}
      </Text>

      <View style={mcard.row}>
        <View style={[mcard.outcomePill, myOutcome === 1 ? mcard.yesPill : mcard.noPill]}>
          <Text style={mcard.outcomeText}>You: {myOutcome === 1 ? "YES" : "NO"}</Text>
        </View>
        <Text style={mcard.stake}>{fmtUsdc(matchup.stakeUsdc)} each · pot {fmtUsdc(matchup.stakeUsdc * 2n)}</Text>
      </View>

      {matchup.status === "Pending" && role === "opponent" && (
        <View style={mcard.actions}>
          <TouchableOpacity style={[mcard.btn, mcard.acceptBtn]} onPress={() => onAccept?.(matchup)} disabled={busy}>
            <Text style={mcard.btnText}>✓ Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[mcard.btn, mcard.declineBtn]} onPress={() => onDecline?.(matchup)} disabled={busy}>
            <Text style={[mcard.btnText, { color: "#ef4444" }]}>✕ Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {matchup.status === "Accepted" && (
        <TouchableOpacity style={[mcard.btn, mcard.settleBtn]} onPress={() => onSettle?.(matchup)} disabled={busy}>
          <Text style={mcard.btnText}>Settle matchup</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// MatchupScreen
// ---------------------------------------------------------------------------
interface Props {
  markets: UnifiedMarket[];
  walletPubkey: string | null;
  onConnectWallet: () => void;
  onClose: () => void;
  onRefreshMarkets?: () => void;
  initialMatchupAddress?: string | null;
}

export function MatchupScreen({ markets, walletPubkey, onConnectWallet, onClose, onRefreshMarkets, initialMatchupAddress }: Props) {
  const [activeTab, setActiveTab] = useState<ScreenTab>(initialMatchupAddress ? "Challenges" : "Create");
  const [localError, setLocalError] = useState<string | null>(null);

  type SettleResult = {
    currentUserWon: boolean;
    winnerDisplay: string;
    potUsdc: string;
    marketQuestion: string;
  };
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);

  // Friend-picker state hoisted here so FriendPickerSheet can be rendered
  // as a sibling to the tab content (avoids Android z-ordering issues with Modal)
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // Refresh market statuses whenever this screen opens so the picker shows
  // accurate open/settled state (prevents MarketNotOpen simulation errors).
  useEffect(() => { onRefreshMarkets?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { devnetUsdc } = useWalletBalances(walletPubkey);

  const { following, loaded: followLoaded } = useFollowing(walletPubkey);
  const { fans, loading: fansLoading } = useTerraceUsers();
  const sourcesMap = useFollowedSources(following, fans);

  const friends = useMemo<Friend[]>(() => {
    if (!followLoaded) return [];
    const fanMap = new Map(fans.map((f) => [f.pubkey, f]));
    return [...following].map((pubkey) => {
      const fan     = fanMap.get(pubkey);
      const sources = sourcesMap.get(pubkey) ?? [];
      return fan
        ? { pubkey, displayName: fan.displayName, badge: fan.badge, winRate: fan.winRate, totalBets: fan.totalBets, sources }
        : { pubkey, displayName: shortAddr(pubkey), badge: "Casual" as BadgeTier, winRate: null, totalBets: 0, sources };
    });
  }, [following, fans, sourcesMap, followLoaded]);

  const marketQuestionMap = useMemo(
    () => new Map(markets.map((m) => [m.id as string, m.question])),
    [markets]
  );

  const fanDisplayMap = useMemo(
    () => new Map(fans.map((f) => [f.pubkey, f.displayName])),
    [fans]
  );

  const {
    challengerMatchups,
    opponentMatchups,
    loadingMatchups,
    status,
    error,
    txSig,
    createMatchup,
    acceptMatchup,
    settleMatchup,
    declineMatchup,
  } = useMatchup();

  const busy = status === "building" || status === "signing" || status === "executing";
  // Error shown at screen level — local (balance) takes precedence over hook error
  const displayError = localError ?? (status === "error" ? error : null);

  const handleSettle = async (matchup: Matchup) => {
    setSettleResult(null);
    // Fetch market outcome before the tx — market must already be settled for the ix to succeed
    const outcome = await fetchMarketOutcome(matchup.market as string);
    await settleMatchup(matchup);
    // Determine winner
    if (outcome !== null) {
      const challengerWins = outcome === matchup.challengerOutcome;
      const winnerPubkey   = challengerWins ? (matchup.challenger as string) : (matchup.opponent as string);
      const currentUserWon = winnerPubkey === walletPubkey;
      const winnerDisplay  = fanDisplayMap.get(winnerPubkey) ?? shortAddr(winnerPubkey);
      const potUsdc        = `$${(Number(matchup.stakeUsdc * 2n) / 1_000_000).toFixed(2)}`;
      const marketQuestion = marketQuestionMap.get(matchup.market as string) ?? truncatePubkey(matchup.market as string);
      setSettleResult({ currentUserWon, winnerDisplay, potUsdc, marketQuestion });
      if (currentUserWon) cueWin();
    }
  };

  const handleCreate = async (market: Address, opponent: Address, outcome: 0 | 1, stakeUsdc: bigint) => {
    setLocalError(null);
    // Client-side balance gate before hitting the chain
    const stakeFloat = Number(stakeUsdc) / 1_000_000;
    if (devnetUsdc !== null && stakeFloat > devnetUsdc) {
      setLocalError(
        `Not enough USDC: you have $${devnetUsdc.toFixed(2)} but need $${stakeFloat.toFixed(2)}. Lower the stake.`
      );
      return;
    }
    try {
      await createMatchup(market, opponent, outcome, stakeUsdc);
      setActiveTab("Active");
    } catch {
      // error is set inside useMatchup and surfaced via displayError above
    }
  };

  // Clear settle result when user navigates away to avoid stale banner
  const handleTabChange = (t: ScreenTab) => { setActiveTab(t); setSettleResult(null); };

  const handleShare = async (matchup: Matchup) => {
    const addr   = matchup.address as string;
    const q      = marketQuestionMap.get(matchup.market as string) ?? "a prediction market";
    const webUrl = WORKER_BASE_URL ? `${WORKER_BASE_URL}/m/${addr}` : `terrace://matchup/${addr}`;
    try {
      await Share.share({
        title: "Terrace 1v1 Challenge",
        // Use the HTTPS URL so it's tappable in Telegram / WhatsApp / SMS.
        // The page auto-bounces to terrace://matchup/<addr> on the device.
        message:
          `⚔️ ${walletPubkey ? shortAddr(walletPubkey) : "Someone"} challenged you to a 1v1 on Terrace!\n\n` +
          `Market: ${q}\nStake: ${fmtUsdc(matchup.stakeUsdc)} USDC each\n\n` +
          `Accept the challenge: ${webUrl}`,
        url: webUrl,
      });
    } catch {}
  };

  const TABS: ScreenTab[] = ["Create", "Active", "Challenges"];
  const tabLabel: Record<ScreenTab, string> = {
    Create:     "⚔️ Create",
    Active:     `Active (${challengerMatchups.length})`,
    Challenges: `Challenges (${opponentMatchups.length})`,
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>1v1 Matchups</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, activeTab === t && styles.tabBtnActive]}
            onPress={() => handleTabChange(t)}
          >
            <Text style={[styles.tabBtnText, activeTab === t && styles.tabBtnTextActive]}>
              {tabLabel[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Always-visible status banners — above the tab content */}
      {settleResult?.currentUserWon && (
        <Confetti trigger={settleResult} height={260} />
      )}
      {settleResult ? (
        settleResult.currentUserWon ? (
          <View style={[styles.successBanner, styles.winBanner]}>
            <Text style={styles.bannerHeading}>BRAGGING RIGHTS: SECURED ⚽</Text>
            <Text style={styles.winBannerTitle}>🏆 You won!</Text>
            <Text style={styles.winBannerBody}>
              {settleResult.potUsdc} USDC is on its way to your wallet.
              Ready to take on another challenger?
            </Text>
            <Text style={styles.winBannerMarket} numberOfLines={1}>
              {settleResult.marketQuestion}
            </Text>
          </View>
        ) : (
          <View style={[styles.successBanner, styles.lossBanner]}>
            <Text style={[styles.bannerHeading, styles.lossBannerHeading]}>
              WRONG END OF THE PITCH 📋
            </Text>
            <Text style={styles.lossBannerTitle}>GG! {settleResult.winnerDisplay} takes this one</Text>
            <Text style={styles.lossBannerBody}>
              Every loss sharpens your edge. Issue a new challenge and prove your read.
            </Text>
            <Text style={styles.lossBannerMarket} numberOfLines={1}>
              {settleResult.marketQuestion}
            </Text>
          </View>
        )
      ) : status === "success" && txSig && !settleResult && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>✓ Done · tx {txSig.slice(0, 8)}…</Text>
        </View>
      )}
      {displayError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠ {displayError}</Text>
        </View>
      )}

      {activeTab === "Create" && (
        <CreateTab
          markets={markets}
          walletPubkey={walletPubkey}
          status={status}
          selectedFriend={selectedFriend}
          showManual={showManual}
          manualInput={manualInput}
          onOpenFriendPicker={() => setFriendPickerOpen(true)}
          onSetShowManual={setShowManual}
          onSetManualInput={setManualInput}
          onConnectWallet={onConnectWallet}
          onSubmit={handleCreate}
        />
      )}

      {activeTab === "Active" && (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <UsdcBalanceLine walletPubkey={walletPubkey} />
          {loadingMatchups && <ActivityIndicator color="#22c55e" style={{ marginTop: 20 }} />}
          {!loadingMatchups && challengerMatchups.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⚔️</Text>
              <Text style={styles.emptyTitle}>No active matchups</Text>
              <Text style={styles.emptySub}>Issue a challenge from the Create tab</Text>
            </View>
          )}
          {challengerMatchups.map((m) => (
            <MatchupCard
              key={m.address}
              matchup={m}
              role="challenger"
              onSettle={handleSettle}
              onShare={handleShare}
              busy={busy}
              marketQuestion={marketQuestionMap.get(m.market as string)}
              opponentDisplayName={fanDisplayMap.get(m.opponent) ?? shortAddr(m.opponent)}
            />
          ))}
        </ScrollView>
      )}

      {activeTab === "Challenges" && (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <UsdcBalanceLine walletPubkey={walletPubkey} />
          {loadingMatchups && <ActivityIndicator color="#22c55e" style={{ marginTop: 20 }} />}
          {!loadingMatchups && opponentMatchups.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🏳️</Text>
              <Text style={styles.emptyTitle}>No challenges</Text>
              <Text style={styles.emptySub}>Share your wallet address for others to challenge you</Text>
            </View>
          )}
          {opponentMatchups.map((m) => (
            <MatchupCard
              key={m.address}
              matchup={m}
              role="opponent"
              onAccept={acceptMatchup}
              onDecline={declineMatchup}
              onSettle={handleSettle}
              busy={busy}
              marketQuestion={marketQuestionMap.get(m.market as string)}
              opponentDisplayName={fanDisplayMap.get(m.challenger) ?? shortAddr(m.challenger)}
              highlighted={(m.address as string) === initialMatchupAddress}
            />
          ))}
        </ScrollView>
      )}

      {/* FriendPickerSheet rendered as absolute overlay at screen root to avoid
          Android z-ordering issues when inside a nested absolute-positioned view */}
      {friendPickerOpen && (
        <FriendPickerSheet
          friends={friends}
          selected={selectedFriend}
          loading={!followLoaded || fansLoading}
          walletPubkey={walletPubkey}
          onSelect={(f) => { setSelectedFriend(f); setShowManual(false); }}
          onManualEntry={() => { setSelectedFriend(null); setShowManual(true); setFriendPickerOpen(false); }}
          onClose={() => setFriendPickerOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: "#0a0a0a" },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:   { fontFamily: TF.condBold, fontSize: 22, fontWeight: "700", color: "#fff", letterSpacing: 0.3, textTransform: "uppercase" },
  closeBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  closeBtnText:  { fontSize: 12, color: "#6b7280" },

  tabBar:        { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  tabBtn:        { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#1a1a1a", alignItems: "center" },
  tabBtnActive:  { backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e" },
  tabBtnText:    { fontSize: 11, fontWeight: "600", color: "#6b7280" },
  tabBtnTextActive: { color: "#22c55e" },

  successBanner: { marginHorizontal: 16, marginBottom: 6, backgroundColor: "#052e16", borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: "#22c55e" },
  successText:   { color: "#22c55e", fontSize: 12, fontWeight: "600", textAlign: "center" },

  bannerHeading:    { fontSize: 13, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center", color: "#22c55e", marginBottom: 4 },
  lossBannerHeading:{ color: "#ef4444" },

  winBanner:       { backgroundColor: "#052e16", borderColor: "#22c55e", padding: 14, gap: 4 },
  winBannerTitle:  { color: "#22c55e", fontSize: 16, fontWeight: "800", textAlign: "center" },
  winBannerBody:   { color: "#86efac", fontSize: 12, textAlign: "center", lineHeight: 17 },
  winBannerMarket: { color: "#4ade80", fontSize: 11, textAlign: "center", opacity: 0.7, marginTop: 2 },

  lossBanner:       { backgroundColor: "#1c0a0a", borderColor: "#ef4444", borderWidth: 0.5, borderRadius: 10, marginHorizontal: 16, marginBottom: 6, padding: 14, gap: 4 },
  lossBannerTitle:  { color: "#fca5a5", fontSize: 14, fontWeight: "700", textAlign: "center" },
  lossBannerBody:   { color: "#f87171", fontSize: 12, textAlign: "center", lineHeight: 17 },
  lossBannerMarket: { color: "#ef4444", fontSize: 11, textAlign: "center", marginTop: 2, opacity: 0.7 },
  errorBanner:   { marginHorizontal: 16, marginBottom: 6, backgroundColor: "#3b0a0a", borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: "#ef4444" },
  errorBannerText: { color: "#f87171", fontSize: 12, fontWeight: "600", textAlign: "center" },

  tabContent:    { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  fieldLabel:    { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" },

  pickerCount:   { fontSize: 10, color: "#22c55e", fontWeight: "600", marginBottom: 4 },
  pickerEmpty:   { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  picker:        { maxHeight: 180, backgroundColor: "#111", borderRadius: 12, borderWidth: 0.5, borderColor: "#2a2a2a" },
  pickerItem:    { padding: 12, borderBottomWidth: 0.5, borderBottomColor: "#1a1a1a" },
  pickerItemSel: { backgroundColor: "#052e16" },
  pickerItemText: { fontSize: 13, color: "#fff", fontWeight: "500" },
  pickerItemSub: { fontSize: 11, color: "#6b7280", marginTop: 2 },

  outcomeRow:    { flexDirection: "row", gap: 10 },
  outcomeBtn:    { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  yesBg:         { backgroundColor: "#052e16" },
  noBg:          { backgroundColor: "#3b0a0a" },
  outcomeSel:    { borderColor: "#22c55e" },
  outcomeTxt:    { fontSize: 14, fontWeight: "700", color: "#fff" },

  opponentConfirm: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#111", borderRadius: 12, padding: 10, borderWidth: 0.5, borderColor: "#22c55e" },
  opponentName:  { fontSize: 14, fontWeight: "600", color: "#fff" },
  opponentAddr:  { fontSize: 10, color: "#6b7280", fontFamily: "monospace" },

  input:         { backgroundColor: "#111", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", fontSize: 12, borderWidth: 0.5, borderColor: "#333", fontFamily: "monospace" },
  switchLink:    { fontSize: 12, color: "#22c55e" },
  inputRow:      { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 0.5, borderColor: "#333", paddingHorizontal: 14, height: 50, gap: 6 },
  inputPrefix:   { fontSize: 18, fontWeight: "700", color: "#6b7280" },
  stakeInput:    { flex: 1, fontSize: 22, fontWeight: "700", color: "#fff", padding: 0 },
  inputSuffix:   { fontSize: 11, fontWeight: "600", color: "#4b5563" },

  stakeRow:      { flexDirection: "row", gap: 8 },
  quickBtn:      { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 10, paddingVertical: 8, alignItems: "center", borderWidth: 0.5, borderColor: "#2a2a2a" },
  quickBtnActive: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  quickBtnText:  { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  quickBtnTextActive: { color: "#22c55e" },

  potRow:        { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  potLabel:      { fontSize: 12, color: "#6b7280" },
  potValue:      { fontSize: 12, fontWeight: "700", color: "#22c55e" },

  errorText:     { fontSize: 12, color: "#f87171" },
  busyRow:       { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  busyText:      { fontSize: 13, color: "#9ca3af" },
  confirmBtn:    { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },

  emptyState:    { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 8 },
  emptyEmoji:    { fontSize: 40 },
  emptyTitle:    { fontSize: 16, fontWeight: "700", color: "#fff" },
  emptySub:      { fontSize: 13, color: "#6b7280", textAlign: "center", paddingHorizontal: 30 },
  emptyText:     { color: "#6b7280", fontSize: 13, padding: 12 },
});

const mcard = StyleSheet.create({
  root:            { backgroundColor: "#111", borderRadius: 14, padding: 14, gap: 10, borderWidth: 0.5, borderColor: "#1e1e1e" },
  rootHighlighted: { borderColor: "#22c55e", borderWidth: 1 },
  shareBtn:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#0a2e0a", borderWidth: 0.5, borderColor: "#22c55e" },
  shareBtnText:    { fontSize: 10, fontWeight: "700", color: "#22c55e" },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  role:        { fontSize: 11, color: "#6b7280" },
  addr:        { fontSize: 12, fontWeight: "600", color: "#9ca3af" },
  status:      { fontSize: 11, color: "#6b7280" },
  market:      { fontSize: 12, color: "#9ca3af", lineHeight: 17 },
  row:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  outcomePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  yesPill:     { backgroundColor: "#052e16" },
  noPill:      { backgroundColor: "#3b0a0a" },
  outcomeText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  stake:       { fontSize: 11, color: "#22c55e", fontWeight: "600" },
  actions:     { flexDirection: "row", gap: 8 },
  btn:         { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  acceptBtn:   { backgroundColor: "#22c55e" },
  declineBtn:  { backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#3b0a0a" },
  settleBtn:   { backgroundColor: "#1a1a1a", borderWidth: 0.5, borderColor: "#6b7280" },
  btnText:     { fontSize: 13, fontWeight: "700", color: "#fff" },
});

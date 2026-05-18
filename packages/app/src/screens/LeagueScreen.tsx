import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Share,
  Clipboard,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { League, LeagueMember } from "@terrace/sdk";
import { useLeague } from "../hooks/useLeague";
import type { EligibleBet } from "../hooks/useLeague";
import { avatarColorFromPubkey } from "../hooks/useLeaderboard";
import { ArciumBadge, ArciumPrivacyBanner } from "../components/ArciumBadge";

// ── Helpers ───────────────────────────────────────────────────────────────────

// HTTPS landing URL — makes invite links clickable in Telegram/WhatsApp.
// Set EXPO_PUBLIC_LANDING_URL in .env to your deployed domain.
const LANDING_URL = (process.env.EXPO_PUBLIC_LANDING_URL ?? "").replace(/\/$/, "");
function inviteUrl(leagueAddress: string) {
  return LANDING_URL
    ? `${LANDING_URL}/league/${leagueAddress}`
    : `terrace://league/${leagueAddress}`;
}

function shortAddr(addr: string) { return `${addr.slice(0, 5)}…${addr.slice(-4)}`; }
function fmtUsdc(n: bigint) { return `$${(Number(n) / 1_000_000).toFixed(2)}`; }

function MemberAvatar({ pubkey, size = 36 }: { pubkey: string; size?: number }) {
  const bg = avatarColorFromPubkey(pubkey);
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[av.initial, { fontSize: size * 0.38 }]}>{pubkey.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  circle:  { alignItems: "center", justifyContent: "center" },
  initial: { color: "#fff", fontWeight: "700" },
});

// ── Sub-screens ───────────────────────────────────────────────────────────────

type Tab = "My Leagues" | "Create" | "Join";

// ── LeagueCard ────────────────────────────────────────────────────────────────

function LeagueCard({
  league,
  myPubkey,
  onOpen,
}: {
  league: League;
  myPubkey: string | null;
  onOpen: (l: League) => void;
}) {
  const isCreator = myPubkey === String(league.creator);
  return (
    <TouchableOpacity style={s.leagueCard} activeOpacity={0.8} onPress={() => onOpen(league)}>
      <View style={s.leagueCardHeader}>
        <Text style={s.leagueName}>{league.name}</Text>
        {league.isPrivate && <ArciumBadge label="Private · Arcium MPC" />}
      </View>
      <View style={s.leagueMeta}>
        <Text style={s.metaText}>GW {league.gameweek}</Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.metaText}>{league.memberCount}/{league.maxMembers} members</Text>
        {league.entryFeeUsdc > 0n && <>
          <Text style={s.metaDot}>·</Text>
          <Text style={s.metaText}>Entry {fmtUsdc(league.entryFeeUsdc)}</Text>
        </>}
        {league.prizePool > 0n && <>
          <Text style={s.metaDot}>·</Text>
          <Text style={[s.metaText, { color: "#fbbf24" }]}>Pool {fmtUsdc(league.prizePool)}</Text>
        </>}
      </View>
      {isCreator && <Text style={s.creatorBadge}>You created this</Text>}
    </TouchableOpacity>
  );
}

// ── LeaderboardSheet ─────────────────────────────────────────────────────────

function LeaderboardSheet({
  league,
  members,
  loading,
  myPubkey,
  isCreator,
  busy,
  eligibleBets,
  loadingEligible,
  notAMember,
  onAdvanceGameweek,
  onJoinLeague,
  onScoreWin,
  onClose,
}: {
  league: League;
  members: LeagueMember[];
  loading: boolean;
  myPubkey: string | null;
  isCreator: boolean;
  busy: boolean;
  eligibleBets: EligibleBet[];
  loadingEligible: boolean;
  notAMember: boolean;
  onAdvanceGameweek: () => void;
  onJoinLeague: () => void;
  onScoreWin: (betAddress: string, marketAddress: string) => void;
  onClose: () => void;
}) {
  const [pendingScore, setPendingScore] = useState<EligibleBet | null>(null);

  const handleShare = useCallback(async () => {
    const link = inviteUrl(String(league.address));
    try {
      await Share.share({ message: `Join my league "${league.name}" on Terrace!\n${link}` });
    } catch {}
  }, [league]);

  const handleCopyInvite = useCallback(() => {
    Clipboard.setString(inviteUrl(String(league.address)));
  }, [league]);

  return (
    <View style={s.sheet}>
      <View style={s.sheetHandle} />
      <View style={s.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.sheetTitle}>{league.name}</Text>
          <Text style={s.sheetSub}>Season {league.season} · Gameweek {league.gameweek}</Text>
          {league.isPrivate && <View style={{ marginTop: 6 }}><ArciumBadge label="Private · Arcium MPC" /></View>}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={s.sheetActions}>
        <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
          <Text style={s.actionBtnText}>Share invite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleCopyInvite}>
          <Text style={s.actionBtnText}>Copy link</Text>
        </TouchableOpacity>
        {isCreator && (
          <TouchableOpacity
            style={[s.actionBtn, s.advanceBtn, busy && s.btnDisabled]}
            onPress={onAdvanceGameweek}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[s.actionBtnText, { color: "#fbbf24" }]}>Advance GW</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* Score your wins */}
      {loadingEligible ? (
        <ActivityIndicator color="#22c55e" style={{ marginBottom: 16 }} />
      ) : notAMember ? (
        <TouchableOpacity
          style={[s.eligibleSection, { backgroundColor: "#1a1200", borderColor: "#78350f" }]}
          onPress={onJoinLeague}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={[s.eligibleTitle, { color: "#fbbf24" }]}>Join to score your wins</Text>
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>
            You're the creator but haven't joined yet. Tap to join and start scoring points.
          </Text>
        </TouchableOpacity>
      ) : eligibleBets.length > 0 ? (
        <View style={s.eligibleSection}>
          <Text style={s.eligibleTitle}>Score your wins ({eligibleBets.length})</Text>
          {eligibleBets.map((b) => (
            <TouchableOpacity
              key={String(b.betAddress)}
              style={[s.eligibleRow, busy && s.btnDisabled]}
              onPress={() => setPendingScore(b)}
              disabled={busy}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.eligibleQuestion} numberOfLines={2}>{b.marketQuestion}</Text>
                <Text style={s.eligibleMeta}>${(Number(b.amount) / 1_000_000).toFixed(2)} stake</Text>
              </View>
              <Text style={s.eligibleCta}>+1 pt →</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <Text style={[s.leaderboardTitle, { marginBottom: 0, flex: 1 }]}>
          Gameweek {league.gameweek} Leaderboard
        </Text>
        {league.isPrivate && (
          <Text style={s.privateNote}>🔒 Scores hidden until reveal</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#22c55e" style={{ marginTop: 24 }} />
      ) : members.length === 0 ? (
        <Text style={s.emptyText}>No scores yet this gameweek</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {members.map((m, idx) => {
            const isMe = myPubkey === String(m.member);
            const gw = m.lastScoredGameweek === league.gameweek ? m.gameweekScore : 0;
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
            // In private leagues, hide other members' scores — only show your own
            const scoreHidden = league.isPrivate && !isMe;
            return (
              <View key={String(m.address)} style={[s.memberRow, isMe && s.memberRowMe]}>
                {isMe && <View style={s.memberAccent} />}
                <Text style={medal ? s.rankMedal : s.rank}>{medal ?? `#${idx + 1}`}</Text>
                <MemberAvatar pubkey={String(m.member)} size={30} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.memberAddr, isMe && s.memberAddrMe]}>
                    {isMe ? "You" : shortAddr(String(m.member))}
                  </Text>
                  <Text style={s.memberTotal}>
                    {scoreHidden ? "—  total pts" : `${m.totalScore} total pts`}
                  </Text>
                </View>
                <View style={s.scoreBlock}>
                  {scoreHidden ? (
                    <Text style={s.gwScoreLocked}>🔒</Text>
                  ) : (
                    <Text style={[s.gwScore, gw === 0 && s.gwScoreZero]}>{gw}</Text>
                  )}
                  <Text style={s.gwLabel}>{scoreHidden ? "private" : "GW pts"}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Score confirmation modal */}
      {pendingScore && (
        <View style={s.confirmOverlay}>
          <View style={s.confirmCard}>
            <Text style={s.confirmHeading}>Score this win?</Text>
            <Text style={s.confirmQuestion}>{pendingScore.marketQuestion}</Text>
            <Text style={s.confirmStake}>${(Number(pendingScore.amount) / 1_000_000).toFixed(2)} stake · +1 league point</Text>
            <View style={s.confirmActions}>
              <TouchableOpacity style={s.confirmCancelBtn} onPress={() => setPendingScore(null)}>
                <Text style={s.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmScoreBtn, busy && s.btnDisabled]}
                disabled={busy}
                onPress={() => {
                  const b = pendingScore;
                  setPendingScore(null);
                  onScoreWin(String(b.betAddress), b.marketAddress);
                }}
              >
                {busy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.confirmScoreText}>Confirm +1 pt →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ── CreateTab ─────────────────────────────────────────────────────────────────

function CreateTab({
  busy,
  stepLabel,
  onSubmit,
}: {
  busy: boolean;
  stepLabel: string | null;
  onSubmit: (params: { name: string; isPrivate: boolean; entryFeeUsdc: bigint; maxMembers: number }) => void;
}) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [entryFee, setEntryFee] = useState("");
  const [maxMembers, setMaxMembers] = useState("20");

  const valid = name.trim().length > 0 && name.trim().length <= 50;

  const handleCreate = useCallback(() => {
    if (!valid) return;
    const fee = parseFloat(entryFee) || 0;
    const max = parseInt(maxMembers, 10) || 20;
    onSubmit({
      name: name.trim(),
      isPrivate,
      entryFeeUsdc: BigInt(Math.round(fee * 1_000_000)),
      maxMembers: Math.min(Math.max(max, 2), 50),
    });
  }, [name, isPrivate, entryFee, maxMembers, valid, onSubmit]);

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>League name</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. The Sharp Eleven"
        placeholderTextColor="#4b5563"
        maxLength={50}
      />

      <Text style={s.formLabel}>Max members</Text>
      <TextInput
        style={s.input}
        value={maxMembers}
        onChangeText={setMaxMembers}
        keyboardType="numeric"
        placeholder="20"
        placeholderTextColor="#4b5563"
      />

      <Text style={s.formLabel}>Entry fee (USDC, 0 = free)</Text>
      <TextInput
        style={s.input}
        value={entryFee}
        onChangeText={setEntryFee}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#4b5563"
      />

      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Text style={s.formLabel}>Private league</Text>
            <ArciumBadge />
          </View>
          <Text style={s.formSub}>Standings hidden until reveal (Arcium MPC)</Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          trackColor={{ false: "#1f2937", true: "#1e3a5f" }}
          thumbColor={isPrivate ? "#60a5fa" : "#374151"}
        />
      </View>
      {isPrivate && (
        <ArciumPrivacyBanner
          subtitle="League standings encrypted until gameweek ends"
          bullets={[
            "🔒  Member scores hidden from all other players",
            "👁  Standings revealed only via Arcium MPC",
            "⚡  Trustless reveal at end of each gameweek",
          ]}
        />
      )}

      <TouchableOpacity
        style={[s.createBtn, (!valid || busy) && s.btnDisabled]}
        onPress={handleCreate}
        disabled={!valid || busy}
        activeOpacity={0.8}
      >
        {busy ? (
          <View style={{ alignItems: "center", gap: 6 }}>
            <ActivityIndicator color="#fff" />
            {stepLabel && <Text style={s.stepLabel}>{stepLabel}</Text>}
          </View>
        ) : (
          <Text style={s.createBtnText}>Create league</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── JoinTab ───────────────────────────────────────────────────────────────────

function JoinTab({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (address: string) => void;
}) {
  const [address, setAddress] = useState("");
  const valid = address.trim().length >= 32;

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>League address or invite link</Text>
      <TextInput
        style={[s.input, { height: 80 }]}
        value={address}
        onChangeText={(v) => {
          // Strip terrace://league/ prefix if pasted from a deep link
          const cleaned = v.replace(/^terrace:\/\/league\//, "").trim();
          setAddress(cleaned);
        }}
        placeholder="Paste invite link or league address"
        placeholderTextColor="#4b5563"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[s.createBtn, (!valid || busy) && s.btnDisabled]}
        onPress={() => onSubmit(address.trim())}
        disabled={!valid || busy}
        activeOpacity={0.8}
      >
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.createBtnText}>Join league</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── LeagueScreen (root) ───────────────────────────────────────────────────────

interface Props {
  walletPubkey: string | null;
  onConnectWallet?: () => void;
  onClose: () => void;
}

export function LeagueScreen({ walletPubkey, onConnectWallet, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("My Leagues");
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const {
    myLeagues,
    joinedLeagues,
    leaderboard,
    eligibleBets,
    notAMember,
    loading,
    loadingLeaderboard,
    loadingEligible,
    status,
    createStep,
    error,
    createLeague,
    joinLeague,
    recordWin,
    advanceGameweek,
    loadLeaderboard,
    loadEligibleBets,
    refresh,
  } = useLeague(walletPubkey);

  const busy = status === "building" || status === "signing";

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const handleOpenLeague = useCallback((league: League) => {
    setSelectedLeague(league);
    loadLeaderboard(String(league.address));
    loadEligibleBets(String(league.address));
  }, [loadLeaderboard, loadEligibleBets]);

  const handleScoreWin = useCallback(async (betAddress: string, marketAddress: string) => {
    if (!selectedLeague) return;
    try {
      await recordWin({ leagueAddress: String(selectedLeague.address), marketAddress });
      showToast("+1 point scored!");
      loadLeaderboard(String(selectedLeague.address));
      loadEligibleBets(String(selectedLeague.address));
    } catch (e: any) {
      showToast(e?.message ?? "Failed to score win");
    }
  }, [selectedLeague, recordWin, loadLeaderboard, loadEligibleBets]);

  const handleCreate = useCallback(async (params: {
    name: string;
    isPrivate: boolean;
    entryFeeUsdc: bigint;
    maxMembers: number;
  }) => {
    if (!walletPubkey) { onConnectWallet?.(); return; }
    try {
      const { leagueAddress } = await createLeague(params);
      showToast(`League created! Share: ${inviteUrl(leagueAddress)}`);
      setTab("My Leagues");
    } catch (e: any) {
      showToast(e?.message ?? "Failed to create league");
    }
  }, [walletPubkey, createLeague, onConnectWallet]);

  const handleJoin = useCallback(async (address: string) => {
    if (!walletPubkey) { onConnectWallet?.(); return; }
    try {
      await joinLeague(address);
      showToast("Joined league!");
      setTab("My Leagues");
    } catch (e: any) {
      showToast(e?.message ?? "Failed to join league");
    }
  }, [walletPubkey, joinLeague, onConnectWallet]);

  const handleAdvanceGameweek = useCallback(async () => {
    if (!selectedLeague) return;
    try {
      await advanceGameweek(String(selectedLeague.address));
      showToast("Gameweek advanced!");
      loadLeaderboard(String(selectedLeague.address));
    } catch (e: any) {
      showToast(e?.message ?? "Failed to advance gameweek");
    }
  }, [selectedLeague, advanceGameweek, loadLeaderboard]);

  const handleJoinFromSheet = useCallback(async () => {
    if (!selectedLeague || !walletPubkey) return;
    try {
      await joinLeague(String(selectedLeague.address));
      showToast("Joined! Now you can score your wins.");
      loadEligibleBets(String(selectedLeague.address));
      loadLeaderboard(String(selectedLeague.address));
    } catch (e: any) {
      showToast(e?.message ?? "Failed to join league");
    }
  }, [selectedLeague, walletPubkey, joinLeague, loadEligibleBets, loadLeaderboard]);

  // Deduplicate: myLeagues + joinedLeagues
  const allLeagues = [
    ...myLeagues,
    ...joinedLeagues.filter((jl) => !myLeagues.some((ml) => String(ml.address) === String(jl.address))),
  ];

  const TABS: Tab[] = ["My Leagues", "Create", "Join"];

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Leagues</Text>
        <TouchableOpacity onPress={refresh} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.refreshBtn}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabItem, tab === t && s.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === "My Leagues" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#22c55e" />}>
          {!walletPubkey ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🏆</Text>
              <Text style={s.emptyTitle}>Connect wallet to see your leagues</Text>
              <TouchableOpacity style={s.connectBtn} onPress={onConnectWallet}>
                <Text style={s.connectBtnText}>Connect wallet</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <ActivityIndicator color="#22c55e" style={{ marginTop: 40 }} />
          ) : allLeagues.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🏆</Text>
              <Text style={s.emptyTitle}>No leagues yet</Text>
              <Text style={s.emptySub}>Create one or join via an invite link</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={s.connectBtn} onPress={() => setTab("Create")}>
                  <Text style={s.connectBtnText}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.connectBtn, { backgroundColor: "#1a1a1a" }]} onPress={() => setTab("Join")}>
                  <Text style={s.connectBtnText}>Join</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            allLeagues.map((league) => (
              <LeagueCard
                key={String(league.address)}
                league={league}
                myPubkey={walletPubkey}
                onOpen={handleOpenLeague}
              />
            ))
          )}
        </ScrollView>
      )}

      {tab === "Create" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
          <CreateTab busy={busy} stepLabel={createStep} onSubmit={handleCreate} />
        </ScrollView>
      )}

      {tab === "Join" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
          <JoinTab busy={busy} onSubmit={handleJoin} />
        </ScrollView>
      )}

      {/* Leaderboard sheet overlay */}
      {selectedLeague && (
        <View style={s.overlay}>
          <LeaderboardSheet
            league={selectedLeague}
            members={leaderboard}
            loading={loadingLeaderboard}
            myPubkey={walletPubkey}
            isCreator={walletPubkey === String(selectedLeague.creator)}
            busy={busy}
            eligibleBets={eligibleBets}
            loadingEligible={loadingEligible}
            notAMember={notAMember}
            onAdvanceGameweek={handleAdvanceGameweek}
            onJoinLeague={handleJoinFromSheet}
            onScoreWin={handleScoreWin}
            onClose={() => setSelectedLeague(null)}
          />
        </View>
      )}

      {/* Toast */}
      {toast && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: "#0a0a0a" },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#1f1f1f" },
  headerTitle:   { fontSize: 16, fontWeight: "700", color: "#fff" },
  closeBtn:      { fontSize: 18, color: "#6b7280", fontWeight: "600" },
  refreshBtn:    { fontSize: 20, color: "#6b7280" },
  tabBar:        { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#1f1f1f" },
  tabItem:       { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: "#22c55e" },
  tabText:       { fontSize: 13, color: "#6b7280", fontWeight: "600" },
  tabTextActive: { color: "#22c55e" },
  listContent:   { padding: 16, gap: 12, paddingBottom: 40 },

  leagueCard:       { backgroundColor: "#111", borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: "#1f1f1f" },
  leagueCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  leagueName:       { fontSize: 15, fontWeight: "700", color: "#fff", flex: 1 },
  leagueMeta:       { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText:         { fontSize: 12, color: "#6b7280" },
  metaDot:          { fontSize: 12, color: "#374151" },
  creatorBadge:     { marginTop: 8, fontSize: 11, color: "#4ade80" },

  empty:        { alignItems: "center", paddingTop: 60 },
  emptyEmoji:   { fontSize: 40, marginBottom: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 6 },
  emptySub:     { fontSize: 13, color: "#6b7280", textAlign: "center" },
  emptyText:    { textAlign: "center", color: "#6b7280", marginTop: 24, fontSize: 13 },
  connectBtn:   { backgroundColor: "#22c55e", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 16 },
  connectBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  form:       { gap: 8 },
  formLabel:  { fontSize: 12, color: "#9ca3af", fontWeight: "600", marginTop: 8 },
  formSub:    { fontSize: 11, color: "#4b5563", marginTop: 2 },
  input:      { backgroundColor: "#111", borderWidth: 0.5, borderColor: "#2a2a2a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 },
  toggleRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingVertical: 4 },
  createBtn:  { backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  createBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  btnDisabled: { opacity: 0.4 },

  // Leaderboard sheet
  overlay:      { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#0a0a0a" },
  sheet:        { flex: 1, padding: 16 },
  sheetHandle:  { width: 36, height: 4, backgroundColor: "#2a2a2a", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetHeader:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  sheetTitle:   { fontSize: 18, fontWeight: "700", color: "#fff" },
  sheetSub:     { fontSize: 12, color: "#6b7280", marginTop: 2 },
  sheetActions: { flexDirection: "row", gap: 8, marginBottom: 20 },
  actionBtn:    { flex: 1, backgroundColor: "#111", borderWidth: 0.5, borderColor: "#2a2a2a", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  actionBtnText: { fontSize: 12, fontWeight: "600", color: "#9ca3af" },
  advanceBtn:   { borderColor: "#92400e" },
  eligibleSection:  { backgroundColor: "#052e16", borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 0.5, borderColor: "#166534" },
  eligibleTitle:    { fontSize: 12, fontWeight: "700", color: "#4ade80", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  eligibleRow:      { flexDirection: "row", alignItems: "center", backgroundColor: "#0a3320", borderRadius: 8, padding: 10, marginBottom: 6 },
  eligibleQuestion: { fontSize: 13, color: "#e5e5e5", fontWeight: "500", lineHeight: 18 },
  eligibleMeta:     { fontSize: 11, color: "#6b7280", marginTop: 2 },
  eligibleCta:      { fontSize: 13, fontWeight: "700", color: "#22c55e", marginLeft: 8 },
  leaderboardTitle: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 },

  memberRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: "#141414", gap: 0 },
  memberRowMe:  { backgroundColor: "#060f06", borderRadius: 10, borderWidth: 0.5, borderColor: "#1a3a1a", marginBottom: 2, paddingHorizontal: 4 },
  memberAccent: { width: 3, height: 36, borderRadius: 2, backgroundColor: "#22c55e", marginRight: 8 },
  rank:         { fontSize: 13, fontWeight: "700", color: "#4b5563", width: 28, textAlign: "center" },
  rankMedal:    { fontSize: 17, width: 28, textAlign: "center" },
  memberAddrMe: { color: "#4ade80", fontWeight: "700" },
  memberAddr:   { fontSize: 13, fontWeight: "600", color: "#e5e5e5" },
  memberTotal:  { fontSize: 11, color: "#6b7280", marginTop: 1 },
  scoreBlock:   { alignItems: "flex-end", minWidth: 48 },
  gwScore:      { fontSize: 20, fontWeight: "800", color: "#22c55e" },
  gwScoreZero:  { color: "#374151" },
  gwScoreLocked: { fontSize: 16 },
  gwLabel:      { fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.4 },
  privateNote:  { fontSize: 10, color: "#6366f1", fontWeight: "600" },

  toast:     { position: "absolute", bottom: 40, left: 24, right: 24, backgroundColor: "#1f1f1f", borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: "#2a2a2a", alignItems: "center" },
  toastText: { fontSize: 13, color: "#e5e5e5", textAlign: "center" },

  stepLabel: { fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: 0.3 },

  // Score confirmation modal
  confirmOverlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end", paddingBottom: 32 },
  confirmCard:       { backgroundColor: "#111", marginHorizontal: 16, borderRadius: 16, padding: 20, borderWidth: 0.5, borderColor: "#2a2a2a" },
  confirmHeading:    { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  confirmQuestion:   { fontSize: 16, fontWeight: "600", color: "#f3f4f6", lineHeight: 22, marginBottom: 8 },
  confirmStake:      { fontSize: 12, color: "#6b7280", marginBottom: 20 },
  confirmActions:    { flexDirection: "row", gap: 10 },
  confirmCancelBtn:  { flex: 1, backgroundColor: "#1f1f1f", borderRadius: 10, paddingVertical: 13, alignItems: "center", borderWidth: 0.5, borderColor: "#2a2a2a" },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: "#9ca3af" },
  confirmScoreBtn:   { flex: 2, backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmScoreText:  { fontSize: 14, fontWeight: "700", color: "#fff" },
});

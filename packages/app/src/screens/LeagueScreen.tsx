import React, { useState, useCallback, useEffect } from "react";
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
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";

// Enable LayoutAnimation on Android (no-op on iOS where it's enabled by default).
// Used by the bets section collapse/expand toggle.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from "react-native-safe-area-context";
import type { League, LeagueMember } from "@terrace/sdk";
import { useLeague } from "../hooks/useLeague";
import type { EligibleBet, GameweekScoreEntry } from "../hooks/useLeague";
import { avatarColorFromPubkey } from "../hooks/useLeaderboard";
import { JerseyAvatar } from "../components/JerseyAvatar";
import * as SecureStore from "expo-secure-store";
import { ArciumBadge, ArciumPrivacyBanner } from "../components/ArciumBadge";
import { useNotify } from "../components/NotificationProvider";
import { ScoreWinCelebrationModal } from "../components/ScoreWinCelebrationModal";
import { GameweekWinnerModal } from "../components/GameweekWinnerModal";
import { RevealCelebrationModal } from "../components/RevealCelebrationModal";
import { friendlyError } from "../utils/friendlyError";
import { registerLeagues, publishLeagueEvent } from "../utils/leagueNotify";
import { useLeagueActivityFeed } from "../hooks/useLeagueActivityFeed";

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
  return <JerseyAvatar pubkey={pubkey} size={size} />;
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
  gwHistory,
  loading,
  myPubkey,
  isCreator,
  busy,
  eligibleBets,
  loadingEligible,
  notAMember,
  memberScoreState,
  loadingMemberScore,
  scoreInitReady,
  scoreInitInFlight,
  scoreInitFailed,
  onRetryInit,
  onAdvanceGameweek,
  onJoinLeague,
  onScoreWin,
  onRevealScore,
  onResetScore,
  onClose,
}: {
  league: League;
  members: LeagueMember[];
  gwHistory: Record<string, GameweekScoreEntry[]>;
  loading: boolean;
  myPubkey: string | null;
  isCreator: boolean;
  busy: boolean;
  eligibleBets: EligibleBet[];
  loadingEligible: boolean;
  notAMember: boolean;
  memberScoreState: { isReady: boolean; isRevealed: boolean; scoresGameweek: number } | null;
  loadingMemberScore: boolean;
  // Lifecycle of init_member_score for this league. ready ⇒ Score Win buttons
  // are tappable; inFlight ⇒ disabled with "Setting up…" hint; failed ⇒
  // disabled with a Retry button.
  scoreInitReady: boolean;
  scoreInitInFlight: boolean;
  scoreInitFailed: boolean;
  onRetryInit: () => void;
  onAdvanceGameweek: () => void;
  onJoinLeague: () => void;
  onScoreWin: (betAddress: string, marketAddress: string, betType: "public" | "private") => void;
  onRevealScore: () => void;
  onResetScore: () => void;
  onClose: () => void;
}) {
  const [pendingScore, setPendingScore] = useState<EligibleBet | null>(null);
  // Collapsed by default so the leaderboard fits in the initial viewport.
  // Users can tap the section header to expand and score their wins.
  const [betsExpanded, setBetsExpanded] = useState(false);
  const toggleBets = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBetsExpanded((v) => !v);
  }, []);

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

      {/* Scrollable body — everything below the fixed header/actions. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

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
          {/* Section header — tap to expand/collapse so the leaderboard
              stays visible without scrolling when there are many bets. */}
          <TouchableOpacity
            style={s.eligibleHeader}
            onPress={toggleBets}
            activeOpacity={0.7}
          >
            <Text style={s.eligibleTitle}>
              {league.isPrivate
                ? `Your bets this GW (${eligibleBets.length})`
                : `Score your wins (${eligibleBets.length})`}
            </Text>
            <Text style={s.eligibleChevron}>{betsExpanded ? "▴" : "▾"}</Text>
          </TouchableOpacity>
          {!betsExpanded && (
            <Text style={s.eligibleHint}>
              Tap to {league.isPrivate ? "see your bets" : "score your wins"}
            </Text>
          )}
          {betsExpanded && eligibleBets.map((b) => (
            b.isActive ? (
              // Market not yet settled — show as "in play" (private league Arcium-protected bet)
              <View key={String(b.betAddress)} style={[s.eligibleRow, { opacity: 0.75 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.eligibleQuestion} numberOfLines={2}>{b.marketQuestion}</Text>
                  <Text style={s.eligibleMeta}>${(Number(b.amount) / 1_000_000).toFixed(2)} stake</Text>
                </View>
                <Text style={s.eligibleCtaLocked}>🔒 Active</Text>
              </View>
            ) : (() => {
              // Market settled, won+claimed — can score the league point.
              // Private leagues require the encrypted score PDA to be ready
              // before Score Win is tappable.
              const blockedByInit = league.isPrivate && !scoreInitReady;
              const disabled = busy || blockedByInit;
              return (
                <TouchableOpacity
                  key={String(b.betAddress)}
                  style={[s.eligibleRow, disabled && s.btnDisabled]}
                  onPress={() => setPendingScore(b)}
                  disabled={disabled}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.eligibleQuestion} numberOfLines={2}>{b.marketQuestion}</Text>
                    <Text style={s.eligibleMeta}>${(Number(b.amount) / 1_000_000).toFixed(2)} stake</Text>
                  </View>
                  <Text style={s.eligibleCta}>
                    {blockedByInit ? "Setting up…" : "+1 pt →"}
                  </Text>
                </TouchableOpacity>
              );
            })()
          ))}
        </View>
      ) : null}

      {/* Private league: reveal / reset actions for the current member */}
      {league.isPrivate && !notAMember && (() => {
        if (loadingMemberScore) {
          return (
            <View style={s.privateActionsSection}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={s.privateActionsNote}>Loading encrypted score state…</Text>
            </View>
          );
        }

        const gwAdvanced = memberScoreState
          ? league.gameweek > memberScoreState.scoresGameweek
          : false;

        if (memberScoreState?.isRevealed) {
          // Surface the revealed plaintext score from the user's LeagueMember.
          // gameweekScore is the most recent reveal — stays valid until the next
          // GW's reveal overwrites it.
          const me = members.find((m) => String(m.member) === myPubkey);
          const revealedScore =
            me && me.lastScoredGameweek === memberScoreState.scoresGameweek
              ? me.gameweekScore
              : null;
          return (
            <View style={s.privateActionsRevealedSection}>
              <View style={s.privateActionsRevealedTextCol}>
                <Text style={s.privateActionsRevealedKicker}>
                  GW {memberScoreState.scoresGameweek} revealed
                </Text>
                {revealedScore !== null && (
                  <Text style={s.privateActionsRevealedScore}>
                    {revealedScore} {revealedScore === 1 ? "pt" : "pts"}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[s.privateActionBtn, s.resetBtn, busy && s.btnDisabled]}
                onPress={onResetScore}
                disabled={busy}
                activeOpacity={0.8}
              >
                {busy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.privateActionBtnText}>Reset for GW {league.gameweek} →</Text>}
              </TouchableOpacity>
            </View>
          );
        }

        if (gwAdvanced && memberScoreState?.isReady) {
          return (
            <View style={s.privateActionsSection}>
              <Text style={s.privateActionsLabel}>Gameweek {memberScoreState.scoresGameweek} ended — reveal your score</Text>
              <TouchableOpacity
                style={[s.privateActionBtn, s.revealBtn, busy && s.btnDisabled]}
                onPress={onRevealScore}
                disabled={busy}
                activeOpacity={0.8}
              >
                {busy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.privateActionBtnText}>Reveal my score →</Text>}
              </TouchableOpacity>
            </View>
          );
        }

        // PDA missing OR ciphertext still zero — both mean the init flow
        // hasn't finished. Treat them identically so users who hit silent
        // init failures (memberScoreState === null) still see the retry CTA.
        const needsSetup = !memberScoreState || !memberScoreState.isReady;
        if (needsSetup) {
          if (scoreInitFailed) {
            return (
              <View style={s.privateActionsSection}>
                <Text style={s.privateActionsLabel}>Couldn't set up your league spot</Text>
                <TouchableOpacity
                  style={[s.privateActionBtn, s.revealBtn, busy && s.btnDisabled]}
                  onPress={onRetryInit}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={s.privateActionBtnText}>Try again →</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View style={s.privateActionsSection}>
              <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 8 }} />
              <Text style={s.privateActionsNote}>
                {scoreInitInFlight
                  ? "Setting up your league spot…"
                  : "Finishing setup — almost there"}
              </Text>
            </View>
          );
        }

        return null;
      })()}

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
        // Downgraded from ScrollView to View — the outer body ScrollView now
        // handles vertical scrolling for the whole sheet. Nested vertical
        // scroll containers were preventing the leaderboard from being
        // reachable when many eligible bets pushed it off-screen.
        <View>
          {members.map((m, idx) => {
            const isMe = myPubkey === String(m.member);
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

            // On-chain LeagueMember keeps the most-recent revealed score as
            // plaintext (gameweekScore + lastScoredGameweek) until a new GW's
            // first record_league_win lazy-resets the slot. So the score for
            // their last revealed GW is publicly readable — we should show it,
            // labelled with the GW it actually belongs to, not always 0/locked.
            const hasEverRevealed = m.lastScoredGameweek > 0;
            const showsCurrentGw = m.lastScoredGameweek === league.gameweek;
            const totalHidden = league.isPrivate && !isMe && !hasEverRevealed;

            // Score block: prefer the on-chain revealed slot (current OR prior
            // GW). Only lock the column when nothing has been revealed yet for
            // a private league non-self row.
            const showLock = league.isPrivate && !isMe && !hasEverRevealed;
            const scoreVal = hasEverRevealed ? m.gameweekScore : 0;
            const scoreLabel = showLock
              ? "private"
              : showsCurrentGw
                ? "GW pts"
                : `GW${m.lastScoredGameweek} pts`;

            const memberHistory = gwHistory[String(m.member)] ?? [];
            // Hide history chips for OTHER private-league members who haven't
            // revealed for any GW yet — chips would just be empty anyway.
            const showHistory = memberHistory.length > 0 && (!league.isPrivate || isMe || hasEverRevealed);

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
                    {totalHidden ? "—  total pts" : `${m.totalScore} total pts`}
                  </Text>
                  {showHistory && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.gwHistoryRow}
                    >
                      {memberHistory.map((h) => (
                        <View key={h.gw} style={s.gwHistoryChip}>
                          <Text style={s.gwHistoryChipGw}>GW{h.gw}</Text>
                          <Text style={s.gwHistoryChipScore}>{h.score}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
                <View style={s.scoreBlock}>
                  {showLock ? (
                    <Text style={s.gwScoreLocked}>🔒</Text>
                  ) : (
                    <Text style={[s.gwScore, scoreVal === 0 && s.gwScoreZero]}>{scoreVal}</Text>
                  )}
                  <Text style={s.gwLabel}>{scoreLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      </ScrollView>
      {/* End of scrollable body */}

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
                  onScoreWin(String(b.betAddress), b.marketAddress, b.betType ?? "public");
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
  // (Per-screen toast state removed — NotificationProvider handles it globally.)
  // Score-win celebration: opens with the bet's question + how many wins are
  // still unscored this gameweek. Set by handleScoreWin on success.
  const [scoreCelebration, setScoreCelebration] = useState<{ question: string; remaining: number; isPrivateBet: boolean } | null>(null);
  // GW winner popup — fires when the previous gameweek is fully revealed by
  // all members. Shares the same SecureStore "seen" key as the HomeScreen
  // bell winner notification so dismissing from either side suppresses both.
  const [gwWinnerPopup, setGwWinnerPopup] = useState<{ gameweek: number; winnerPubkey: string; winnerScore: number; totalMembers: number } | null>(null);
  // Local activity-feed logger so the bell tray on HomeScreen picks up the
  // current user's own actions instantly (push fan-out targets OTHER members
  // — the actor needs this self-log path).
  const { recordLocal: recordLocalActivity } = useLeagueActivityFeed(walletPubkey);

  const {
    myLeagues,
    joinedLeagues,
    leaderboard,
    eligibleBets,
    notAMember,
    loading,
    loadingLeaderboard,
    loadingEligible,
    memberScoreState,
    loadingMemberScore,
    memberScoreInit,
    status,
    createStep,
    error,
    createLeague,
    joinLeague,
    recordWin,
    advanceGameweek,
    revealMemberScore,
    resetMemberScore,
    initMemberScore,
    loadLeaderboard,
    loadEligibleBets,
    loadMemberScoreState,
    pollMemberScoreRevealed,
    loadLeague,
    loadGameweekHistory,
    refresh,
  } = useLeague(walletPubkey);

  // Per-member gameweek history (off-chain snapshot) for the currently-viewed
  // league. Keyed by member pubkey → ordered [{gw, score}, …].
  const [gwHistory, setGwHistory] = useState<Record<string, GameweekScoreEntry[]>>({});
  const refreshHistory = useCallback(async (addr: string) => {
    const h = await loadGameweekHistory(addr);
    setGwHistory(h);
  }, [loadGameweekHistory]);

  const busy = status === "building" || status === "signing";
  const notify = useNotify();

  // Celebration modal state. Fires once per (league, gameweek) the first time
  // we observe memberScoreState.isRevealed === true with a positive score.
  // Persistence key prevents re-firing on later opens of the same league.
  const [celebration, setCelebration] = useState<{ gameweek: number; score: number } | null>(null);
  const celebratedKey = useCallback(
    (leagueAddr: string, gw: number) => `terrace:reveal-celebrated:${leagueAddr}:${gw}`,
    [],
  );

  // Lifecycle status of the per-(league, member) score init for the
  // currently-viewed league. Used to disable Score Win buttons and surface
  // a retry CTA when init fails.
  const scoreInitStatus = selectedLeague
    ? memberScoreInit[String(selectedLeague.address)] ?? null
    : null;
  const scoreInitReady = scoreInitStatus === "ready" || (memberScoreState?.isReady ?? false);
  const scoreInitInFlight = scoreInitStatus === "submitting" || scoreInitStatus === "pending_callback";
  const scoreInitFailed = scoreInitStatus === "failed";

  const handleRetryInit = useCallback(async () => {
    if (!selectedLeague) return;
    const id = notify.show({ kind: "loading", message: "Setting up your league spot…" });
    try {
      await initMemberScore(String(selectedLeague.address));
      notify.update(id, { kind: "success", message: "You're all set — your wins will score now." });
      loadMemberScoreState(String(selectedLeague.address));
    } catch (e: any) {
      notify.update(id, {
        kind: "error",
        message: friendlyError(e, "Couldn't set up your league spot — try once more."),
        action: { label: "Retry", onPress: handleRetryInit },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague, initMemberScore, loadMemberScoreState, notify]);

  const handleOpenLeague = useCallback((league: League) => {
    setSelectedLeague(league);
    loadLeaderboard(String(league.address));
    loadEligibleBets(String(league.address), league.isPrivate);
    refreshHistory(String(league.address));
    if (league.isPrivate && walletPubkey) {
      loadMemberScoreState(String(league.address));
    }
  }, [loadLeaderboard, loadEligibleBets, loadMemberScoreState, refreshHistory, walletPubkey]);

  // Auto-recover stuck state: if the user is a member of a private league but
  // the PrivateMemberScore PDA is missing (init_member_score never landed —
  // both create/join swallow init errors as non-fatal), fire init now. Without
  // this, the bet rows read "Setting up…" forever with no recovery path.
  useEffect(() => {
    if (!selectedLeague?.isPrivate) return;
    if (!walletPubkey) return;
    if (loadingEligible || loadingMemberScore) return;
    if (notAMember) return;
    if (memberScoreState !== null) return;
    const status = memberScoreInit[String(selectedLeague.address)];
    if (status) return;

    initMemberScore(String(selectedLeague.address))
      .then(() => loadMemberScoreState(String(selectedLeague.address)))
      .catch(() => { /* surfaces via memberScoreInit="failed" → retry CTA */ });
  }, [
    selectedLeague,
    walletPubkey,
    loadingEligible,
    loadingMemberScore,
    notAMember,
    memberScoreState,
    memberScoreInit,
    initMemberScore,
    loadMemberScoreState,
  ]);

  // Pop the celebration modal the first time a user lands on a league whose
  // PrivateMemberScore is revealed with a positive score for this GW.
  // Gated by SecureStore key per (league, gameweek) so it doesn't re-fire.
  useEffect(() => {
    if (!selectedLeague) return;
    if (!memberScoreState?.isRevealed) return;
    const gw = memberScoreState.scoresGameweek;
    const me = leaderboard.find((m) => String(m.member) === walletPubkey);
    if (!me) return;
    if (me.lastScoredGameweek !== gw) return;
    const score = me.gameweekScore;
    if (score <= 0) return;
    const key = celebratedKey(String(selectedLeague.address), gw);
    let cancelled = false;
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync(key);
        if (seen || cancelled) return;
        setCelebration({ gameweek: gw, score });
      } catch { /* SecureStore unavailable — silently skip */ }
    })();
    return () => { cancelled = true; };
  }, [selectedLeague, memberScoreState, leaderboard, walletPubkey, celebratedKey]);

  // GW winner detection — when the league is on GW N (N >= 2), inspect the
  // history snapshots to see if every current member has a revealed score
  // for GW N-1. If yes and we haven't shown the modal for this (league, gw),
  // open the GameweekWinnerModal. Uses the SAME SecureStore "seen" key as
  // useLeagueWinnerNotifications so dismissing here also clears the bell.
  useEffect(() => {
    if (!selectedLeague || !walletPubkey) return;
    const completedGw = selectedLeague.gameweek - 1;
    if (completedGw < 1) return;
    if (leaderboard.length < 2) return;

    const scores: { member: string; score: number }[] = [];
    for (const m of leaderboard) {
      const pk = String(m.member);
      const entry = gwHistory[pk]?.find((e) => e.gw === completedGw);
      if (!entry) return; // not yet complete
      scores.push({ member: pk, score: entry.score });
    }

    const winner = scores.reduce((best, cur) => (cur.score > best.score ? cur : best));
    const seenKey = `terrace:gw-winner-seen:${walletPubkey}:${String(selectedLeague.address)}:${completedGw}`;
    let cancelled = false;
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync(seenKey);
        if (seen || cancelled) return;
        setGwWinnerPopup({
          gameweek: completedGw,
          winnerPubkey: winner.member,
          winnerScore: winner.score,
          totalMembers: leaderboard.length,
        });
      } catch { /* SecureStore unavailable — skip */ }
    })();
    return () => { cancelled = true; };
  }, [selectedLeague, leaderboard, gwHistory, walletPubkey]);

  const handleDismissGwWinner = useCallback(async () => {
    if (!gwWinnerPopup || !selectedLeague || !walletPubkey) {
      setGwWinnerPopup(null);
      return;
    }
    const seenKey = `terrace:gw-winner-seen:${walletPubkey}:${String(selectedLeague.address)}:${gwWinnerPopup.gameweek}`;
    try { await SecureStore.setItemAsync(seenKey, "1"); } catch { /* best-effort */ }
    setGwWinnerPopup(null);
  }, [gwWinnerPopup, selectedLeague, walletPubkey]);

  const handleDismissCelebration = useCallback(async () => {
    if (!celebration || !selectedLeague) return setCelebration(null);
    try {
      await SecureStore.setItemAsync(
        celebratedKey(String(selectedLeague.address), celebration.gameweek),
        "1",
      );
    } catch { /* best-effort */ }
    setCelebration(null);
  }, [celebration, selectedLeague, celebratedKey]);

  const handleScoreWin = useCallback(async (
    betAddress: string,
    marketAddress: string,
    betType: "public" | "private",
  ) => {
    if (!selectedLeague) return;
    // Capture the bet's question + count of OTHER scoreable bets BEFORE the
    // tx + refresh — so the celebration can show "X more wins to score" with
    // the right number, regardless of how fast loadEligibleBets repopulates.
    const scoredBet = eligibleBets.find((b) => String(b.betAddress) === betAddress);
    const questionAtScore = scoredBet?.marketQuestion ?? "Your winning bet";
    const remainingAfter = eligibleBets.filter(
      (b) => String(b.betAddress) !== betAddress && !b.isActive,
    ).length;
    // For private bets the on-chain side can't reject losers (the outcome is
    // encrypted) — the MPC circuit does the comparison invisibly. The
    // celebration copy is honest about this.
    const isPrivateBet = betType === "private";

    const loadingMsg = isPrivateBet ? "Sealing your pick…" : "Logging your win…";
    const successMsg = isPrivateBet
      ? "Pick locked in — score updates if you called it right."
      : "+1 league point — your win is in!";

    const id = notify.show({ kind: "loading", message: loadingMsg });
    try {
      await recordWin({
        leagueAddress: String(selectedLeague.address),
        marketAddress,
        isPrivate: selectedLeague.isPrivate,
        betType,
      });
      notify.update(id, { kind: "success", message: successMsg });
      loadLeaderboard(String(selectedLeague.address));
      loadEligibleBets(String(selectedLeague.address), selectedLeague.isPrivate);
      // Fire the fan-friendly celebration on top of the toast.
      setScoreCelebration({ question: questionAtScore, remaining: remainingAfter, isPrivateBet });
      if (walletPubkey) {
        publishLeagueEvent(
          String(selectedLeague.address),
          walletPubkey,
          "win",
          { leagueName: selectedLeague.name, gameweek: selectedLeague.gameweek },
        );
        recordLocalActivity({
          leagueAddress: String(selectedLeague.address),
          leagueName: selectedLeague.name,
          kind: "win",
          gameweek: selectedLeague.gameweek,
        });
      }
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't log this win — please try again.") });
    }
  }, [selectedLeague, eligibleBets, recordWin, loadLeaderboard, loadEligibleBets, walletPubkey, notify, recordLocalActivity]);

  const handleCreate = useCallback(async (params: {
    name: string;
    isPrivate: boolean;
    entryFeeUsdc: bigint;
    maxMembers: number;
  }) => {
    if (!walletPubkey) { onConnectWallet?.(); return; }
    const id = notify.show({ kind: "loading", message: "Creating your league…" });
    try {
      const { leagueAddress } = await createLeague(params);
      notify.update(id, {
        kind: "success",
        message: "League is live! Tap to copy the invite link.",
        action: { label: "Copy", onPress: () => { /* copy handled by share button on screen */ } },
      });
      setTab("My Leagues");
      // Treat creation as a join so the index includes the creator from t0.
      publishLeagueEvent(leagueAddress, walletPubkey, "join", { leagueName: params.name });
      recordLocalActivity({ leagueAddress, leagueName: params.name, kind: "join" });
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't create the league — please try again.") });
    }
  }, [walletPubkey, createLeague, onConnectWallet, notify]);

  const handleJoin = useCallback(async (address: string) => {
    if (!walletPubkey) { onConnectWallet?.(); return; }
    const id = notify.show({ kind: "loading", message: "Joining the league…" });
    try {
      await joinLeague(address);
      notify.update(id, { kind: "success", message: "You're in! Welcome to the league." });
      setTab("My Leagues");
      publishLeagueEvent(address, walletPubkey, "join");
      recordLocalActivity({ leagueAddress: address, kind: "join" });
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't join — please try again.") });
    }
  }, [walletPubkey, joinLeague, onConnectWallet, notify]);

  const handleAdvanceGameweek = useCallback(async () => {
    if (!selectedLeague) return;
    const id = notify.show({ kind: "loading", message: "Starting the next gameweek…" });
    try {
      await advanceGameweek(String(selectedLeague.address));
      notify.update(id, { kind: "success", message: "Next gameweek is on — good luck!" });
      const addr = String(selectedLeague.address);
      // Refresh the in-memory league so league.gameweek bumps — otherwise the
      // reveal CTA stays hidden until the user closes and re-opens the sheet.
      const updated = await loadLeague(addr);
      if (updated) setSelectedLeague(updated);
      loadLeaderboard(addr);
      refreshHistory(addr);
      if (selectedLeague.isPrivate && walletPubkey) {
        loadMemberScoreState(addr);
      }
      if (walletPubkey) {
        publishLeagueEvent(addr, walletPubkey, "advance", {
          leagueName: selectedLeague.name,
          gameweek: (updated ?? selectedLeague).gameweek,
        });
        recordLocalActivity({
          leagueAddress: addr,
          leagueName: selectedLeague.name,
          kind: "advance",
          gameweek: (updated ?? selectedLeague).gameweek,
        });
      }
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't advance the gameweek.") });
    }
  }, [selectedLeague, advanceGameweek, loadLeague, loadLeaderboard, loadMemberScoreState, refreshHistory, walletPubkey, notify]);

  const handleJoinFromSheet = useCallback(async () => {
    if (!selectedLeague || !walletPubkey) return;
    const id = notify.show({ kind: "loading", message: "Joining the league…" });
    try {
      await joinLeague(String(selectedLeague.address));
      notify.update(id, { kind: "success", message: "You're in! Your wins will score from here." });
      loadEligibleBets(String(selectedLeague.address), selectedLeague.isPrivate);
      loadLeaderboard(String(selectedLeague.address));
      publishLeagueEvent(
        String(selectedLeague.address),
        walletPubkey,
        "join",
        { leagueName: selectedLeague.name },
      );
      recordLocalActivity({
        leagueAddress: String(selectedLeague.address),
        leagueName: selectedLeague.name,
        kind: "join",
      });
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't join — please try again.") });
    }
  }, [selectedLeague, walletPubkey, joinLeague, loadEligibleBets, loadLeaderboard, notify]);

  const handleRevealScore = useCallback(async () => {
    if (!selectedLeague) return;
    const addr = String(selectedLeague.address);
    // The Arcium reveal target is the gameweek the member is currently sitting
    // on (memberScoreState.scoresGameweek), not the league's current gameweek.
    const targetGw = memberScoreState?.scoresGameweek;
    const id = notify.show({ kind: "loading", message: "Calculating your league points…" });
    try {
      await revealMemberScore(addr);
      // Don't claim success until the Arcium callback actually flips is_revealed
      // on-chain. Poll up to 90s; if it doesn't land, surface a retry CTA so
      // the user isn't left staring at a stale spinner.
      const landed = await pollMemberScoreRevealed(addr, { timeoutMs: 90_000, targetGameweek: targetGw });
      if (landed) {
        notify.update(id, { kind: "success", message: "Your league points are in!" });
        loadMemberScoreState(addr);
        loadLeaderboard(addr);
        refreshHistory(addr);
        if (walletPubkey) {
          publishLeagueEvent(addr, walletPubkey, "reveal", {
            leagueName: selectedLeague.name,
            gameweek: targetGw,
          });
          recordLocalActivity({
            leagueAddress: addr,
            leagueName: selectedLeague.name,
            kind: "reveal",
            gameweek: targetGw,
          });
        }
      } else {
        notify.update(id, {
          kind: "error",
          message: "MPC reveal is taking longer than expected. Try again?",
          action: { label: "Retry reveal", onPress: handleRevealScore },
        });
        // Best-effort refresh anyway in case the callback lands moments later.
        loadMemberScoreState(addr);
        loadLeaderboard(addr);
      }
    } catch (e: any) {
      notify.update(id, {
        kind: "error",
        message: friendlyError(e, "Couldn't reveal your score — please try again."),
        action: { label: "Retry", onPress: handleRevealScore },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague, memberScoreState, revealMemberScore, pollMemberScoreRevealed, loadMemberScoreState, loadLeaderboard, refreshHistory, walletPubkey, notify]);

  const handleResetScore = useCallback(async () => {
    if (!selectedLeague) return;
    const id = notify.show({ kind: "loading", message: "Resetting for the new gameweek…" });
    try {
      await resetMemberScore(String(selectedLeague.address));
      notify.update(id, { kind: "success", message: `New gameweek — your points reset to 0.` });
      setTimeout(() => loadMemberScoreState(String(selectedLeague.address)), 6000);
    } catch (e: any) {
      notify.update(id, { kind: "error", message: friendlyError(e, "Couldn't reset — please try again.") });
    }
  }, [selectedLeague, resetMemberScore, loadMemberScoreState, notify]);

  // Deduplicate: myLeagues + joinedLeagues
  const allLeagues = [
    ...myLeagues,
    ...joinedLeagues.filter((jl) => !myLeagues.some((ml) => String(ml.address) === String(jl.address))),
  ];

  // Keep the notifications-worker's `league_members` KV index in sync with
  // what we observe on-chain, so league-event fan-outs reach the right wallets.
  // Fires whenever the user's known league set or wallet changes.
  useEffect(() => {
    if (!walletPubkey) return;
    registerLeagues(walletPubkey, allLeagues.map((l) => String(l.address)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletPubkey, allLeagues.map((l) => String(l.address)).join(",")]);

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
            gwHistory={gwHistory}
            loading={loadingLeaderboard}
            myPubkey={walletPubkey}
            isCreator={walletPubkey === String(selectedLeague.creator)}
            busy={busy}
            eligibleBets={eligibleBets}
            loadingEligible={loadingEligible}
            notAMember={notAMember}
            memberScoreState={memberScoreState}
            loadingMemberScore={loadingMemberScore}
            scoreInitReady={scoreInitReady}
            scoreInitInFlight={scoreInitInFlight}
            scoreInitFailed={scoreInitFailed}
            onRetryInit={handleRetryInit}
            onAdvanceGameweek={handleAdvanceGameweek}
            onJoinLeague={handleJoinFromSheet}
            onScoreWin={handleScoreWin}
            onRevealScore={handleRevealScore}
            onResetScore={handleResetScore}
            onClose={() => setSelectedLeague(null)}
          />
        </View>
      )}

      <RevealCelebrationModal
        visible={celebration !== null}
        gameweek={celebration?.gameweek ?? 0}
        score={celebration?.score ?? 0}
        onDismiss={handleDismissCelebration}
      />

      {/* Score-win celebration — fires after a successful record_win.
          "Find more markets" closes the league sheet AND this screen so the
          user lands back on home where they can place new bets. */}
      <ScoreWinCelebrationModal
        visible={scoreCelebration !== null}
        marketQuestion={scoreCelebration?.question ?? ""}
        remainingCount={scoreCelebration?.remaining ?? 0}
        isPrivateBet={scoreCelebration?.isPrivateBet ?? false}
        onDismiss={() => setScoreCelebration(null)}
        onFindMoreMarkets={() => {
          setScoreCelebration(null);
          setSelectedLeague(null);
          onClose();
        }}
      />

      {/* GW winner crown — fires when previous gameweek is fully revealed */}
      <GameweekWinnerModal
        visible={gwWinnerPopup !== null}
        winnerPubkey={gwWinnerPopup?.winnerPubkey ?? ""}
        winnerLabel={gwWinnerPopup ? shortAddr(gwWinnerPopup.winnerPubkey) : ""}
        gameweek={gwWinnerPopup?.gameweek ?? 0}
        winnerScore={gwWinnerPopup?.winnerScore ?? 0}
        totalMembers={gwWinnerPopup?.totalMembers ?? 0}
        isMe={gwWinnerPopup?.winnerPubkey === walletPubkey}
        onDismiss={handleDismissGwWinner}
      />

      {/* Notifications render globally via <NotificationProvider /> in App.tsx */}
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
  eligibleTitle:    { fontSize: 12, fontWeight: "700", color: "#4ade80", textTransform: "uppercase", letterSpacing: 0.6 },
  eligibleHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  eligibleChevron:  { fontSize: 14, color: "#4ade80", fontWeight: "700", paddingHorizontal: 4 },
  eligibleHint:     { fontSize: 11, color: "#86efac", fontStyle: "italic" },
  eligibleRow:      { flexDirection: "row", alignItems: "center", backgroundColor: "#0a3320", borderRadius: 8, padding: 10, marginBottom: 6 },
  eligibleQuestion: { fontSize: 13, color: "#e5e5e5", fontWeight: "500", lineHeight: 18 },
  eligibleMeta:     { fontSize: 11, color: "#6b7280", marginTop: 2 },
  eligibleCta:      { fontSize: 13, fontWeight: "700", color: "#22c55e", marginLeft: 8 },
  eligibleCtaLocked: { fontSize: 11, fontWeight: "600", color: "#6366f1", marginLeft: 8 },
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
  gwHistoryRow:        { flexDirection: "row", gap: 6, marginTop: 6, paddingRight: 6 },
  gwHistoryChip:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#111827", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: "#1f2937" },
  gwHistoryChipGw:     { fontSize: 9, color: "#6b7280", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  gwHistoryChipScore:  { fontSize: 11, color: "#22c55e", fontWeight: "700" },
  privateNote:  { fontSize: 10, color: "#6366f1", fontWeight: "600" },

  privateActionsSection: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f0b1f", borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 0.5, borderColor: "#312e81", gap: 10 },
  privateActionsLabel:   { fontSize: 12, color: "#a5b4fc", fontWeight: "600", flex: 1 },
  // Variant of privateActionsSection used after reveal — taller padding to fit
  // the large green score. Column-friendly inner layout (kicker + big score).
  privateActionsRevealedSection: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f0b1f", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 0.5, borderColor: "#312e81", gap: 10 },
  privateActionsRevealedTextCol: { flex: 1, flexDirection: "column" },
  privateActionsRevealedKicker:  { fontSize: 11, color: "#a5b4fc", fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" },
  privateActionsRevealedScore:   { fontSize: 30, color: "#22c55e", fontWeight: "800", marginTop: 2, lineHeight: 36 },
  privateActionsNote:    { fontSize: 12, color: "#6b7280", flex: 1 },
  privateActionBtn:      { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  revealBtn:             { backgroundColor: "#4f46e5" },
  resetBtn:              { backgroundColor: "#1e3a5f" },
  privateActionBtnText:  { fontSize: 13, fontWeight: "700", color: "#fff" },

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

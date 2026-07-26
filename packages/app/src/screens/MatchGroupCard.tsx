import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Pressable, Image, ActivityIndicator } from "react-native";
import type { GroupedMatch } from "../utils/groupMarkets";
import type { UnifiedMarket, LiveFixture } from "@terrace/sdk";
import { isFixtureLive, isFixtureFinished } from "@terrace/sdk";
import { lookupTeam, fallbackColor } from "../utils/teamDatabase";
import { useTeamCrest } from "../hooks/useTeamCrest";
import { useLiveFixture } from "../hooks/useLiveFixture";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Brighton & Hove Albion" → "BHA", falls back to first 3 chars */
function abbr(name: string | undefined, teamEntry?: ReturnType<typeof lookupTeam>): string {
  if (!name) return "???";
  if (teamEntry) return teamEntry.tla;
  const firstWord = name.replace(/\s*&.*/, "").trim().split(/\s+/)[0];
  return firstWord.slice(0, 3).toUpperCase();
}

/** Extract home / away team names from "TeamA vs TeamB" */
function splitEventTitle(title: string): [string, string] {
  const parts = title.split(/\s+vs\.?\s+/i);
  return parts.length >= 2 ? [parts[0].trim(), parts[1].trim()] : [title, ""];
}

function formatExpiry(d: Date | null): string {
  if (!d) return "";
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000)     return `$${(usdc / 1_000).toFixed(1)}K`;
  return `$${usdc.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Team badge — crest image with colored fallback
// ---------------------------------------------------------------------------

interface TeamBadgeProps {
  name: string;
  size?: number;
}

export function TeamBadge({ name, size = 28 }: TeamBadgeProps) {
  const team = lookupTeam(name);
  // Only consult TheSportsDB when we have no static crest — otherwise the loose
  // search occasionally returned Arsenal (or a stale cached result) and beat
  // our curated DB. Pass empty string to short-circuit the fetch.
  const dynamicCrest = useTeamCrest(team?.crest ? "" : name);
  const bg = team?.color ?? fallbackColor(name);
  const radius = size * 0.28;
  // Track every URI that failed so we cascade: static → dynamic → letter
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(new Set());

  // Static (DB-curated) crest wins over the dynamic TheSportsDB lookup. The
  // dynamic path is only a fallback for teams not yet in the DB.
  const candidates = [team?.crest, dynamicCrest].filter((c): c is string => !!c);
  const activeCrest = candidates.find((c) => !failedUris.has(c));

  const markFailed = (uri: string) =>
    setFailedUris((prev) => new Set([...prev, uri]));

  if (activeCrest) {
    return (
      <View style={[styles.teamBadgeWrap, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
        <Image
          source={{ uri: activeCrest }}
          style={{ width: size * 0.8, height: size * 0.8 }}
          resizeMode="contain"
          onError={() => markFailed(activeCrest)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.teamBadgeWrap, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
      <Text style={[styles.teamInitial, { fontSize: size * 0.46 }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Outcome button
// ---------------------------------------------------------------------------

interface OutcomeBtnProps {
  label: string;
  sublabel?: string;
  price: number | null;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function OutcomeBtn({ label, sublabel, price, selected, disabled, onPress }: OutcomeBtnProps) {
  return (
    <Pressable
      style={[styles.outcomeBtn, selected && styles.outcomeBtnSelected, disabled && styles.outcomeBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.outcomeBtnLabel, selected && styles.outcomeLabelSelected]}>
        {label}
      </Text>
      {sublabel && (
        <Text style={styles.outcomeBtnSublabel}>{sublabel}</Text>
      )}
      <Text style={[styles.outcomeBtnPrice, selected && styles.outcomePriceSelected]}>
        {price !== null ? `${Math.round(price * 100)}¢` : "—"}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// AI insights
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";

interface InsightData {
  form: string;
  h2h: string;
  angle: string;
}

async function fetchMatchInsights(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number | null,
  drawOdds: number | null,
  awayOdds: number | null,
  liveContext: string | null,
): Promise<InsightData> {
  if (!GEMINI_KEY) throw new Error("EXPO_PUBLIC_GEMINI_API_KEY not set — restart Metro after adding to .env");

  const prompt = `You are a football analyst. Return ONLY a JSON object — no markdown, no code fences, no extra text.

Match: ${homeTeam} vs ${awayTeam}
Odds: ${homeTeam} ${homeOdds !== null ? Math.round(homeOdds * 100) + "c" : "—"} | Draw ${drawOdds !== null ? Math.round(drawOdds * 100) + "c" : "—"} | ${awayTeam} ${awayOdds !== null ? Math.round(awayOdds * 100) + "c" : "—"}
${liveContext ? `Live state: ${liveContext}` : ""}

Respond with exactly this JSON shape (all values plain text strings, no bullet chars, no newlines inside values):
{"form":"[Home abbr] last 5: W D W L W | [Away abbr] last 5: L W D W W","h2h":"[1 sentence: head-to-head record and one key stat]","angle":"[1 sentence: which side the odds favour AND, if a live state is given, how the scoreline / minute changes the case]"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    const blockReason = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason;
    throw new Error(blockReason ? `Gemini blocked: ${blockReason}` : "Empty Gemini response");
  }

  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as InsightData;
  } catch {
    throw new Error(`Could not parse Gemini response: ${raw.slice(0, 120)}`);
  }
}

// ---------------------------------------------------------------------------
// InsightsPanel — structured 3-row display
// ---------------------------------------------------------------------------

const INSIGHT_ROWS: { key: keyof InsightData; icon: string; label: string }[] = [
  { key: "form",  icon: "📊", label: "Recent Form" },
  { key: "h2h",   icon: "⚔️",  label: "Head to Head" },
  { key: "angle", icon: "💰", label: "Betting Angle" },
];

function InsightsPanel({ data }: { data: InsightData }) {
  return (
    <View style={styles.insightRows}>
      {INSIGHT_ROWS.map(({ key, icon, label }) => (
        <View key={key} style={styles.insightRow}>
          <View style={styles.insightRowHeader}>
            <Text style={styles.insightIcon}>{icon}</Text>
            <Text style={styles.insightLabel}>{label.toUpperCase()}</Text>
          </View>
          <Text style={styles.insightValue}>{data[key]}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Live score badge — Sportradar / API-Football scoreline + status
// ---------------------------------------------------------------------------

function formatStatusShort(short: string, elapsed: number | null): string {
  if (short === "NS") return "Kick-off soon";
  if (short === "HT") return "Half-time";
  if (short === "FT") return "Full-time";
  if (short === "AET") return "After ET";
  if (short === "PEN") return "Penalties";
  if (elapsed != null && (short === "1H" || short === "2H" || short === "ET")) {
    return `${elapsed}'`;
  }
  return short;
}

function LiveScoreBadge({ fixture }: { fixture: LiveFixture }) {
  const live = isFixtureLive(fixture);
  const finished = isFixtureFinished(fixture);
  const score = fixture.homeScore != null && fixture.awayScore != null
    ? `${fixture.homeScore}–${fixture.awayScore}`
    : "–";

  return (
    <View style={[styles.liveBadge, live && styles.liveBadgeLive, finished && styles.liveBadgeFinished]}>
      {live && <View style={styles.livePulse} />}
      <Text style={[styles.liveBadgeStatus, live && styles.liveBadgeStatusLive]}>
        {live ? "LIVE" : formatStatusShort(fixture.statusShort, fixture.elapsed).toUpperCase()}
      </Text>
      <Text style={styles.liveBadgeScore}>{score}</Text>
      {live && (
        <Text style={styles.liveBadgeMinute}>
          {formatStatusShort(fixture.statusShort, fixture.elapsed)}
        </Text>
      )}
      <Text style={styles.liveBadgeLeague} numberOfLines={1}>{fixture.league.name}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Event image thumbnail
// ---------------------------------------------------------------------------

function EventImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      style={styles.eventThumb}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// MatchGroupCard
// ---------------------------------------------------------------------------

interface Props {
  match: GroupedMatch;
  onSelectOutcome: (marketId: string, outcomeLabel: string, yesPrice: number | null) => void;
}

export function MatchGroupCard({ match, onSelectOutcome }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insights, setInsights] = useState<InsightData | string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const { eventTitle, outcomes, totalVolumeUsdc, expiry, status } = match;
  const [homeTeamRaw, awayTeamRaw] = splitEventTitle(eventTitle);
  // For futures markets the event title has no "vs" — use outcome questions for badge resolution
  const isFutures = !awayTeamRaw;
  const homeTeam = isFutures ? (outcomes.home?.question ?? homeTeamRaw) : homeTeamRaw;
  const awayTeam = isFutures ? (outcomes.away?.question ?? awayTeamRaw) : awayTeamRaw;

  const homeEntry = lookupTeam(homeTeam);
  const awayEntry = lookupTeam(awayTeam);

  const homeAbbr = abbr(outcomes.home?.question ?? homeTeam, homeEntry);
  const awayAbbr = abbr(outcomes.away?.question ?? awayTeam, awayEntry);

  const isSettled = status === "Settled" || status === "Closed";

  // Live fixture lookup — only meaningful for head-to-head matches with two
  // identified teams. Futures/league markets don't have a single fixture.
  const liveFixture = useLiveFixture(
    !isFutures && !isSettled ? homeTeam : "",
    !isFutures && !isSettled ? awayTeam : "",
    expiry,
  );

  const handleSelect = (market: UnifiedMarket | null, label: string) => {
    if (!market || status !== "Open") return;
    setSelected(market.id);
    onSelectOutcome(market.id, label, market.yesPrice);
  };

  return (
    <View style={[styles.card, isSettled && styles.cardSettled]}>
      {/* ── Match header ──────────────────────────────── */}
      <View style={styles.matchHeader}>
        {/* Team badges — use event title split (correct for head-to-head; letter fallback for futures) */}
        <View style={styles.teamsRow}>
          <TeamBadge name={homeTeam} size={28} />
          <Text style={styles.vsText}>vs</Text>
          <TeamBadge name={awayTeam || " "} size={28} />
        </View>

        {/* Meta */}
        <View style={styles.matchMeta}>
          <Text style={styles.matchTitle} numberOfLines={1}>{eventTitle}</Text>
          <View style={styles.matchMetaRow}>
            <Text style={styles.matchSub}>Sports · Match result</Text>
            {expiry && <Text style={styles.matchExpiry}> · {formatExpiry(expiry)}</Text>}
          </View>
        </View>

        {/* Event image thumbnail (Polymarket) */}
        {match.imageUrl && (
          <EventImage uri={match.imageUrl} />
        )}

        {/* Volume */}
        <View style={styles.volTag}>
          <Text style={styles.volTagText}>🏆 {formatVol(totalVolumeUsdc)}</Text>
        </View>
      </View>

      {/* ── Live scoreline + status (head-to-head only) ── */}
      {liveFixture && <LiveScoreBadge fixture={liveFixture} />}

      {/* ── YES / DRAW / NO outcome buttons ───────────── */}
      <View style={styles.oddsRow}>
        <OutcomeBtn
          label={homeAbbr}
          sublabel={homeTeam.length > 6 ? homeTeam.slice(0, 8) + "…" : homeTeam}
          price={outcomes.home?.yesPrice ?? null}
          selected={selected === outcomes.home?.id}
          disabled={!outcomes.home || isSettled}
          onPress={() => handleSelect(outcomes.home, homeAbbr)}
        />
        <OutcomeBtn
          label="DRW"
          sublabel="Draw"
          price={outcomes.draw?.yesPrice ?? null}
          selected={selected === outcomes.draw?.id}
          disabled={!outcomes.draw || isSettled}
          onPress={() => handleSelect(outcomes.draw, "DRW")}
        />
        <OutcomeBtn
          label={awayAbbr}
          sublabel={awayTeam.length > 6 ? awayTeam.slice(0, 8) + "…" : awayTeam}
          price={outcomes.away?.yesPrice ?? null}
          selected={selected === outcomes.away?.id}
          disabled={!outcomes.away || isSettled}
          onPress={() => handleSelect(outcomes.away, awayAbbr)}
        />
      </View>

      {/* AI Insights toggle */}
      {!isSettled && (
        <TouchableOpacity
          style={styles.insightsToggle}
          onPress={async () => {
            if (insightsOpen) { setInsightsOpen(false); return; }
            setInsightsOpen(true);
            if (insights) return;
            setInsightsLoading(true);
            try {
              const liveContext = liveFixture
                ? `${homeTeam} ${liveFixture.homeScore ?? 0}-${liveFixture.awayScore ?? 0} ${awayTeam}, ${formatStatusShort(liveFixture.statusShort, liveFixture.elapsed)}, ${liveFixture.league.name}`
                : null;
              const text = await fetchMatchInsights(
                homeTeam, awayTeam,
                outcomes.home?.yesPrice ?? null,
                outcomes.draw?.yesPrice ?? null,
                outcomes.away?.yesPrice ?? null,
                liveContext,
              );
              setInsights(text);
            } catch (err) {
              setInsights(`Error: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setInsightsLoading(false);
            }
          }}
        >
          <Text style={styles.insightsToggleText}>
            {insightsOpen ? "▴ Hide insights" : "▾ AI match insights"}
          </Text>
        </TouchableOpacity>
      )}

      {insightsOpen && (
        <View style={styles.insightsPanel}>
          {insightsLoading ? (
            <ActivityIndicator size="small" color="#22c55e" />
          ) : typeof insights === "object" && insights !== null ? (
            <InsightsPanel data={insights} />
          ) : (
            <Text style={styles.insightsText}>{insights}</Text>
          )}
        </View>
      )}

      {/* Settled result */}
      {isSettled && (
        <Text style={styles.settledLabel}>
          {status === "Settled" ? "Market settled" : "Market closed"}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111",
    borderRadius: 16,
    marginHorizontal: 18,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#1e1e1e",
  },
  cardSettled: { opacity: 0.6 },

  // Match header
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  teamsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  teamBadgeWrap: { alignItems: "center", justifyContent: "center" },
  teamInitial: { fontWeight: "700", color: "#fff" },
  vsText: { fontSize: 9, color: "#555", fontWeight: "600", marginHorizontal: 2 },

  matchMeta: { flex: 1, minWidth: 0 },
  matchTitle: { fontSize: 13, fontWeight: "600", color: "#fff" },
  matchMetaRow: { flexDirection: "row" },
  matchSub:    { fontSize: 10, color: "#888" },
  matchExpiry: { fontSize: 10, color: "#555" },

  eventThumb: { width: 36, height: 36, borderRadius: 6, marginLeft: 6 },

  volTag: { backgroundColor: "#1a2e1a", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  volTagText: { fontSize: 9, fontWeight: "500", color: "#4ade80" },

  // Live score badge
  liveBadge: {
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#0d0d0d",
    borderWidth: 0.5,
    borderColor: "#1f1f1f",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveBadgeLive: { borderColor: "#dc2626", backgroundColor: "#1a0a0a" },
  liveBadgeFinished: { opacity: 0.6 },
  livePulse: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: "#ef4444",
    shadowColor: "#ef4444", shadowOpacity: 1, shadowRadius: 4,
  },
  liveBadgeStatus: {
    fontSize: 10, fontWeight: "800", letterSpacing: 0.8,
    color: "#9ca3af",
  },
  liveBadgeStatusLive: { color: "#ef4444" },
  liveBadgeScore: {
    fontSize: 14, fontWeight: "800", color: "#f9fafb",
    fontVariant: ["tabular-nums"],
  },
  liveBadgeMinute: {
    fontSize: 10, fontWeight: "700", color: "#fca5a5",
    fontVariant: ["tabular-nums"],
  },
  liveBadgeLeague: {
    fontSize: 10, color: "#6b7280", marginLeft: "auto", maxWidth: 120,
  },

  // Outcome buttons
  oddsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  outcomeBtn: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "#2a2a2a",
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
  },
  outcomeBtnSelected: {
    backgroundColor: "#052e16",
    borderColor: "#22c55e",
  },
  outcomeBtnDisabled: { opacity: 0.4 },
  outcomeBtnLabel:    { fontSize: 11, fontWeight: "700", color: "#d1d5db", letterSpacing: 0.5 },
  outcomeLabelSelected: { color: "#22c55e" },
  outcomeBtnSublabel: { fontSize: 8, color: "#6b7280" },
  outcomeBtnPrice:    { fontSize: 14, fontWeight: "800", color: "#f9fafb" },
  outcomePriceSelected: { color: "#22c55e" },

  settledLabel: { textAlign: "center", fontSize: 11, color: "#6b7280", paddingBottom: 10 },

  insightsToggle: { borderTopWidth: 0.5, borderTopColor: "#1a1a1a", paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  insightsToggleText: { fontSize: 11, color: "#4ade80", fontWeight: "600" },
  insightsPanel: { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 6 },
  insightsText: { fontSize: 12, color: "#d1d5db", lineHeight: 18 },

  // Structured insight rows
  insightRows: { gap: 6 },
  insightRow: {
    backgroundColor: "#0d0d0d",
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#22c55e",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  insightRowHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  insightIcon: { fontSize: 11 },
  insightLabel: { fontSize: 9, fontWeight: "700", color: "#4ade80", letterSpacing: 0.8 },
  insightValue: { fontSize: 12, color: "#e5e7eb", lineHeight: 17 },
});

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Pressable, Image } from "react-native";
import type { GroupedMatch } from "../utils/groupMarkets";
import type { UnifiedMarket } from "@terrace/sdk";
import { lookupTeam, fallbackColor } from "../utils/teamDatabase";

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

function TeamBadge({ name, size = 28 }: TeamBadgeProps) {
  const [imgError, setImgError] = useState(false);
  const team = lookupTeam(name);
  const bg = team?.color ?? fallbackColor(name);
  const radius = size * 0.28;

  if (team?.crest && !imgError) {
    return (
      <View style={[styles.teamBadgeWrap, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
        <Image
          source={{ uri: team.crest }}
          style={{ width: size * 0.8, height: size * 0.8 }}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  // Fallback: colored circle with initial
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
// MatchGroupCard
// ---------------------------------------------------------------------------

interface Props {
  match: GroupedMatch;
  onSelectOutcome: (marketId: string, outcomeLabel: string, yesPrice: number | null) => void;
}

export function MatchGroupCard({ match, onSelectOutcome }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { eventTitle, outcomes, totalVolumeUsdc, expiry, status } = match;
  const [homeTeam, awayTeam] = splitEventTitle(eventTitle);

  const homeEntry = lookupTeam(homeTeam);
  const awayEntry = lookupTeam(awayTeam);

  const homeAbbr = abbr(outcomes.home?.question ?? homeTeam, homeEntry);
  const awayAbbr = abbr(outcomes.away?.question ?? awayTeam, awayEntry);

  const isSettled = status === "Settled" || status === "Closed";

  const handleSelect = (market: UnifiedMarket | null, label: string) => {
    if (!market || status !== "Open") return;
    setSelected(market.id);
    onSelectOutcome(market.id, label, market.yesPrice);
  };

  return (
    <View style={[styles.card, isSettled && styles.cardSettled]}>
      {/* ── Match header ──────────────────────────────── */}
      <View style={styles.matchHeader}>
        {/* Team badges */}
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

        {/* Volume */}
        <View style={styles.volTag}>
          <Text style={styles.volTagText}>🏆 {formatVol(totalVolumeUsdc)}</Text>
        </View>
      </View>

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
    overflow: "hidden",
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

  volTag: { backgroundColor: "#1a2e1a", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  volTagText: { fontSize: 9, fontWeight: "500", color: "#4ade80" },

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
});

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { UnifiedMarket } from "@terrace/sdk";
import { TeamBadge } from "../screens/MatchGroupCard";
import { color as C, font, radius } from "../theme/tokens";
import { probToFractional, moneyWhole } from "../utils/format";
import { splitEventTitle, marketTitle, competitionLabel } from "../utils/football";
import { identityOf, avatarColorOf } from "../utils/identity";
import { Badge, OddsButton } from "./ui";
import { Icon } from "./Icon";
import { MarketStateBadge, MarketOutcomeLine } from "./MarketStateBadge";
import { useMarketState } from "../hooks/useMarketState";

// ---------------------------------------------------------------------------
// The market card — one component, used by the Markets list, Home's trending
// rows and the Flash board. Previously Markets and Home had separate cards that
// disagreed about odds format, creator display and what "settled" looked like.
//
// `compact` tightens it for Home's denser trending list; everything else about
// the card is identical so a market reads the same wherever a user meets it.
//
// What the card is *doing* — counting down, waiting on settlement, dead, or
// resolved — comes from utils/marketState, not from `status` read locally.
// ---------------------------------------------------------------------------

/** The creator line — a handle and monogram, never an address. */
function CreatorLine({ pubkey, winRateBps }: { pubkey: string; winRateBps?: number }) {
  const id = identityOf(pubkey);
  return (
    <View style={s.creator}>
      <View style={[s.monogram, { backgroundColor: avatarColorOf(pubkey) }]}>
        <Text style={s.monogramTxt}>{id.monogram}</Text>
      </View>
      <Text style={s.creatorName} numberOfLines={1}>
        {id.handle}
      </Text>
      {!!id.tag && <Text style={s.creatorTag}>{id.tag}</Text>}
      {winRateBps != null && (
        <Text style={s.creatorWin}>{Math.round(winRateBps / 100)}% W</Text>
      )}
    </View>
  );
}

interface Props {
  market: UnifiedMarket;
  onPress: () => void;
  /** Tap a specific side — opens the slip pre-committed. Falls back to onPress. */
  onBack?: () => void;
  onFade?: () => void;
  compact?: boolean;
  /** Creator win rate in bps, when loaded. Native markets only. */
  creatorWinRate?: number;
}

export function MarketCard({ market, onPress, onBack, onFade, compact, creatorWinRate }: Props) {
  const event = market.jupiterEventTitle ?? "";
  const [home, away] = splitEventTitle(event || market.question);
  const isH2H = !!away;
  // Outright markets ("EPL: 2027 Champion" → "Manchester City") carry the club
  // in the question, not the event title. Crest off the title there and you get
  // an "E" square. Head-to-heads keep using the title's two sides.
  const crestName = isH2H ? home : market.question || home;
  const state = useMarketState(market);
  const noProb =
    market.noPrice > 0 ? market.noPrice : market.yesPrice > 0 ? 1 - market.yesPrice : null;
  const crest = compact ? 28 : 34;

  return (
    <Pressable
      style={[
        s.card,
        compact && s.cardCompact,
        state.state === "settled" && s.cardSettled,
        state.state === "expired" && s.cardExpired,
      ]}
      onPress={onPress}
    >
      <View style={s.top}>
        <Badge
          tone={market.source === "native" ? "terrace" : "poly"}
          label={market.source === "native" ? "Terrace" : "Polymarket"}
        />
        {market.isPrivate && <Badge tone="private" label="Private" icon="lock" />}
        {market.isFlash && <Badge tone="flash" label="Flash" icon="bolt" />}
        <View style={{ flex: 1 }} />
        <MarketStateBadge market={market} />
      </View>

      <View style={s.mid}>
        {isH2H ? (
          <View style={s.crests}>
            <TeamBadge name={crestName} size={crest} />
            <Text style={s.v}>V</Text>
            <TeamBadge name={away} size={crest} />
          </View>
        ) : (
          <TeamBadge name={crestName} size={crest} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.comp} numberOfLines={1}>
            {event || competitionLabel(market)}
          </Text>
          <Text style={[s.call, compact && s.callCompact]} numberOfLines={2}>
            {market.question}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={C.ink4} />
      </View>

      {state.takeable ? (
        <View style={s.odds}>
          <OddsButton
            label="Back"
            tone="yes"
            value={probToFractional(market.yesPrice)}
            onPress={onBack ?? onPress}
          />
          <OddsButton
            label="Fade"
            tone="no"
            value={probToFractional(noProb)}
            onPress={onFade ?? onPress}
          />
        </View>
      ) : (
        // No prices once the deadline has passed: a tappable price the program
        // would reject is worse than no price at all.
        <MarketOutcomeLine
          market={market}
          crest={
            state.winner === "YES" ? <TeamBadge name={crestName} size={20} /> : undefined
          }
        />
      )}

      <View style={s.foot}>
        {market.totalVolumeUsdc > 0 && (
          <Text style={s.matched}>MATCHED {moneyWhole(market.totalVolumeUsdc)}</Text>
        )}
        {market.source === "native" && market.creator && (
          <CreatorLine pubkey={market.creator} winRateBps={creatorWinRate} />
        )}
      </View>
    </Pressable>
  );
}

// Re-exported so callers can keep market titles consistent. Remaining time is
// no longer re-exported: it belongs to MarketStateBadge now.
export { marketTitle };

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  cardCompact: { padding: 12, gap: 10, borderRadius: radius.md },
  cardSettled: { opacity: 0.6 },
  // Expired isn't dimmed — an unsettled market someone has money in should
  // catch the eye, not fade into the list.
  cardExpired: { borderColor: "#3a1414" },

  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  mid: { flexDirection: "row", alignItems: "center", gap: 11 },
  crests: { flexDirection: "row", alignItems: "center", gap: 6 },
  v: { fontFamily: font.condBold, fontSize: 12, fontWeight: "700", color: C.ink4 },
  comp: { fontFamily: font.sans, fontSize: 11, color: C.ink3, fontWeight: "600" },
  call: {
    fontFamily: font.condBold,
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  callCompact: { fontSize: 14.5 },
  odds: { flexDirection: "row", gap: 6 },

  foot: { flexDirection: "row", alignItems: "center", gap: 10 },
  matched: {
    fontFamily: font.sansSemi,
    fontSize: 10.5,
    fontWeight: "600",
    color: C.ink3,
    letterSpacing: 0.4,
  },

  creator: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto", minWidth: 0 },
  monogram: { width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  monogramTxt: { fontFamily: font.condBold, fontSize: 8.5, fontWeight: "700", color: "#fff" },
  creatorName: { fontFamily: font.sansSemi, fontSize: 10.5, fontWeight: "600", color: C.ink2 },
  creatorTag: { fontFamily: font.sans, fontSize: 9.5, color: C.ink4 },
  creatorWin: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", color: C.green },
});

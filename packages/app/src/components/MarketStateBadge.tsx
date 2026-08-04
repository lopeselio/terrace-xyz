import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { color as C, font, radius } from "../theme/tokens";
import { useMarketState } from "../hooks/useMarketState";
import type { MarketStateInfo, MarketStateInput } from "../utils/marketState";
import { Badge, type BadgeTone } from "./ui";

// ---------------------------------------------------------------------------
// The state a market is in, as one badge — the same badge on every surface.
// Colour carries the meaning: green counts down (takeable), amber is waiting on
// settlement, red went unsettled, grey is done.
// ---------------------------------------------------------------------------

function toneFor(info: MarketStateInfo): BadgeTone {
  switch (info.state) {
    case "counter":
      return info.urgent ? "amber" : "open";
    case "resolving":
      return "resolving";
    case "expired":
      return "expired";
    case "settled":
      return "settled";
  }
}

export function MarketStateBadge({ market }: { market: MarketStateInput }) {
  const info = useMarketState(market);
  const icon = info.state === "counter" ? "clock" : info.state === "resolving" ? "hourglass" : undefined;
  return <Badge tone={toneFor(info)} label={info.label} icon={icon} />;
}

/**
 * The muted "closed 12m ago" line that sits under the badge. Renders nothing
 * while a market is still counting down — the countdown already says it.
 */
export function MarketStateDetail({ market, style }: { market: MarketStateInput; style?: object }) {
  const info = useMarketState(market);
  if (!info.detail) return null;
  return <Text style={[s.detail, style]}>{info.detail}</Text>;
}

/**
 * What happened, for a market that's finished. Settled markets show the winning
 * side; unsettled ones say plainly that no result landed, because "Settled" and
 * "nobody settled it" are opposite things for someone holding a position.
 */
export function MarketOutcomeLine({ market, crest }: { market: MarketStateInput; crest?: React.ReactNode }) {
  const info = useMarketState(market);
  if (info.state === "counter") return null;

  if (info.state === "settled") {
    if (!info.winner) {
      return (
        <View style={s.row}>
          <Text style={s.muted}>Settled</Text>
          <Text style={s.mutedSoft}>{info.detail}</Text>
        </View>
      );
    }
    const won = info.winner === "YES";
    return (
      <View style={s.row}>
        {crest ?? (
          <View style={[s.token, { backgroundColor: won ? C.greenDeep : C.redMid, borderColor: won ? C.green : C.red }]}>
            <Text style={[s.tokenTxt, { color: won ? C.greenInk : C.redInk }]}>{won ? "Y" : "N"}</Text>
          </View>
        )}
        <Text style={[s.result, { color: won ? C.greenInk : C.redInk }]}>{info.winner} WON</Text>
        <Text style={s.mutedSoft}>{info.detail}</Text>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <Text style={info.state === "expired" ? s.expired : s.muted}>
        {info.state === "expired" ? "Never settled" : "Awaiting settlement"}
      </Text>
      <Text style={s.mutedSoft}>{info.detail}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  detail: { fontFamily: font.sans, fontSize: 10.5, color: C.ink4 },
  muted: { fontFamily: font.sansSemi, fontSize: 11.5, fontWeight: "600", color: C.ink3 },
  mutedSoft: { fontFamily: font.sans, fontSize: 10.5, color: C.ink4 },
  expired: { fontFamily: font.sansSemi, fontSize: 11.5, fontWeight: "600", color: C.redInk },
  result: { fontFamily: font.condBold, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  token: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenTxt: { fontFamily: font.condBold, fontSize: 10.5, fontWeight: "700" },
});

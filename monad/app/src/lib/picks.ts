"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { BetPick } from "@/components/BetSheet";
import type { useAccount } from "./account";
import { backStandard, standardMarkets, type StdMarket } from "./markets";
import { fractional, price } from "./odds";
import { KIND } from "./social";
import { useOpeningLines, type OpeningLine } from "./useOdds";

type Send = ReturnType<typeof useAccount>["send"];
type Teams = { id: number; home: { name: string }; away: { name: string } };

const MARKET_NAME: Record<number, string> = { [KIND.HOME]: "Match result", [KIND.DRAW]: "Match result", [KIND.AWAY]: "Match result", [KIND.OVER]: "Goals", [KIND.BTTS]: "Both teams to score" };

/** What a selection on a match's standard question is called: "Liverpool", "Draw", "Over 2.5", "Yes". */
export function stdLabel(m: Teams, kind: number, side: 1 | 2) {
  if (kind === KIND.HOME) return side === 1 ? m.home.name : `Not ${m.home.name}`;
  if (kind === KIND.AWAY) return side === 1 ? m.away.name : `Not ${m.away.name}`;
  if (kind === KIND.DRAW) return side === 1 ? "Draw" : "No draw";
  if (kind === KIND.OVER) return side === 1 ? "Over 2.5" : "Under 2.5";
  return side === 1 ? "Yes" : "No";
}

function openingFor(line: OpeningLine | undefined, kind: number, side: 1 | 2) {
  if (!line) return null;
  if (kind === KIND.HOME) return side === 1 ? line.home : null;
  if (kind === KIND.DRAW) return side === 1 ? line.draw : null;
  if (kind === KIND.AWAY) return side === 1 ? line.away : null;
  if (kind === KIND.OVER) return side === 1 ? line.over25 : line.under25;
  return side === 1 ? line.bttsYes : line.bttsNo;
}

function poolFor(std: StdMarket | undefined, side: 1 | 2) {
  if (!std) return null;
  const yes = Number(std.yesPool), no = Number(std.noPool);
  return side === 1 ? { side: yes, other: no } : { side: no, other: yes };
}

/** Neutral price with no pool or bookmaker line: a three-way split for result picks, evens otherwise. */
const threeWay = (kind: number, side: 1 | 2) => (side === 1 && (kind === KIND.HOME || kind === KIND.DRAW || kind === KIND.AWAY) ? 3 : 2);

/** Prices and pools for a set of matches' standard questions, refreshed every 20s. */
export function useMatchPrices(fixtureIds: number[]) {
  const lines = useOpeningLines();
  const [std, setStd] = useState<Map<string, StdMarket>>(new Map());
  const key = fixtureIds.join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",").map(Number);
    const load = () => standardMarkets(ids).then(setStd).catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(t);
  }, [key]);

  /** Fractional price shown on an odds button. */
  const odds = (fixtureId: number, kind: number, side: 1 | 2 = 1) =>
    fractional(price(poolFor(std.get(`${fixtureId}-${kind}`), side), openingFor(lines[fixtureId], kind, side), threeWay(kind, side)).decimal);

  /** A ready-to-open bet slip for one selection. */
  const pick = (m: Teams, kind: number, side: 1 | 2, send: Send, owner: Address | null): BetPick => {
    const s = std.get(`${m.id}-${kind}`);
    return {
      eyebrow: `${m.home.name} v ${m.away.name} · ${MARKET_NAME[kind]}`,
      label: stdLabel(m, kind, side),
      side,
      pool: poolFor(s, side),
      feeBps: s?.feeBps ?? 0,
      opening: openingFor(lines[m.id], kind, side),
      neutral: threeWay(kind, side),
      note: "Settled from the final score by Chainlink.",
      place: (dollars) => {
        if (!owner) throw new Error("Sign in to place it.");
        return backStandard(send, owner, m.id, kind, side, dollars, s);
      },
    };
  };

  return { odds, pick, std, lines };
}

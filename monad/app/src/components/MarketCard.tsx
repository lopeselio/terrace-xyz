"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { Icon } from "./Icon";
import type { BetPick } from "./BetSheet";
import { Badge, Crest, Odd, countdown, LeagueLogo } from "./ui";
import type { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { fractional, price } from "@/lib/odds";
import { bet } from "@/lib/play";
import { KIND } from "@/lib/social";
import type { MatchLite } from "@/lib/useMatches";

type Send = ReturnType<typeof useAccount>["send"];

/** An open market as the Markets list and the swipe deck see it. */
export type OpenMarket = {
  id: string;
  token: string;
  feeBps: number;
  isFlash: boolean;
  yesPool: string;
  noPool: string;
  volume: string;
  bettors: number;
  take: { id: string; room_id: string } | null;
  question: { id: string; kind: number; line: number; text: string; closeTime: string; answer: number; spec: string | null; fixture: { id: string } | null };
};

export const MARKET_FIELDS = `id token feeBps isFlash yesPool noPool volume bettors take { id room_id }
  question { id kind line text closeTime answer spec fixture { id } }`;

/** Open, unsealed pools that haven't closed yet, busiest first (test markets left out). */
export async function openMarkets(opts: { flash?: boolean } = {}): Promise<OpenMarket[]> {
  const now = Math.floor(Date.now() / 1000);
  const flash = opts.flash === undefined ? "" : `, isFlash: { _eq: ${opts.flash} }`;
  const d = await query<{ Market: OpenMarket[] }>(
    `query M($now: numeric!) {
      Market(where: { isSealed: { _eq: false }${flash}, question: { answer: { _eq: 0 }, closeTime: { _gt: $now } } }, order_by: { volume: desc }, limit: 60) { ${MARKET_FIELDS} }
    }`,
    { now },
  );
  return d.Market.filter((m) => !m.question.text.startsWith("E2E "));
}

/** Open markets, refreshed every 15s. null while the first load is in flight. */
export function useOpenMarkets(opts: { flash?: boolean } = {}) {
  const [list, setList] = useState<OpenMarket[] | null>(null);
  const [error, setError] = useState(false);
  const flash = opts.flash;
  useEffect(() => {
    let alive = true;
    const load = () =>
      openMarkets({ flash })
        .then((l) => alive && (setList(l), setError(false)))
        .catch(() => alive && (setError(true), setList((x) => x ?? [])));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [flash]);
  return { list, error };
}

export const fixtureOf = (m: OpenMarket) => Number(m.question.fixture?.id ?? m.take?.room_id.split("-")[1] ?? 0);

/** The call in plain words: the take itself, or "Liverpool to win" for a match pool. */
export function marketTitle(m: OpenMarket, match?: MatchLite) {
  const q = m.question;
  if (q.kind === KIND.HOME) return `${match?.home.name ?? "Home side"} to win`;
  if (q.kind === KIND.AWAY) return `${match?.away.name ?? "Away side"} to win`;
  if (q.kind === KIND.DRAW) return "Draw";
  if (q.kind === KIND.OVER) return `Over ${q.line}.5 goals`;
  if (q.kind === KIND.BTTS) return "Both teams to score";
  return q.text;
}

/** Fractional pool price for one side ("Evs" until both sides have money). */
export function marketOdds(m: OpenMarket, side: 1 | 2) {
  const yes = Number(m.yesPool), no = Number(m.noPool);
  return fractional(price(side === 1 ? { side: yes, other: no } : { side: no, other: yes }).decimal);
}

/** "How it settles", in plain words: a rule checked against the match data, or the AI judge. */
export function settleLine(m: OpenMarket) {
  if (m.question.kind > 0) return "From the final score, checked by Chainlink";
  if (m.question.spec) return "From the official match data, checked by Chainlink";
  return "An AI judge reads the match report after full time";
}

/** A bet slip for one side of an open market. */
export function marketPick(m: OpenMarket, match: MatchLite | undefined, side: 1 | 2, send: Send, owner: Address | null): BetPick {
  const yes = Number(m.yesPool), no = Number(m.noPool);
  return {
    eyebrow: `${match ? `${match.home.name} v ${match.away.name}` : "Match"} · ${marketTitle(m, match)}`,
    label: side === 1 ? "Yes" : "No",
    side,
    pool: side === 1 ? { side: yes, other: no } : { side: no, other: yes },
    feeBps: m.feeBps,
    note: `How it settles: ${settleLine(m).toLowerCase()}.`,
    place: (dollars) => {
      if (!owner) throw new Error("Sign in to place it.");
      return bet(send, owner, BigInt(m.id), m.token as Address, side, dollars);
    },
  };
}

/** Market card from the handoff's Markets list. */
export function MarketCard({ m, match, now, onPick }: { m: OpenMarket; match?: MatchLite; now: number; onPick: (side: 1 | 2) => void }) {
  const fixture = fixtureOf(m);
  const close = Number(m.question.closeTime);
  return (
    <div className="card">
      <div className="match-top">
        {m.isFlash ? <Badge tone="flash" icon="bolt">Flash</Badge> : <Badge tone="terrace">Terrace</Badge>}
        <LeagueLogo m={match} />
        <span className="badge b-settled" style={{ marginLeft: "auto" }}>
          <Icon name="clock" size={12} /> {countdown(close, now)}
        </span>
      </div>
      <Link href={fixture ? `/m/${fixture}${m.take ? `#take-${m.take.id}` : ""}` : "/markets"} className="row card-tap" style={{ margin: "11px 0 10px", color: "var(--ink)" }}>
        <span className="crest-pair">
          <Crest logo={match?.home.logo} name={match?.home.name ?? "?"} />
          <Crest logo={match?.away.logo} name={match?.away.name ?? "?"} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{marketTitle(m, match)}</span>
          <span className="umeta" style={{ display: "block" }}>{match ? `${match.home.name} v ${match.away.name}` : "Match room"} · {m.bettors === 1 ? "1 fan in" : `${m.bettors} fans in`}</span>
        </span>
      </Link>
      <div className="oddsrow two">
        <Odd label="Yes" value={marketOdds(m, 1)} tone="yes" onClick={() => onPick(1)} />
        <Odd label="No" value={marketOdds(m, 2)} tone="no" onClick={() => onPick(2)} />
      </div>
      <div className="umeta row" style={{ gap: 5, marginTop: 9 }}>
        <Icon name={m.question.spec || m.question.kind > 0 ? "shield" : "eye"} size={12} /> {settleLine(m)}
      </div>
    </div>
  );
}

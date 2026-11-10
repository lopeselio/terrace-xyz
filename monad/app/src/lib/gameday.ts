"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { query } from "./indexer";
import { callStoppage } from "./errors";
import { FINISHED, LIVE } from "@/components/MatchRow";
import { GD_QUERY, MATES_QUERY, RECENT, buildGroups, type Acca, type MatchGroup, type RawBet, type RawDuel } from "./positions";
import type { MatchLite } from "./useMatches";

export type { Acca, MatchGroup, Position, RawBet, Standing } from "./positions";

/** Matches with live scores, refreshed every 20 seconds while the page is visible. null until the first load. */
export function useLiveMatches() {
  const [byId, setById] = useState<Map<number, MatchLite> | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/matches")
        .then((r) => r.json())
        .then((list: MatchLite[]) => alive && setById(new Map(list.map((m) => [m.id, m]))))
        .catch(() => {
          if (alive) setById((m) => m ?? new Map());
          callStoppage(navigator.onLine ? "data_lag" : "offline_soft");
        });
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return byId;
}

/** The fan's game day: positions by match, accumulators, and live readings of their custom takes. */
export function useGameDay(address: string | null) {
  const matches = useLiveMatches();
  const [raw, setRaw] = useState<{ bets: RawBet[]; duels: RawDuel[]; accas: Acca[] } | null>(null);
  const [custom, setCustom] = useState<Record<string, "YES" | "NO" | null>>({});
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const me = address?.toLowerCase() ?? null;

  const load = useCallback(() => {
    if (!me) return;
    query<{ Bet: RawBet[]; Matchup: RawDuel[]; Parlay: Acca[] }>(GD_QUERY, { me, since: Math.floor(Date.now() / 1000) - RECENT })
      .then((d) => setRaw({ bets: d.Bet, duels: d.Matchup, accas: d.Parlay }))
      .catch(() => setRaw((r) => r ?? { bets: [], duels: [], accas: [] }));
  }, [me]);
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load();
      setNow(Math.floor(Date.now() / 1000));
    }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Custom takes on matches in play get read by the same rules CRE settles with, every 30 seconds.
  const takes = useMemo(() => {
    if (!raw) return [];
    const qs = [...raw.bets.filter((b) => b.result === null).map((b) => b.market.question), ...raw.duels.filter((d) => d.status === 1).map((d) => d.question)];
    const seen = new Set<string>();
    return qs
      .filter((q) => q.kind === 0 && q.spec && q.answer === 0 && q.fixture && !seen.has(q.id) && seen.add(q.id))
      .filter((q) => {
        const status = matches?.get(Number(q.fixture!.id))?.status ?? "";
        return LIVE.has(status) || (FINISHED.has(status) && Number(q.fixture!.kickoff) > Date.now() / 1000 - RECENT);
      })
      .map((q) => ({ id: q.id, fixture: Number(q.fixture!.id), spec: q.spec! }));
  }, [raw, matches]);
  const takesKey = takes.map((t) => t.id).join(",");
  useEffect(() => {
    if (!takes.length) return;
    let alive = true;
    const read = () =>
      fetch("/api/live", { method: "POST", body: JSON.stringify({ takes }) })
        .then((r) => r.json())
        .then((d: Record<string, "YES" | "NO" | null>) => alive && setCustom((c) => ({ ...c, ...d })))
        .catch(() => {});
    read();
    const t = setInterval(() => document.visibilityState === "visible" && read(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takesKey]);

  const groups = useMemo(() => (raw && me && matches ? buildGroups(raw.bets, raw.duels, me, matches, custom, now) : null), [raw, me, matches, custom, now]);
  return { groups, accas: raw?.accas ?? [], matches: matches ?? new Map<number, MatchLite>(), reload: load };
}

/** Followed fans with something on a match in play, and how it stands for them. */
export function useMatesLive(follows: Set<string>, matches: Map<number, MatchLite>) {
  const [bets, setBets] = useState<(RawBet & { bettor: string })[] | null>(null);
  const key = [...follows].sort().slice(0, 40).join(",");
  useEffect(() => {
    if (!key) return setBets([]);
    let alive = true;
    const load = () =>
      query<{ Bet: (RawBet & { bettor: string })[] }>(MATES_QUERY, { fans: key.split(",") })
        .then((d) => alive && setBets(d.Bet))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);
  return useMemo(() => {
    if (!bets || !matches.size) return [];
    const now = Date.now() / 1000;
    const byFan = new Map<string, RawBet[]>();
    for (const b of bets) byFan.set(b.bettor, [...(byFan.get(b.bettor) ?? []), b]);
    const out: { fan: string; live: MatchGroup[] }[] = [];
    for (const [fan, list] of byFan) {
      const live = buildGroups(list, [], fan, matches, {}, now).filter((g) => g.phase === "live");
      if (live.length) out.push({ fan, live });
    }
    return out;
  }, [bets, matches]);
}

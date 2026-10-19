"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Icon } from "./Icon";
import { Avatar, fanName } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { publicClient } from "@/lib/chain";
import { leaguesAt } from "@/lib/contracts";
import { query } from "@/lib/indexer";
import { ordinal } from "@/lib/leagues";
import { play } from "@/lib/sound";
import "@/styles/outcome.css";

/*
 * When a gameweek in one of your leagues is added up, every member gets a popup once per device:
 * who won it, the top three, where you finished, and a way into that league's table.
 */

type Row = { member: string; points: number };
type Result = { contestId: string; leagueId: string; league: string; gameweek: number; rows: Row[] };
type Joined = { league: { id: string; name: string; members: { member: string }[]; contests: { id: string; gameweek: number | null }[] } };

const POLL_MS = 30_000;

export function GameweekPopup() {
  const { status, address } = useAccount();
  const agents = useAgents();
  const [queue, setQueue] = useState<Result[]>([]);
  const me = address?.toLowerCase() ?? null;
  const storeKey = me ? `terrace.gwSeen.${me}` : null;

  const seen = useCallback((): Set<string> => {
    try {
      return new Set(JSON.parse((storeKey && localStorage.getItem(storeKey)) || "[]"));
    } catch {
      return new Set();
    }
  }, [storeKey]);

  const markSeen = useCallback(
    (id: string) => {
      try {
        if (storeKey) localStorage.setItem(storeKey, JSON.stringify([...seen(), id]));
      } catch {}
    },
    [storeKey, seen],
  );

  const check = useCallback(async () => {
    if (!me || document.visibilityState !== "visible") return;
    try {
      const d = await query<{ LeagueMember: Joined[] }>(
        `query G($me: String!) { LeagueMember(where: { member: { _eq: $me } }) { league { id name members { member }
            contests(where: { finalized: { _eq: true }, gameweek: { _is_null: false } }, order_by: { gameweek: desc }, limit: 1) { id gameweek } } } }`,
        { me },
      );
      const done = seen();
      const fresh = d.LeagueMember.flatMap(({ league }) => league.contests.filter((c) => !done.has(c.id)).map((c) => ({ league, c })));
      if (!fresh.length) return;
      const results = await Promise.all(
        fresh.map(async ({ league, c }): Promise<Result> => {
          const scores = await Promise.all(
            league.members.map((m) => publicClient.readContract({ ...leaguesAt(c.id), functionName: "contestScore", args: [BigInt(c.id), m.member as Address] })),
          );
          const rows = league.members.map((m, i) => ({ member: m.member, points: Number(scores[i]) })).sort((a, b) => b.points - a.points);
          return { contestId: c.id, leagueId: league.id, league: league.name, gameweek: c.gameweek ?? 0, rows };
        }),
      );
      setQueue((q) => [...q, ...results.filter((r) => !q.some((x) => x.contestId === r.contestId))]);
    } catch {
      // try again on the next poll
    }
  }, [me, seen]);

  useEffect(() => {
    if (status !== "ready") return;
    check();
    const t = setInterval(check, POLL_MS);
    return () => clearInterval(t);
  }, [status, check]);

  const now = queue[0];
  useEffect(() => {
    if (now) play("fanfare");
    if (now && now.rows[0]?.member === me && now.rows[0].points > 0) navigator.vibrate?.([30, 40, 60]);
  }, [now, me]);
  if (!now) return null;

  const next = () => {
    markSeen(now.contestId);
    setQueue((q) => q.slice(1));
  };
  const name = (a: string) => (a === me ? "You" : agents.get(a) || fanName(a));
  const top = now.rows[0];
  const nobody = !top || top.points === 0;
  const winners = now.rows.filter((r) => r.points === top?.points);
  const iWon = !nobody && winners.some((w) => w.member === me);
  const myRank = now.rows.findIndex((r) => r.member === me) + 1;
  const mine = now.rows[myRank - 1];

  return (
    <div className="outcome gw" role="dialog" aria-modal aria-label={`Gameweek ${now.gameweek} results`}>
      <div className="outcome-scrim" onClick={next} />
      <div className="outcome-card">
        {!nobody && (
          <div className="burst" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${(360 / 14) * i}deg`, ["--d" as string]: `${i % 3}` }} />)}
          </div>
        )}
        <div className="outcome-icon"><Icon name="crown" size={30} /></div>
        <div className="gw-eyebrow">{now.league} · Gameweek {now.gameweek}</div>
        <div className="outcome-head">
          {nobody ? "No winner this week" : iWon ? (winners.length > 1 ? "You shared it" : "You won the week") : winners.length > 1 ? "Shared at the top" : `${name(top.member)} won it`}
        </div>
        {!nobody && <div className="outcome-amount">{top.points}<small> pts</small></div>}

        <ol className="gw-podium">
          {now.rows.slice(0, 3).map((r, i) => (
            <li key={r.member} className={r.member === me ? "me" : undefined}>
              <span className="gw-pos">{r.points === top?.points ? 1 : i + 1}</span>
              <Avatar seed={r.member} size={26} name={agents.get(r.member) || undefined} />
              <span className="gw-name">{name(r.member)}</span>
              <b>{r.points}</b>
            </li>
          ))}
        </ol>
        {mine && myRank > 3 && <div className="outcome-sub">You finished {ordinal(myRank)} with {mine.points} pts.</div>}
        {nobody && <div className="outcome-sub">Nobody scored. Exact scores and right results score points; the league&apos;s house rules say how many.</div>}

        <div className="outcome-actions">
          <Link className="cta" href={`/l/${now.leagueId}`} onClick={next}>
            See gameweek {now.gameweek} <Icon name="chevronRight" size={16} />
          </Link>
          <button className="cta cta-ghost cta-sm" onClick={next}>{queue.length > 1 ? `Next (${queue.length - 1})` : "Close"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Room } from "./Room";
import { ScorePicker } from "./ScorePicker";
import { Avatar, Badge, fanName } from "./ui";
import { SignIn } from "./SignIn";
import { useAccount } from "@/lib/account";
import { publicClient } from "@/lib/chain";
import { ADDR, leaguesAbi } from "@/lib/contracts";
import { query } from "@/lib/indexer";
import {
  addGameweek,
  endSeason,
  executeProposal,
  finalizeGameweek,
  joinLeague,
  proposeGameweek,
  submitPicks,
  table,
  vote,
} from "@/lib/leagues";

type Match = { id: number; kickoff: number; status: string; home: { name: string }; away: { name: string }; goals: { home: number | null; away: number | null } };
type League = Awaited<ReturnType<typeof readLeague>>;
type Proposal = { id: string; proposer: string; kind: number; yes: number; no: number; status: number; deadline: string; payload: string };

const L = { address: ADDR.leagues, abi: leaguesAbi } as const;
const FINISHED = new Set(["FT", "AET", "PEN"]);

async function readLeague(id: bigint) {
  const league = await publicClient.readContract({ ...L, functionName: "getLeague", args: [id] });
  const contests = await Promise.all(league.contestIds.map((c) => publicClient.readContract({ ...L, functionName: "getContest", args: [c] })));
  return { ...league, contests };
}

export function LeagueView({ leagueId, code: codeFromLink }: { leagueId: number; code: string }) {
  const { status, address, keys, send } = useAccount();
  const id = BigInt(leagueId);
  const [league, setLeague] = useState<League | null>(null);
  const [rows, setRows] = useState<{ member: Address; points: number }[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [picks, setPicks] = useState<Record<string, [number, number]>>({});
  const [nextGw, setNextGw] = useState<number[]>([]);
  const [code, setCode] = useState(codeFromLink);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await readLeague(id);
      setLeague(l);
      setRows(await table(id, l.members));
    } catch {
      setNotFound(true);
    }
    fetch("/api/matches").then((r) => r.json()).then(setMatches).catch(() => {});
    query<{ Proposal: Proposal[] }>(`query P($l: String!) { Proposal(where: { league_id: { _eq: $l } }, order_by: { deadline: desc }) { id proposer kind yes no status deadline payload } }`, { l: String(leagueId) })
      .then((d) => setProposals(d.Proposal))
      .catch(() => {});
  }, [id, leagueId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (notFound) return <p className="muted">No league here.</p>;
  if (!league) return <p className="muted">Loading the league…</p>;

  const me = address?.toLowerCase();
  const member = !!me && league.members.some((m) => m.toLowerCase() === me);
  const creator = !!me && league.creator.toLowerCase() === me;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const gw = league.contests.length; // current gameweek number
  const current = league.contests[gw - 1];
  const now = Date.now() / 1000;
  const open = current && Number(current.lockTime) > now;
  const allPlayed = current?.fixtureIds.every((f) => FINISHED.has(byId.get(Number(f))?.status ?? ""));
  const upcoming = matches.filter((m) => m.kickoff > now + 600);
  const canSetGameweek = league.contests.length < league.gameweeks && (!league.contests.length || current.finalized);
  const invite = typeof window !== "undefined" ? `${window.location.origin}/l/${leagueId}${code ? `?code=${code}` : ""}` : "";

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {league.isPrivate && <Badge tone="sealed">PRIVATE · SEALED PICKS</Badge>}
        {league.governed && <Badge tone="open">MEMBER-RUN</Badge>}
      </div>
      <h1>{league.name}</h1>
      <p className="lede">
        {league.members.length} in · gameweek {gw || "–"} of {league.gameweeks} · {league.governed ? "run by its members" : `run by ${creator ? "you" : fanName(league.creator)}`}
        {league.prizePool > 0n ? ` · $${Number(league.prizePool) / 1e6} season prize` : ""}
        {league.isPrivate ? " · private: picks stay sealed until each gameweek is over" : ""}
      </p>

      {status !== "ready" ? (
        <SignIn reason="Sign in to join this league." />
      ) : !member ? (
        <div className="sheet">
          {league.inviteCodeHash !== `0x${"0".repeat(64)}` && (
            <label className="field">Invite code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="From your mate's link" /></label>
          )}
          <button className="cta" disabled={!!busy} onClick={() => run("join", () => joinLeague(send, address!, id, code))}>
            {busy === "join" ? "Joining…" : `Join${league.entryFee > 0n ? ` for $${Number(league.entryFee) / 1e6}` : ""}`}
          </button>
        </div>
      ) : (
        invite && (
          <button className="link-btn" onClick={() => (navigator.share ? navigator.share({ title: league.name, url: invite }) : navigator.clipboard.writeText(invite))}>
            Invite your mates
          </button>
        )
      )}

      <h2>Table</h2>
      <ul className="board">
        {rows.map((r, i) => (
          <li key={r.member} className={r.member.toLowerCase() === me ? "me" : undefined}>
            <span className="pos">{i + 1}</span>
            <Avatar seed={r.member} size={30} />
            <span className="name">{r.member.toLowerCase() === me ? "You" : fanName(r.member)}</span>
            <span className="pts">{r.points}</span>
          </li>
        ))}
      </ul>

      {current && (
        <>
          <h2>Gameweek {gw}</h2>
          {current.fixtureIds.map((f) => {
            const m = byId.get(Number(f));
            const key = f.toString();
            const [h, a] = picks[key] ?? [1, 1];
            return (
              <div key={key} className="fixture" style={{ marginBottom: 8 }}>
                <span className="team home">{m?.home.name ?? `Match ${key}`}</span>
                {open && member ? (
                  <ScorePicker home={h} away={a} homeTeam={m?.home.name ?? ""} awayTeam={m?.away.name ?? ""} onChange={(nh, na) => setPicks({ ...picks, [key]: [nh, na] })} />
                ) : (
                  <span className="score">{m && m.goals.home !== null ? `${m.goals.home}–${m.goals.away}` : "v"}</span>
                )}
                <span className="team away">{m?.away.name ?? ""}</span>
              </div>
            );
          })}
          {open && member && keys && (
            <button
              className="cta"
              disabled={!!busy}
              onClick={() =>
                run("picks", () =>
                  submitPicks(
                    send,
                    keys,
                    league.contestIds[gw - 1],
                    current.sealed_,
                    current.fixtureIds.map((f) => (picks[f.toString()] ?? [1, 1])[0]),
                    current.fixtureIds.map((f) => (picks[f.toString()] ?? [1, 1])[1]),
                  ),
                )
              }
            >
              {busy === "picks" ? "Locking in…" : current.sealed_ ? "Seal my picks (hidden till the gameweek ends)" : "Lock in my picks"}
            </button>
          )}
          {!open && !current.finalized && <p className="muted">{allPlayed ? "All played." : "Picks are locked. Points land as the matches finish."}</p>}
          {!current.finalized && allPlayed && (
            <button className="cta" disabled={!!busy} onClick={() => run("final", () => finalizeGameweek(send, league.contestIds[gw - 1]))}>
              {busy === "final" ? "Adding up…" : "Add up the gameweek"}
            </button>
          )}
        </>
      )}

      {member && canSetGameweek && (
        <>
          <h2>{league.governed ? "Propose the next gameweek" : creator ? "Set the next gameweek" : "Next gameweek"}</h2>
          {(league.governed || creator) ? (
            <>
              <div className="chips">
                {upcoming.map((m) => (
                  <button key={m.id} className={`chip${nextGw.includes(m.id) ? " on" : ""}`} onClick={() => setNextGw(nextGw.includes(m.id) ? nextGw.filter((x) => x !== m.id) : [...nextGw, m.id])}>
                    {m.home.name} v {m.away.name}
                  </button>
                ))}
              </div>
              <p />
              <button
                className="cta"
                disabled={!!busy || nextGw.length === 0}
                onClick={() => run("gw", () => (league.governed ? proposeGameweek(send, id, nextGw.map(BigInt)) : addGameweek(send, id, nextGw.map(BigInt))))}
              >
                {busy === "gw" ? "Sending…" : league.governed ? `Put ${nextGw.length} matches to a vote` : `Set ${nextGw.length} matches`}
              </button>
            </>
          ) : (
            <p className="muted">Waiting for the league to set it.</p>
          )}
        </>
      )}

      {league.governed && proposals.length > 0 && (
        <>
          <h2>Votes</h2>
          <ul className="feed">
            {proposals.map((p) => {
              const openVote = p.status === 0 && Number(p.deadline) > now;
              return (
                <li key={p.id} className="take">
                  <p className="take-text">{p.kind === 0 ? "Next gameweek" : "Feature a take"} · proposed by {p.proposer === me ? "you" : fanName(p.proposer)}</p>
                  <p className="take-meta">
                    {p.yes} for · {p.no} against · {["voting", "passed", "rejected", "couldn't run"][p.status]}
                  </p>
                  {member && openVote && (
                    <div className="actions">
                      <button className="cta small" disabled={!!busy} onClick={() => run(`v${p.id}`, () => vote(send, BigInt(p.id), true))}>For</button>
                      <button className="cta small fade" disabled={!!busy} onClick={() => run(`v${p.id}`, () => vote(send, BigInt(p.id), false))}>Against</button>
                    </div>
                  )}
                  {p.status === 0 && !openVote && (
                    <button className="cta small" disabled={!!busy} onClick={() => run(`x${p.id}`, () => executeProposal(send, BigInt(p.id)))}>Close the vote</button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {league.contests.length === league.gameweeks && league.contests.every((c) => c.finalized) && !league.ended && (
        <button className="cta" disabled={!!busy} onClick={() => run("end", () => endSeason(send, id))}>Crown the champion</button>
      )}

      {error && <p className="error">{error}</p>}

      <h2>League chat</h2>
      <Room kind={1} roomId={leagueId} canPost={member} />
    </>
  );
}

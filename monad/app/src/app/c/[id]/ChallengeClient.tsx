"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Leaderboard } from "@/components/Leaderboard";
import { ScorePicker } from "@/components/ScorePicker";
import { fixtureMeta } from "@/lib/fixtures";
import {
  friendlyError, getContest, getFixtures, getLeaderboard, getMyPicks, kickoffLabel,
  type Contest, type Fixture,
} from "@/lib/terrace";
import { useTerraceWallet } from "@/lib/useTerraceWallet";

type Pick = { home: number; away: number };

export function ChallengeClient({ contestId }: { contestId: bigint }) {
  const wallet = useTerraceWallet();
  const [contest, setContest] = useState<Contest | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [board, setBoard] = useState<{ player: `0x${string}`; points: number }[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const pendingSave = useRef(false);

  const load = useCallback(async () => {
    try {
      const c = await getContest(contestId);
      setContest(c);
      setFixtures(await getFixtures(c.fixtureIds));
      setBoard(await getLeaderboard(c));
      setPicks((prev) => (prev.length ? prev : c.fixtureIds.map(() => ({ home: 1, away: 1 }))));
    } catch {
      setLoadError(true);
    }
  }, [contestId]);

  useEffect(() => { load(); }, [load]);

  // Returning players see their saved picks.
  useEffect(() => {
    if (!contest || !wallet.address) return;
    getMyPicks(contestId, wallet.address, contest.fixtureIds).then((saved) => {
      if (saved.every((p) => p.set)) {
        setPicks(saved.map((p) => ({ home: p.home, away: p.away })));
        setStatus("saved");
      }
    });
  }, [contest, wallet.address, contestId]);

  const save = useCallback(async () => {
    setError(null);
    setStatus("saving");
    try {
      await wallet.submitPicks(contestId, picks.map((p) => p.home), picks.map((p) => p.away));
      setStatus("saved");
      load();
    } catch (e) {
      setStatus("idle");
      setError(friendlyError(e));
    }
  }, [wallet, contestId, picks, load]);

  // Play first, sign in second: if a visitor taps save, sign them in, then save automatically.
  useEffect(() => {
    if (pendingSave.current && wallet.walletReady) {
      pendingSave.current = false;
      save();
    }
  }, [wallet.walletReady, save]);

  function onLockIn() {
    if (!wallet.walletReady) {
      pendingSave.current = true;
      wallet.login();
      return;
    }
    save();
  }

  async function share() {
    const url = window.location.href;
    const text = "I've called the scores. Think you can beat me?";
    if (navigator.share) await navigator.share({ title: "Terrace challenge", text, url }).catch(() => {});
    else await navigator.clipboard.writeText(`${text} ${url}`);
  }

  if (loadError) return <p className="error">This challenge couldn't be found. Check the link you were sent.</p>;
  if (!contest) return <p className="muted">Loading the challenge…</p>;

  const open = contest.lockTime * 1000 > Date.now();

  return (
    <>
      <h1>{open ? "Call the scores" : "Picks are in"}</h1>
      <p className="lede">
        {open
          ? `Picks close at kickoff, ${kickoffLabel(contest.lockTime)}. Exact score 3 points, right result 1.`
          : "Kickoff has passed. Points update as results come in."}
      </p>

      <div className="scarf" aria-hidden />
      <div className="card">
        {fixtures.map((f, i) => {
          const meta = fixtureMeta(f.id);
          const pick = picks[i] ?? { home: 1, away: 1 };
          return (
            <div className="match" key={f.id.toString()}>
              <span className="team">{meta.home}</span>
              {f.settled ? (
                <span className="result-pill" aria-label={`Full time ${f.homeGoals} ${f.awayGoals}`}>
                  {f.homeGoals}–{f.awayGoals}
                </span>
              ) : (
                <ScorePicker
                  home={pick.home}
                  away={pick.away}
                  homeTeam={meta.home}
                  awayTeam={meta.away}
                  disabled={!open || status === "saving"}
                  onChange={(home, away) => {
                    setStatus((s) => (s === "saved" ? "idle" : s));
                    setPicks((prev) => prev.map((p, j) => (j === i ? { home, away } : p)));
                  }}
                />
              )}
              <span className="team away">{meta.away}</span>
              <span className="meta">
                {f.settled ? `Full time · you picked ${pick.home}–${pick.away}` : `${meta.competition} · ${kickoffLabel(f.kickoff)}`}
              </span>
            </div>
          );
        })}

        {open && status !== "saved" && (
          <button className="cta" onClick={onLockIn} disabled={status === "saving"}>
            {status === "saving" ? "Locking in…" : "Lock in my picks"}
          </button>
        )}
        {status === "saved" && <div className="locked" role="status">Locked in. You can change your picks until kickoff.</div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <button className="cta secondary" onClick={share}>Challenge a mate</button>

      <h2>Table</h2>
      <Leaderboard rows={board} me={wallet.address} />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getReputation } from "@/lib/terrace";
import { useTerraceWallet } from "@/lib/useTerraceWallet";

type Rep = Awaited<ReturnType<typeof getReputation>>;

export default function MyRecord() {
  const wallet = useTerraceWallet();
  const [rep, setRep] = useState<Rep | null>(null);

  useEffect(() => {
    if (wallet.address) getReputation(wallet.address).then(setRep).catch(() => setRep(null));
  }, [wallet.address]);

  if (!wallet.authenticated) {
    return (
      <>
        <h1>Your record</h1>
        <p className="lede">Sign in to see your points, streaks and wins. Your record is yours and goes with you.</p>
        <button className="cta" onClick={wallet.login}>Sign in</button>
      </>
    );
  }

  const accuracy = rep && rep.predictions > 0 ? Math.round((rep.correctResults / rep.predictions) * 100) : 0;

  return (
    <>
      <h1>Your record</h1>
      <p className="lede">{wallet.displayName ? `Signed in as ${wallet.displayName}.` : "Settled results, checked independently. Nobody can edit them."}</p>
      {!rep ? (
        <p className="muted">Loading your record…</p>
      ) : (
        <div className="stat-grid">
          <div><strong>{rep.points}</strong><span>Points</span></div>
          <div><strong>{rep.contestsWon}</strong><span>Challenges won of {rep.contestsPlayed}</span></div>
          <div><strong>{accuracy}%</strong><span>Results called right</span></div>
          <div><strong>{rep.exactScores}</strong><span>Exact scores</span></div>
          <div><strong>{rep.currentStreak}</strong><span>Current streak</span></div>
          <div><strong>{rep.bestStreak}</strong><span>Best streak</span></div>
        </div>
      )}
      <button className="cta secondary" onClick={wallet.logout}>Sign out</button>
    </>
  );
}

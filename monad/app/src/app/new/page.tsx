"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FIXTURES } from "@/lib/fixtures";
import { friendlyError, getFixtures, kickoffLabel } from "@/lib/terrace";
import { useTerraceWallet } from "@/lib/useTerraceWallet";

type Row = { id: bigint; kickoff: number; home: string; away: string };

export default function NewChallenge() {
  const router = useRouter();
  const wallet = useTerraceWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const ids = FIXTURES.map((f) => BigInt(f.id));
    getFixtures(ids)
      .then((onchain) =>
        setRows(
          onchain
            .map((f, i) => ({ id: f.id, kickoff: f.kickoff, home: FIXTURES[i].home, away: FIXTURES[i].away }))
            .filter((r) => r.kickoff * 1000 > Date.now()),
        ),
      )
      .catch(() => setRows([]));
  }, []);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const id = await wallet.createChallenge([...chosen].map((s) => BigInt(s)));
      router.push(`/c/${id}`);
    } catch (e) {
      setBusy(false);
      setError(friendlyError(e));
    }
  }

  useEffect(() => {
    if (pending.current && wallet.walletReady) {
      pending.current = false;
      create();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.walletReady]);

  function onCreate() {
    if (!wallet.walletReady) {
      pending.current = true;
      wallet.login();
      return;
    }
    create();
  }

  return (
    <>
      <h1>Pick the matches</h1>
      <p className="lede">Choose up to 10. Your mates get a link and have until the first kickoff to call the scores.</p>

      {rows === null && <p className="muted">Loading fixtures…</p>}
      {rows?.length === 0 && <p className="muted">No upcoming matches are open yet. Check back before the weekend.</p>}
      <div className="pick-list">
        {rows?.map((r) => {
          const key = r.id.toString();
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={chosen.has(key)}
                onChange={(e) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked && next.size < 10) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
              />
              <span>
                {r.home} v {r.away}
                <br />
                <span className="muted">{kickoffLabel(r.kickoff)}</span>
              </span>
            </label>
          );
        })}
      </div>

      <button className="cta" disabled={chosen.size === 0 || busy} onClick={onCreate}>
        {busy ? "Creating…" : chosen.size ? `Create challenge with ${chosen.size} match${chosen.size > 1 ? "es" : ""}` : "Choose at least one match"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

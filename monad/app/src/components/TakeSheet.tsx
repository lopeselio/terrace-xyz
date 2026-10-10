"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { listTake, type Money } from "@/lib/play";

type Compiled = { spec: string; reading: string; closeTime: number; error?: string };

/** "Make it a market": the AI turns the take into a rule, the fan reads it in plain English, then backs it. */
export function TakeSheet({ messageId, fixtureId, text, onDone }: { messageId: string; fixtureId: number; text: string; onDone: () => void }) {
  const { send, address } = useAccount();
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compile-take", { method: "POST", body: JSON.stringify({ text, fixtureId }) })
      .then((r) => r.json())
      .then(setCompiled)
      .catch(() => setCompiled({ spec: "", reading: "", closeTime: 0, error: "Couldn't read that take right now." }));
  }, [text, fixtureId]);

  async function list() {
    if (!compiled || !address) return;
    setBusy(true);
    setError(null);
    try {
      await listTake(send, address, { messageId: BigInt(messageId), fixtureId: BigInt(fixtureId), closeTime: compiled.closeTime, text, spec: compiled.spec, money, dollars });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!compiled) return <div className="sheet muted">Reading your take…</div>;
  if (compiled.error) return <div className="sheet error">{compiled.error}</div>;
  const closes = new Date(compiled.closeTime * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="sheet">
      <p className="reading">{compiled.reading}</p>
      <p className="muted">Bets close at {closes}. {compiled.spec ? "Settled by Chainlink from live match data." : "Settled by the AI judge after full time."}</p>
      <div className="chips">
        {[1, 5, 10, 25].map((d) => (
          <button key={d} className={`chip${dollars === d ? " on" : ""}`} onClick={() => setDollars(d)}>${d}</button>
        ))}
        <button className={`chip${money === "usdc" ? " on" : ""}`} onClick={() => setMoney(money === "usd" ? "usdc" : "usd")}>{money === "usdc" ? "USDC" : "Dollars"}</button>
      </div>
      <p />
      <button className="btn" onClick={list} disabled={busy}>{busy ? "Putting it on the board…" : `Back my take with $${dollars}`}</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

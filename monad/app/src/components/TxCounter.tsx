"use client";
import { useCallback, useEffect, useState } from "react";
import { RollingNumber } from "./RollingNumber";
import type { TxCount } from "@/lib/server/txcount";

/*
 * Transactions across every Terrace contract. The server recounts from HyperSync every few hours
 * (it rate-limits); this re-reads the server's count every 5 minutes and rolls the number up when
 * it moves. "Count now" asks for a recount, which the server allows at most once a minute.
 */
const EVERY = 5 * 60_000;
const n = (v: number) => v.toLocaleString("en-GB");
const ago = (s: number) => (s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`);
const until = (s: number) => (s <= 60 ? "any minute" : s < 5400 ? `in ${Math.round(s / 60)}m` : `in ${Math.round(s / 3600)}h`);

export function TxCounter({ opsKey, initial }: { opsKey: string; initial: TxCount | null }) {
  const [c, setC] = useState(initial);
  const [since] = useState(initial?.total ?? null);
  const [down, setDown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async (fresh = false) => {
    try {
      const res = await fetch(`/api/ops/txs?key=${encodeURIComponent(opsKey)}${fresh ? "&fresh" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setC((await res.json()) as TxCount);
      setDown(false);
    } catch {
      setDown(true);
    }
    setNow(Math.floor(Date.now() / 1000));
  }, [opsKey]);

  useEffect(() => {
    if (!initial) load();
    const id = setInterval(() => !document.hidden && load(), EVERY);
    return () => clearInterval(id);
  }, [initial, load]);

  const recount = async () => {
    setBusy(true);
    await load(true);
    setBusy(false);
  };

  if (!c) return <p className="ops-note">Counting transactions{down ? ": HyperSync isn't answering, retrying in a few minutes" : "…"}</p>;
  const fresh = since === null ? 0 : c.total - since;
  const max = Math.max(1, ...c.contracts.map((x) => x.txs));
  return (
    <div className="ops-split" style={{ marginTop: 0 }}>
      <section className="ops-card ops-live">
        <div className="ops-tile-label"><i className={busy ? "ops-dot" : down ? "ops-dot off" : "ops-dot still"} aria-hidden /> Transactions across all Terrace contracts</div>
        <div className="ops-live-value"><RollingNumber value={c.total} format={n} /></div>
        <div className="ops-tile-sub">
          {n(c.last24h)} in the last 24h · {n(c.senders)} sending addresses · {fresh > 0 ? `+${n(fresh)} since you opened this · ` : ""}block {n(c.block)}
        </div>
        <div className="ops-live-foot">
          <span>Counted {ago(now - c.at)} · next recount {until(c.next - now)}{down ? " · couldn't reach the server" : ""}</span>
          <button type="button" onClick={recount} disabled={busy}>{busy ? "Counting…" : "Count now"}</button>
        </div>
      </section>
      <section className="ops-card">
        <h3>By contract</h3>
        <div className="ops-mix">
          {c.contracts.filter((x) => x.txs > 0).map((x) => (
            <div key={x.address} className="ops-mix-row ops-funnel" title={`${x.name} ${x.address}: ${n(x.txs)}`}>
              <span>
                <a href={`https://testnet.monadexplorer.com/address/${x.address}`} target="_blank" rel="noreferrer">{x.name.replace(/^Terrace/, "")}</a>
              </span>
              <i><b style={{ width: `${(x.txs / max) * 100}%` }} /></i>
              <em>{n(x.txs)}</em>
            </div>
          ))}
        </div>
        <p className="ops-tile-sub" style={{ marginTop: 10 }}>A transaction counts once in the total, and once for each contract it touches.</p>
      </section>
    </div>
  );
}

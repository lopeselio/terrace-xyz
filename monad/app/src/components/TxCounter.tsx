"use client";
import { useEffect, useState } from "react";
import { RollingNumber } from "./RollingNumber";
import type { TxCount } from "@/lib/server/txcount";

/*
 * Transactions across every Terrace contract, live: polls /api/ops/txs every 10 seconds and rolls
 * the number up as new ones land. Shows which contracts they hit underneath.
 */
const EVERY = 10_000;
const n = (v: number) => v.toLocaleString("en-GB");

export function TxCounter({ opsKey, initial }: { opsKey: string; initial: TxCount | null }) {
  const [c, setC] = useState(initial);
  const [since] = useState(initial?.total ?? null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/ops/txs?key=${encodeURIComponent(opsKey)}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as TxCount;
        if (!stop) { setC(next); setDown(false); }
      } catch {
        if (!stop) setDown(true);
      }
    };
    if (!initial) tick();
    const id = setInterval(tick, EVERY);
    return () => { stop = true; clearInterval(id); };
  }, [opsKey, initial]);

  if (!c) return <p className="ops-note">Counting transactions{down ? ": HyperSync isn't answering, retrying…" : "…"}</p>;
  const fresh = since === null ? 0 : c.total - since;
  const max = Math.max(1, ...c.contracts.map((x) => x.txs));
  return (
    <div className="ops-split" style={{ marginTop: 0 }}>
      <section className="ops-card ops-live">
        <div className="ops-tile-label"><i className={down ? "ops-dot off" : "ops-dot"} aria-hidden /> Transactions across all Terrace contracts</div>
        <div className="ops-live-value"><RollingNumber value={c.total} format={n} /></div>
        <div className="ops-tile-sub">
          {n(c.last24h)} in the last 24h · {n(c.senders)} sending addresses · {fresh > 0 ? `+${n(fresh)} since you opened this · ` : ""}block {n(c.block)}
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

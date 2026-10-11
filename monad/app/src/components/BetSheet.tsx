"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, Sheet, SheetHead, money } from "./ui";
import { useAccount } from "@/lib/account";
import { fixedReturns, fractional, implied, poolReturns, price } from "@/lib/odds";
import { balanceChanged, useBalance } from "@/lib/useBalance";

export type BetPick = {
  /** "Liverpool v Man City · Match result" */
  eyebrow: string;
  /** What you're backing: "Liverpool", "Yes", "No", "Over 2.5" */
  label: string;
  side: 1 | 2;
  /** Pool sizes in 6-decimal units (null when the pool doesn't exist yet). */
  pool: { side: number; other: number } | null;
  feeBps?: number;
  /** Bookmakers' decimal price, used until the pool has money on both sides. */
  opening?: number | null;
  /** Places the bet; resolves when it's locked in. */
  place: (dollars: number) => Promise<unknown>;
  /** Extra line under the price (e.g. how it settles). */
  note?: ReactNode;
};

const STAKES = [5, 10, 20, 50];

/** The bet slip sheet from the handoff: stake, potential returns, Place bet, then "Bet placed". */
export function BetSheet({ pick, onClose, onPlaced }: { pick: BetPick; onClose: () => void; onPlaced?: () => void }) {
  const { status } = useAccount();
  const { balance } = useBalance();
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);

  const p = price(pick.pool, pick.opening);
  const dollars = Math.max(0, Number(stake) || 0);
  const units = dollars * 1e6;
  const max = balance ? Number(balance.usd) / 1e6 : null;
  const funded = !!pick.pool && pick.pool.side + pick.pool.other > 0;
  const returns = funded ? poolReturns(units, pick.pool!.side, pick.pool!.other, pick.feeBps) / 1e6 : fixedReturns(dollars, p.decimal);
  const odds = fractional(p.decimal);
  const colour = pick.side === 2 ? "var(--red)" : "var(--green)";

  async function place() {
    setBusy(true);
    setError(null);
    try {
      await pick.place(dollars);
      balanceChanged();
      setPlaced(dollars);
      onPlaced?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (placed !== null) {
    return (
      <Sheet onClose={onClose}>
        <div style={{ textAlign: "center", paddingBottom: 4 }}>
          <div style={{ width: 58, height: 58, borderRadius: "50%", background: "var(--green-deep)", border: "1.5px solid var(--green)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "6px auto 14px" }}>
            <Icon name="check" size={26} />
          </div>
          <div className="sheet-title" style={{ fontSize: 26 }}>Bet placed</div>
          <div className="umeta" style={{ fontSize: 13, marginTop: 4 }}>
            ${placed.toFixed(2)} on {pick.eyebrow.split(" · ").pop()} · {pick.label} at {odds}
          </div>
          <div className="card" style={{ textAlign: "left", marginTop: 16 }}>
            <div className="kv" style={{ padding: 0 }}>
              <span className="k">Returns if it lands</span>
              <span className="v cond green" style={{ fontSize: 20 }}>${returns.toFixed(2)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="cta cta-ghost cta-sm" onClick={onClose}>Keep going</button>
            <Link className="cta cta-sm" href="/me" onClick={onClose}>My bets</Link>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <SheetHead
        eyebrow={pick.eyebrow}
        title={<>{pick.label} <span style={{ color: colour }}>{odds}</span></>}
        onClose={onClose}
      />
      {pick.note && <div className="umeta" style={{ marginTop: 6 }}>{pick.note}</div>}
      {status !== "ready" ? (
        <SignIn bare reason="Sign in to place it. One passkey, no forms." />
      ) : (
        <>
          <div className="flabel" style={{ marginTop: 18 }}>Stake</div>
          <label className="field row" style={{ gap: 8 }}>
            <span style={{ color: "var(--ink-3)", fontSize: 19, fontWeight: 600 }}>$</span>
            <input value={stake} inputMode="decimal" aria-label="Stake in dollars" onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
            {max !== null && <span className="badge b-settled">Max {money(balance!.usd)}</span>}
          </label>
          <div className="oddsrow four" style={{ marginTop: 8 }}>
            {STAKES.map((s) => (
              <button key={s} type="button" className={`odd sm${dollars === s ? " on" : ""}`} onClick={() => setStake(String(s))}>
                <span className="val">${s}</span>
              </button>
            ))}
          </div>
          <div className="kv" style={{ borderTop: "1px solid var(--line-hair)", marginTop: 14 }}>
            <span className="k">Potential returns</span>
            <span className="v cond green" style={{ fontSize: 22 }}>${returns.toFixed(2)}</span>
          </div>
          <div className="umeta" style={{ marginTop: -4, marginBottom: 10 }}>
            {funded && pick.pool!.other === 0
              ? "No one on the other side yet, so for now you'd get your stake back. Returns grow as fans take it on."
              : p.source === "pool"
              ? `Pool price, ${implied(p.decimal)}% chance. Returns move as fans back each side.`
              : p.source === "opening"
                ? "Opening line from the bookmakers. Once fans are on both sides, the pool sets the price."
                : "No one on the other side yet. Returns grow as fans take it on."}
          </div>
          {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}
          <button className="cta" disabled={busy || dollars <= 0 || (max !== null && dollars > max)} onClick={place}>
            {busy ? "Locking it in…" : max !== null && dollars > max ? "Not enough balance" : `Place bet · $${dollars.toFixed(dollars % 1 ? 2 : 0)}`}
          </button>
        </>
      )}
      <div className="row" style={{ justifyContent: "center", gap: 6, marginTop: 12 }}>
        <Badge tone="terrace">Terrace pool</Badge>
        <Badge tone="chainlink">Settled by Chainlink</Badge>
      </div>
    </Sheet>
  );
}

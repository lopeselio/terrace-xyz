"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { tokenOf, type Money } from "@/lib/play";
import { readSlip, writeSlip, type SlipLeg } from "@/lib/slip";
import { claimAcca, placeAcca, settleAcca, standardQuestion, type Leg } from "@/lib/social";

type Acca = { id: string; stake: string; legs: number; liveLegs: number; status: number; payout: string | null; potId: string };
const STATUS = ["OPEN", "WON", "LOST", "REFUNDED", "PAID"];
const WEEK = 7 * 86_400;

export function AccaBuilder() {
  const { status, address, send } = useAccount();
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [accas, setAccas] = useState<Acca[]>([]);

  useEffect(() => {
    const sync = () => setSlip(readSlip());
    sync();
    window.addEventListener("terrace-slip", sync);
    return () => window.removeEventListener("terrace-slip", sync);
  }, []);

  const loadAccas = useCallback(() => {
    if (!address) return;
    query<{ Parlay: Acca[] }>(`query A($me: String!) { Parlay(where: { player: { _eq: $me } }, order_by: { id: desc }) { id stake legs liveLegs status payout potId } }`, { me: address.toLowerCase() })
      .then((d) => setAccas(d.Parlay))
      .catch(() => {});
  }, [address]);
  useEffect(() => { loadAccas(); }, [loadAccas]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      loadAccas();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function place() {
    await run("place", async () => {
      const legs: Leg[] = [];
      for (const l of slip) {
        const questionId = l.questionId ? BigInt(l.questionId) : await standardQuestion(send, l.fixtureId, l.kind!);
        legs.push({ questionId, side: l.side });
      }
      await placeAcca(send, address!, legs, tokenOf(money), dollars);
      writeSlip([]);
      setDone(true);
    });
  }

  const now = Date.now() / 1000;
  return (
    <>
      <div className="section-head"><h3>Your slip</h3></div>
      {done && <p className="reading" style={{ color: "var(--green-ink)" }}>Acca placed. Track it below.</p>}
      {slip.length === 0 ? (
        <p className="muted">Empty. Open a <Link href="/matches" style={{ textDecoration: "underline" }}>match</Link> and tap a result or a take to add it.</p>
      ) : (
        <ul className="feed">
          {slip.map((l, i) => (
            <li key={l.key} className="take" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="meta" style={{ width: 18 }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{l.label}</span>
              <button className="link-btn" aria-label="Remove" onClick={() => writeSlip(slip.filter((x) => x.key !== l.key))}><Icon name="close" size={16} /></button>
            </li>
          ))}
        </ul>
      )}

      {slip.length > 0 && (
        <div className="sheet">
          <div className="chips">
            {[1, 5, 10, 25].map((d) => (
              <button key={d} className={`chip${dollars === d ? " on" : ""}`} onClick={() => setDollars(d)}>${d}</button>
            ))}
            <button className={`chip${money === "usdc" ? " on" : ""}`} onClick={() => setMoney(money === "usd" ? "usdc" : "usd")}>{money === "usdc" ? "USDC" : "Dollars"}</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {slip.length}-fold · your weight in the pot is ${dollars} × {slip.length} = {dollars * slip.length}. If nobody wins this week, everyone gets their stake back.
          </p>
          {status !== "ready" ? (
            <SignIn reason="Sign in to place your acca." />
          ) : (
            <button className="cta" disabled={!!busy || slip.length < 2} onClick={place}>
              {busy === "place" ? "Placing it…" : slip.length < 2 ? "Add at least 2 picks" : `Place ${slip.length}-fold for $${dollars}`}
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {accas.length > 0 && (
        <>
          <div className="section-head"><h3>Your accas</h3></div>
          <ul className="feed">
            {accas.map((a) => {
              const potEnds = (Number(a.potId) + 1) * WEEK;
              return (
                <li key={a.id} className="take">
                  <div className="take-head">
                    <span className="who">{a.legs}-fold · {usd(a.stake)}</span>
                    <div className="badges"><Badge tone={a.status === 1 || a.status === 4 ? "won" : a.status === 2 ? "lost" : a.status === 3 ? "settled" : "open"}>{STATUS[a.status]}</Badge></div>
                  </div>
                  <p className="take-meta">
                    {a.payout ? `Collected ${usd(a.payout)}` : `Pot closes ${new Date(potEnds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
                  </p>
                  <div className="actions">
                    {a.status === 0 && <button className="cta small ghost" disabled={!!busy} onClick={() => run(`s${a.id}`, () => settleAcca(send, BigInt(a.id)))}>Check my legs</button>}
                    {(a.status === 1 || a.status === 2) && now >= potEnds && (
                      <button className="cta small" disabled={!!busy} onClick={() => run(`c${a.id}`, () => claimAcca(send, BigInt(a.id)))}>Collect</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

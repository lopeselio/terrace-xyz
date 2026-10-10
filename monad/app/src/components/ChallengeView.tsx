"use client";
import { useCallback, useEffect, useState } from "react";
import { SignIn } from "./SignIn";
import { Avatar, Badge, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { questionLabel } from "@/lib/labels";
import { acceptChallenge, callOffChallenge, expireChallenge, settleChallenge } from "@/lib/social";
import { useMatches } from "@/lib/useMatches";

type M = {
  id: string;
  challenger: string;
  opponent: string | null;
  challengerSide: number;
  stake: string;
  status: number;
  winner: string | null;
  question: { kind: number; line: number; text: string; answer: number; closeTime: string; fixture: { id: string } | null };
};
const STATUS = ["Waiting for a taker", "On", "Called off", "Expired: stake returned", "Settled", "Void: stakes returned"];

export function ChallengeView({ id }: { id: number }) {
  const { status, address, send } = useAccount();
  const matches = useMatches();
  const [m, setM] = useState<M | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    query<{ Matchup_by_pk: M | null }>(
      `query C($id: String!) { Matchup_by_pk(id: $id) { id challenger opponent challengerSide stake status winner question { kind line text answer closeTime fixture { id } } } }`,
      { id: String(id) },
    ).then((d) => setM(d.Matchup_by_pk)).catch(() => {});
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  if (!m) return <p className="muted">Loading the challenge…</p>;
  const match = m.question.fixture ? matches.get(Number(m.question.fixture.id)) : undefined;
  const label = questionLabel(m.question, match);
  const me = address?.toLowerCase();
  const mine = m.challenger === me;
  const theirs = m.opponent === me;
  const closed = Number(m.question.closeTime) * 1000 <= Date.now();
  const challengerSays = m.challengerSide === 1 ? "it's happening" : "it's not happening";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <Badge tone={m.status === 1 ? "open" : m.status === 0 ? "amber" : "settled"}>{STATUS[m.status].toUpperCase()}</Badge>
        <Badge tone="chainlink">SETTLED BY CHAINLINK</Badge>
      </div>
      <section className="hero" style={{ marginTop: 10 }}>
        <div className="take-head">
          <Avatar seed={m.challenger} size={40} />
          <div>
            <div className="who">{mine ? "You" : fanName(m.challenger)}</div>
            <div className="when">says {challengerSays}</div>
          </div>
        </div>
        <h1 style={{ fontSize: 24 }}>{label}</h1>
        <p>{usd(m.stake)} each · winner takes {usd(Number(m.stake) * 2)}</p>
      </section>

      {m.status === 4 && m.winner && (
        <p className="reading" style={{ color: m.winner === me ? "var(--green-ink)" : "var(--ink)" }}>
          {m.winner === me ? "You won it. Bragging rights: secured." : `${fanName(m.winner)} won it.`}
        </p>
      )}
      {m.opponent && m.status !== 0 && (
        <div className="card take-head">
          <Avatar seed={m.opponent} />
          <div><div className="who">{theirs ? "You" : fanName(m.opponent)}</div><div className="when">took the other side</div></div>
        </div>
      )}

      {status !== "ready" ? (
        <SignIn reason={m.status === 0 && !closed ? "Sign in to take the other side." : "Sign in to see your challenges."} />
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {m.status === 0 && !mine && !closed && (
            <button className={`cta${m.challengerSide === 1 ? " fade" : ""}`} disabled={busy} onClick={() => run(() => acceptChallenge(send, address!, BigInt(m.id)))}>
              {busy ? "Taking it on…" : `Take the other side: ${m.challengerSide === 1 ? "not happening" : "happening"} · ${usd(m.stake)}`}
            </button>
          )}
          {m.status === 0 && mine && !closed && (
            <button className="cta ghost" disabled={busy} onClick={() => run(() => callOffChallenge(send, BigInt(m.id)))}>Call it off</button>
          )}
          {m.status === 0 && closed && (
            <button className="cta ghost" disabled={busy} onClick={() => run(() => expireChallenge(send, BigInt(m.id)))}>Nobody took it: return the stake</button>
          )}
          {m.status === 1 && m.question.answer > 0 && (
            <button className="cta" disabled={busy} onClick={() => run(() => settleChallenge(send, BigInt(m.id)))}>Settle and pay the winner</button>
          )}
          {m.status === 1 && m.question.answer === 0 && <p className="muted">It&apos;s on. Chainlink settles it when the result is in.</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

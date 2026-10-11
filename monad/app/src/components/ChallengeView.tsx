"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Avatar, Badge, Crest, Empty, SkeletonCards, countdown, money } from "./ui";
import { callLabel } from "./VersusCall";
import { FanLabel } from "./VersusForm";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { questionLabel } from "@/lib/labels";
import { acceptChallenge, callOffChallenge, expireChallenge, settleChallenge } from "@/lib/social";
import { balanceChanged } from "@/lib/useBalance";
import { useMatches } from "@/lib/useMatches";
import "@/styles/versus.css";

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

/** What a challenge link opens: the call, who said what, the pot, and one button to take it on. */
export function ChallengeView({ id }: { id: number }) {
  const { status, address, send } = useAccount();
  const matches = useMatches();
  const [m, setM] = useState<M | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    query<{ Matchup_by_pk: M | null }>(
      `query C($id: String!) { Matchup_by_pk(id: $id) { id challenger opponent challengerSide stake status winner question { kind line text answer closeTime fixture { id } } } }`,
      { id: String(id) },
    )
      .then((d) => setM(d.Matchup_by_pk))
      .catch(() => setM((x) => x ?? null));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  if (m === undefined) return <div className="pad" style={{ paddingTop: 16 }}><SkeletonCards n={1} odds={2} /></div>;
  if (m === null)
    return <Empty title="Challenge not found" action={<Link href="/challenges" className="btn-out">See matchups</Link>}>The link may be mistyped, or it&apos;s still on its way. Try again in a moment.</Empty>;

  const match = m.question.fixture ? matches.get(Number(m.question.fixture.id)) : undefined;
  const label = match && m.question.kind >= 1 && m.question.kind <= 5 ? callLabel(match, m.question.kind) : questionLabel(m.question, match);
  const me = address?.toLowerCase();
  const mine = m.challenger === me;
  const theirs = m.opponent === me;
  const closed = Number(m.question.closeTime) * 1000 <= Date.now();
  const forSomeoneElse = m.status === 0 && !!m.opponent && !theirs && !mine;
  const says = m.challengerSide === 1 ? "Yes" : "No";
  const otherSide = m.challengerSide === 1 ? "No" : "Yes";
  const pot = Number(m.stake) * 2;
  const state: [string, "open" | "flash" | "won" | "lost" | "settled"] =
    m.status === 0 ? (closed ? ["Unanswered", "settled"] : ["Waiting for a taker", "flash"])
      : m.status === 1 ? ["On", "open"]
      : m.status === 2 ? ["Called off", "settled"]
      : m.status === 3 ? ["Expired · stake returned", "settled"]
      : m.status === 4 ? (m.winner === me ? ["You won", "won"] : me && (mine || theirs) ? ["You lost", "lost"] : ["Settled", "settled"])
      : ["Void · stakes returned", "settled"];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      balanceChanged();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    const text = `"${label}": I say ${says}. ${money(m!.stake)} says you can't call it.`;
    if (navigator.share) await navigator.share({ title: "1v1 on Terrace", text, url: window.location.href }).catch(() => {});
    else {
      await navigator.clipboard.writeText(`${text} ${window.location.href}`).catch(() => {});
      setCopied(true);
    }
  }

  return (
    <div className="pad" style={{ paddingTop: 14 }}>
      <div className="card vs-card" style={{ borderColor: m.status === 0 && !closed ? "#1f3a2a" : undefined }}>
        <div className="row">
          <Avatar seed={m.challenger} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="umeta" style={{ marginTop: 0 }}>{mine ? "You challenged" : "Challenge from"}</div>
            <div className="uname"><FanLabel address={m.challenger} you={mine} /></div>
          </div>
          <Badge tone={state[1]} icon={m.status === 0 && !closed ? "hourglass" : undefined}>
            {m.status === 0 && !closed ? `${countdown(Number(m.question.closeTime))} left` : state[0]}
          </Badge>
        </div>

        {match && (
          <div className="row" style={{ justifyContent: "center", gap: 18, marginTop: 16 }}>
            <div style={{ textAlign: "center" }}><Crest logo={match.home.logo} name={match.home.name} lg /><div className="umeta" style={{ marginTop: 7, color: "var(--ink-2)" }}>{match.home.name}</div></div>
            <div className="cond" style={{ fontSize: 15, color: "var(--ink-4)" }}>V</div>
            <div style={{ textAlign: "center" }}><Crest logo={match.away.logo} name={match.away.name} lg /><div className="umeta" style={{ marginTop: 7, color: "var(--ink-2)" }}>{match.away.name}</div></div>
          </div>
        )}
        <div className="cond upper" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: 0.3, marginTop: 16 }}>{label}</div>

        <div className="oddsrow two" style={{ marginTop: 12 }}>
          <div className={`odd ${m.challengerSide === 1 ? "odd-yes" : "odd-no"}`}>
            <span className="lbl">{mine ? "You say" : "They say"}</span>
            <span className="val">{says}</span>
          </div>
          <div className={`odd ${m.challengerSide === 1 ? "odd-no" : "odd-yes"}`}>
            <span className="lbl">{m.opponent ? (theirs ? "You say" : "Their mate says") : "Your side"}</span>
            <span className="val">{otherSide}</span>
          </div>
        </div>

        <div className="kv" style={{ marginTop: 6 }}><span className="k">Stake each</span><span className="v">{money(m.stake)}</span></div>
        <div className="kv" style={{ paddingBottom: 0 }}><span className="k">Winner takes</span><span className="v cond green" style={{ fontSize: 22 }}>{money(pot)}</span></div>
      </div>

      {m.opponent && m.status !== 0 && (
        <div className="card row">
          <Avatar seed={m.opponent} />
          <div style={{ flex: 1 }}>
            <div className="uname"><FanLabel address={m.opponent} you={theirs} /></div>
            <div className="umeta">took the other side: {otherSide}</div>
          </div>
        </div>
      )}

      {m.status === 4 && m.winner && (
        <div className="card greenish" style={{ textAlign: "center" }}>
          <div className="cond upper" style={{ fontSize: 22 }}>{m.winner === me ? "You called it" : <><FanLabel address={m.winner} /> called it</>}</div>
          <div className="umeta">{money(pot)} paid out. Bragging rights: settled.</div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {status !== "ready" ? (
          m.status === 0 && !closed && !forSomeoneElse ? (
            <SignIn reason={`Take the other side (${otherSide}) for ${money(m.stake)}. Winner takes ${money(pot)}.`} />
          ) : (
            <SignIn reason="Sign in to see your matchups." />
          )
        ) : (
          <>
            {m.status === 0 && !mine && !closed && !forSomeoneElse && (
              <div className="row" style={{ gap: 8 }}>
                <button className="cta" disabled={busy} onClick={() => run(() => acceptChallenge(send, address!, BigInt(m.id)))}>
                  {busy ? "Taking it on…" : `Accept · ${otherSide} · ${money(m.stake)}`}
                </button>
                {theirs && (
                  <button className="cta cta-ghost" style={{ width: "40%" }} disabled={busy} onClick={() => run(() => callOffChallenge(send, BigInt(m.id)))}>Decline</button>
                )}
              </div>
            )}
            {forSomeoneElse && <p className="umeta" style={{ textAlign: "center" }}>This one was sent to someone else.</p>}
            {m.status === 0 && mine && !closed && (
              <div className="row" style={{ gap: 8 }}>
                <button className="cta" onClick={share}><Icon name="share" size={16} /> {copied ? "Link copied" : "Send the link again"}</button>
                <button className="cta cta-ghost" style={{ width: "45%" }} disabled={busy} onClick={() => run(() => callOffChallenge(send, BigInt(m.id)))}>Call it off</button>
              </div>
            )}
            {m.status === 0 && closed && (
              <button className="cta cta-ghost" disabled={busy} onClick={() => run(() => expireChallenge(send, BigInt(m.id)))}>
                {busy ? "…" : "Nobody took it: return the stake"}
              </button>
            )}
            {m.status === 1 && m.question.answer > 0 && (
              <button className="cta" disabled={busy} onClick={() => run(() => settleChallenge(send, BigInt(m.id)))}>
                {busy ? "Settling…" : "Settle and pay the winner"}
              </button>
            )}
            {m.status === 1 && m.question.answer === 0 && (
              <p className="umeta" style={{ textAlign: "center", fontSize: 13 }}>It&apos;s on. Settled automatically from the final score.</p>
            )}
          </>
        )}
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 6, marginTop: 14 }}>
        <Badge tone="terrace">1v1</Badge>
        <Badge tone="chainlink">Settled by Chainlink</Badge>
      </div>
      <Link href="/challenges" className="cta cta-ghost cta-sm" style={{ marginTop: 14 }}><Icon name="swords" size={16} /> Challenge a mate</Link>
    </div>
  );
}

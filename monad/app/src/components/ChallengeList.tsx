"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Avatar, Badge, Empty, FixtureTag, Seg, SkeletonCards, countdown, money } from "./ui";
import { CallPicker, callLabel, guidePrices, type Call } from "./VersusCall";
import { ChallengeForm, FanLabel, SentSheet, type Sent } from "./VersusForm";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { questionLabel } from "@/lib/labels";
import { acceptChallenge, callOffChallenge, expireChallenge, KIND, settleChallenge, standardQuestion } from "@/lib/social";
import { balanceChanged } from "@/lib/useBalance";
import { useMatches } from "@/lib/useMatches";
import { useOpeningLines } from "@/lib/useOdds";
import "@/styles/versus.css";
import { showError } from "@/lib/errors";

export type MatchupRow = {
  id: string;
  challenger: string;
  opponent: string | null;
  challengerSide: number;
  stake: string;
  status: number; // 0 pending, 1 accepted, 2 declined, 3 expired, 4 settled, 5 refunded
  winner: string | null;
  question: { kind: number; line: number; text: string; answer: number; closeTime: string; fixture: { id: string } | null };
};
const FIELDS = "id challenger opponent challengerSide stake status winner question { kind line text answer closeTime fixture { id } }";

type Tab = "new" | "active" | "inbox";

/** 1v1 matchups: settle the group-chat argument. New / Active / Inbox, as in the handoff. */
export function ChallengeList() {
  const { status, address, send } = useAccount();
  const matches = useMatches();
  const lines = useOpeningLines();
  const [tab, setTab] = useState<Tab>("new");
  const [mine, setMine] = useState<MatchupRow[] | null>(null);
  const [open, setOpen] = useState<MatchupRow[]>([]);
  const [call, setCall] = useState<Call | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = address?.toLowerCase() ?? "";

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "active" || t === "inbox" || t === "new") setTab(t);
  }, []);

  const load = useCallback(() => {
    query<{ mine: MatchupRow[]; open: MatchupRow[] }>(
      `query L($me: String!) {
        mine: Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }) { ${FIELDS} }
        open: Matchup(where: { status: { _eq: 0 }, opponent: { _is_null: true }, challenger: { _neq: $me } }, order_by: { createdAt: desc }, limit: 20) { ${FIELDS} }
      }`,
      { me },
    )
      .then((d) => {
        setMine(d.mine);
        setOpen(d.open);
      })
      .catch(() => setMine([]));
  }, [me]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const now = Date.now() / 1000;
  const closed = (r: MatchupRow) => Number(r.question.closeTime) <= now;
  const { active, inbox } = useMemo(() => {
    const rows = mine ?? [];
    const toMe = rows.filter((r) => r.status === 0 && r.opponent === me && r.challenger !== me && !closed(r));
    const toSettle = rows.filter((r) => r.status === 1 && r.question.answer > 0);
    const toExpire = rows.filter((r) => r.status === 0 && r.challenger === me && closed(r));
    const takeable = open.filter((r) => !closed(r));
    return {
      active: rows.filter((r) => !toMe.includes(r)),
      inbox: [...toMe, ...takeable, ...toSettle, ...toExpire],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, open, me]);
  const live = active.filter((r) => r.status <= 1).length;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      balanceChanged();
      load();
    } catch (e) {
      setError(showError(e));
    } finally {
      setBusy(null);
    }
  }

  const label = (r: MatchupRow) => {
    const m = r.question.fixture ? matches.get(Number(r.question.fixture.id)) : undefined;
    if (m && r.question.kind >= 1 && r.question.kind <= 5) return callLabel(m, r.question.kind);
    return questionLabel(r.question, m);
  };
  const callMatch = call ? matches.get(call.fixtureId) : undefined;

  const card = (r: MatchupRow) => {
    const iChallenged = r.challenger === me;
    const other = iChallenged ? r.opponent : r.challenger;
    const mySide = iChallenged ? r.challengerSide : 3 - r.challengerSide;
    const incoming = r.status === 0 && !iChallenged;
    const settleable = r.status === 1 && r.question.answer > 0;
    const expirable = r.status === 0 && iChallenged && closed(r);
    const dir = incoming ? "Challenge from" : iChallenged ? "You challenged" : "You accepted";
    const state: [string, Parameters<typeof Badge>[0]["tone"]] =
      r.status === 4 ? (r.winner === me ? ["Won", "won"] : ["Lost", "lost"])
        : r.status === 1 ? ["Active", "open"]
        : r.status === 0 ? (incoming ? [`${countdown(Number(r.question.closeTime), now)} left`, "flash"] : closed(r) ? ["Unanswered", "settled"] : ["Waiting", "flash"])
        : r.status === 2 ? ["Called off", "settled"]
        : r.status === 3 ? ["Expired", "settled"]
        : ["Void", "settled"];
    const theirSide = r.challengerSide === 1 ? "Yes" : "No";
    const youSide = mySide === 1 ? "Yes" : "No";

    return (
      <div key={r.id} className={`card vs-card${incoming ? " incoming" : ""}`}>
        <Link href={`/c/${r.id}`} className="row" style={{ color: "var(--ink)" }}>
          {other ? <Avatar seed={other} /> : <span className="avatar" style={{ background: "var(--raised)", color: "var(--ink-3)", border: "1px solid var(--line)" }}><Icon name="share" size={18} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="umeta" style={{ marginTop: 0 }}>{dir}</div>
            <div className="uname">{other ? <FanLabel address={other} /> : "Anyone with the link"}</div>
          </div>
          <Badge tone={state[1]} icon={incoming ? "hourglass" : undefined}>{state[0]}</Badge>
        </Link>
        {(() => {
          const m = r.question.fixture ? matches.get(Number(r.question.fixture.id)) : undefined;
          return m ? <div className="umeta" style={{ marginTop: 12 }}><FixtureTag m={m} crests /></div> : null;
        })()}
        <Link href={`/c/${r.id}`} className="vs-q" style={{ display: "block" }}>{label(r)}</Link>
        <div className="vs-tags">
          {incoming ? (
            <>
              <span className={`badge ${r.challengerSide === 1 ? "b-terrace" : "b-lost"}`}>They say: {theirSide}</span>
              <span className={`badge ${mySide === 1 ? "b-terrace" : "b-lost"}`}>You&apos;d take: {youSide}</span>
            </>
          ) : (
            <span className={`badge ${mySide === 1 ? "b-terrace" : "b-lost"}`}>You: {youSide}</span>
          )}
          <span className="badge b-settled">{money(r.stake)} each</span>
          <span className={`vs-pot${r.status === 4 && r.winner !== me ? " dim" : ""}`}>{money(Number(r.stake) * 2)}</span>
        </div>
        {incoming && (
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {status === "ready" ? (
              <button className="cta cta-sm" disabled={!!busy} onClick={() => run(`a${r.id}`, () => acceptChallenge(send, address!, BigInt(r.id)))}>
                {busy === `a${r.id}` ? "Taking it on…" : `Accept · ${money(r.stake)}`}
              </button>
            ) : (
              <Link href={`/c/${r.id}`} className="cta cta-sm">Accept · {money(r.stake)}</Link>
            )}
            {r.opponent === me && (
              <button className="cta cta-ghost cta-sm" disabled={!!busy} onClick={() => run(`d${r.id}`, () => callOffChallenge(send, BigInt(r.id)))}>
                {busy === `d${r.id}` ? "…" : "Decline"}
              </button>
            )}
          </div>
        )}
        {settleable && status === "ready" && (
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => run(`s${r.id}`, () => settleChallenge(send, BigInt(r.id)))}>
            {busy === `s${r.id}` ? "Settling…" : "Settle matchup"}
          </button>
        )}
        {expirable && status === "ready" && (
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => run(`e${r.id}`, () => expireChallenge(send, BigInt(r.id)))}>
            {busy === `e${r.id}` ? "…" : "Nobody took it: return my stake"}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="pad" style={{ padding: "12px var(--gutter) 10px" }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { id: "new", label: "New", icon: "swords" },
            { id: "active", label: <>Active {live > 0 && <span className="ct">{live}</span>}</> },
            { id: "inbox", label: <>Inbox {inbox.length > 0 && <span className="ct">{inbox.length}</span>}</> },
          ]}
        />
      </div>
      <div className="pad" style={{ paddingTop: 4 }}>
        {error && <p className="error" style={{ marginBottom: 10 }}>{error}</p>}

        {tab === "new" && (
          <ChallengeForm
            label={callMatch && call ? callLabel(callMatch, call.kind) : ""}
            call={<CallPicker matches={matches} value={call} onChange={setCall} />}
            prices={call ? guidePrices(lines[call.fixtureId], call.kind) : null}
            getQuestionId={call ? () => standardQuestion(send, call.fixtureId, call.kind, call.kind === KIND.OVER ? 2 : 0) : null}
            onSent={(s) => {
              setSent(s);
              load();
            }}
          />
        )}

        {tab === "active" &&
          (status !== "ready" ? (
            <SignIn reason="Sign in to see your matchups." />
          ) : mine === null ? (
            <SkeletonCards n={3} odds={2} />
          ) : active.length ? (
            active.map(card)
          ) : (
            <Empty title="No matchups yet" action={<button className="btn-out" onClick={() => setTab("new")}><Icon name="swords" size={14} /> Challenge a mate</button>}>
              Pick a match, take a side, send the link to the group chat.
            </Empty>
          ))}

        {tab === "inbox" &&
          (mine === null ? (
            <SkeletonCards n={2} odds={2} />
          ) : inbox.length ? (
            inbox.map(card)
          ) : (
            <Empty title="Inbox clear">Challenges sent to you, open ones you can take, and matchups ready to settle land here.</Empty>
          ))}
        <div style={{ height: 18 }} />
      </div>
      {sent && <SentSheet sent={sent} onClose={() => { setSent(null); setTab("active"); }} />}
    </>
  );
}

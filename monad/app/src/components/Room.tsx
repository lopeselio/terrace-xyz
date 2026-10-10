"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { SignIn } from "./SignIn";
import { TakeSheet } from "./TakeSheet";
import { Avatar, Badge, ago, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query, ROOM_QUERY, type RoomMessage } from "@/lib/indexer";
import { backTake, bet, collect, postMessage } from "@/lib/play";

const OUTCOME = ["", "CAME IN", "DIDN'T HAPPEN", "VOID · REFUNDED"] as const;
const STAKES = [1, 5, 10];

/** A chat room: one per match (anyone) or per league (members). Takes in match rooms can become markets. */
export function Room({ kind, roomId, fixtureId, canPost = true }: { kind: 0 | 1; roomId: number; fixtureId?: number; canPost?: boolean }) {
  const { status, address, send } = useAccount();
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [stake, setStake] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [listing, setListing] = useState<RoomMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await query<{ Message: RoomMessage[] }>(ROOM_QUERY, { room: `${kind === 0 ? "match" : "league"}-${roomId}` });
      setMessages(d.Message);
      setOffline(false);
    } catch {
      setOffline(true);
      setMessages((m) => m ?? []);
    }
  }, [kind, roomId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function postTake() {
    const text = draft.trim();
    if (!text) return;
    await run("post", async () => {
      await postMessage(send, kind, BigInt(roomId), text);
      setDraft("");
    });
  }

  const me = address?.toLowerCase();
  const markets = (messages ?? []).filter((m) => m.market);

  return (
    <section>
      {offline && <p className="muted">The live feed is catching up. Your takes still save.</p>}
      {kind === 0 && markets.length > 1 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {STAKES.map((d) => (
            <button key={d} className={`chip${stake === d ? " on" : ""}`} onClick={() => setStake(d)}>Stake ${d}</button>
          ))}
        </div>
      )}
      <ul className="chat">
        {(messages ?? []).map((m) => {
          const mine = m.author === me;
          const mk = m.market;
          const yes = mk ? Number(mk.yesPool) : 0;
          const no = mk ? Number(mk.noPool) : 0;
          const total = yes + no;
          const yesPct = total ? Math.round((yes / total) * 100) : 50;
          const answer = mk?.question.answer ?? 0;
          const open = mk && answer === 0 && Number(mk.question.closeTime) * 1000 > Date.now();
          return (
            <li key={m.id} id={`take-${m.id}`} className={`take${mk ? " listed" : ""}`}>
              <div className="take-head">
                <Avatar seed={m.author} />
                <div>
                  <div className="who">{mine ? "You" : fanName(m.author)}</div>
                  <div className="when">{ago(m.postedAt)}</div>
                </div>
                <div className="badges">
                  {mk && answer === 0 && <Badge tone={open ? "open" : "amber"}>{open ? "MARKET" : "SETTLING"}</Badge>}
                  {answer > 0 && <Badge tone={answer === 1 ? "won" : answer === 2 ? "lost" : "settled"}>{OUTCOME[answer]}</Badge>}
                </div>
              </div>
              <p className="take-text">{m.text}</p>
              <p className="take-meta">
                {m.backers} backing{mk ? ` · ${mk.bettors} in · ${usd(total)} on it` : ""}
              </p>

              {mk && (
                <>
                  <div className="pool" aria-label={`${yesPct}% backing`}>
                    <span className="yes-part" style={{ width: `${yesPct}%` }} />
                    <span className="no-part" style={{ width: `${100 - yesPct}%` }} />
                  </div>
                  <div className="pool-labels">
                    <span className="y">{yesPct}% BACK · {usd(yes)}</span>
                    <span className="n">{usd(no)} · {100 - yesPct}% FADE</span>
                  </div>
                </>
              )}

              {status === "ready" && address && (
                <>
                  {mk && open && (
                    <div className="odds-row">
                      <button className="odds yes" disabled={!!busy} onClick={() => run(`y${m.id}`, () => bet(send, address, BigInt(mk.id), mk.token as Address, 1, stake))}>
                        <span className="lbl">Back it</span>
                        <span className="val">{busy === `y${m.id}` ? "…" : `$${stake}`}</span>
                      </button>
                      <button className="odds no" disabled={!!busy} onClick={() => run(`n${m.id}`, () => bet(send, address, BigInt(mk.id), mk.token as Address, 2, stake))}>
                        <span className="lbl">Fade it</span>
                        <span className="val">{busy === `n${m.id}` ? "…" : `$${stake}`}</span>
                      </button>
                    </div>
                  )}
                  <div className="actions">
                    {!mine && !mk && (
                      <button className="cta small ghost" disabled={!!busy} onClick={() => run(`b${m.id}`, () => backTake(send, BigInt(m.id)))}>Back this take</button>
                    )}
                    {mine && !mk && fixtureId !== undefined && listing?.id !== m.id && (
                      <button className="cta small" onClick={() => setListing(m)}>Make it a market</button>
                    )}
                    {mk && answer > 0 && (
                      <button className="cta small" disabled={!!busy} onClick={() => run(`c${m.id}`, () => collect(send, BigInt(mk.id), address))}>Collect</button>
                    )}
                  </div>
                </>
              )}
              {listing?.id === m.id && fixtureId !== undefined && (
                <TakeSheet messageId={m.id} fixtureId={fixtureId} text={m.text} onDone={() => { setListing(null); load(); }} />
              )}
            </li>
          );
        })}
        {messages?.length === 0 && <li className="muted">Quiet so far. Say something worth backing.</li>}
      </ul>
      {error && <p className="error">{error}</p>}
      {status === "ready" && !canPost ? (
        <p className="muted">Join the league to talk here.</p>
      ) : status === "ready" ? (
        <form id="compose" className="composer" onSubmit={(e) => { e.preventDefault(); postTake(); }}>
          <input value={draft} maxLength={200} placeholder="Your take… e.g. Haaland scores before the hour" onChange={(e) => setDraft(e.target.value)} />
          <button className="cta small" disabled={busy === "post" || !draft.trim()}>{busy === "post" ? "…" : "Post"}</button>
        </form>
      ) : (
        <SignIn reason={kind === 0 ? "Join the match chat and back your takes." : "Sign in to join the league chat."} />
      )}
    </section>
  );
}

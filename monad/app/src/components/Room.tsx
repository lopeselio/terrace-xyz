"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { SignIn } from "./SignIn";
import { TakeSheet } from "./TakeSheet";
import { useAccount } from "@/lib/account";
import { query, ROOM_QUERY, type RoomMessage } from "@/lib/indexer";
import { backTake, bet, collect, postMessage } from "@/lib/play";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (v: string | number) => `$${(Number(v) / 1e6).toFixed(Number(v) % 1e6 ? 2 : 0)}`;
const ANSWERS = ["", "Came in", "Didn't happen", "Void: stakes back"];

/** A chat room: one per match (anyone) or per league (members). Takes in match rooms can become markets. */
export function Room({ kind, roomId, fixtureId, canPost = true }: { kind: 0 | 1; roomId: number; fixtureId?: number; canPost?: boolean }) {
  const { status, address, send } = useAccount();
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [draft, setDraft] = useState("");
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

  return (
    <section>
      {offline && <p className="muted">The live feed is catching up. Your takes still save.</p>}
      <ul className="chat">
        {(messages ?? []).map((m) => {
          const mine = address && m.author === address.toLowerCase();
          const mk = m.market;
          const total = mk ? Number(mk.yesPool) + Number(mk.noPool) : 0;
          const yesShare = total ? (Number(mk!.yesPool) / total) * 100 : 50;
          const open = mk && mk.question.answer === 0 && Number(mk.question.closeTime) * 1000 > Date.now();
          return (
            <li key={m.id} id={`take-${m.id}`} className={`take${mk ? " listed" : ""}`}>
              <p className="take-text">{m.text}</p>
              <p className="take-meta">
                {mine ? "You" : short(m.author)} · {m.backers} backing
                {mk ? ` · ${mk.bettors} in · ${usd(total)} on it` : ""}
                {mk && mk.question.answer > 0 ? ` · ${ANSWERS[mk.question.answer]}` : ""}
              </p>
              {mk && (
                <div className="pool" aria-label={`${Math.round(yesShare)}% backing`}>
                  <span className="yes-part" style={{ width: `${yesShare}%` }} />
                  <span className="no-part" style={{ width: `${100 - yesShare}%` }} />
                </div>
              )}
              {status === "ready" && address && (
                <div className="actions">
                  {!mine && !mk && (
                    <button className="btn small" disabled={!!busy} onClick={() => run(`back-${m.id}`, () => backTake(send, BigInt(m.id)))}>Back it</button>
                  )}
                  {mine && !mk && fixtureId !== undefined && (
                    <button className="btn small" onClick={() => setListing(m)}>Make it a market</button>
                  )}
                  {mk && open && (
                    <>
                      <button className="btn small yes" disabled={!!busy} onClick={() => run(`yes-${m.id}`, () => bet(send, address, BigInt(mk.id), mk.token as Address, 1, 5))}>Back it $5</button>
                      <button className="btn small no" disabled={!!busy} onClick={() => run(`no-${m.id}`, () => bet(send, address, BigInt(mk.id), mk.token as Address, 2, 5))}>Fade it $5</button>
                    </>
                  )}
                  {mk && mk.question.answer > 0 && (
                    <button className="btn small" disabled={!!busy} onClick={() => run(`collect-${m.id}`, () => collect(send, BigInt(mk.id), address))}>Collect</button>
                  )}
                </div>
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
        <form className="composer" onSubmit={(e) => { e.preventDefault(); postTake(); }}>
          <input value={draft} maxLength={200} placeholder="Your take… e.g. Haaland scores before the hour" onChange={(e) => setDraft(e.target.value)} />
          <button className="btn small" disabled={busy === "post" || !draft.trim()}>{busy === "post" ? "…" : "Post"}</button>
        </form>
      ) : (
        <SignIn reason={kind === 0 ? "Join the match chat and back your takes." : "Sign in to join the league chat."} />
      )}
    </section>
  );
}

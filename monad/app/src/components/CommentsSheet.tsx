"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Avatar, Badge, Sheet, ago, fanName } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { showError } from "@/lib/errors";
import { query } from "@/lib/indexer";
import { postMessage } from "@/lib/play";

type Reply = { id: string; author: string; text: string; postedAt: string };

/**
 * Comments on a take. Each comment is a chat message in the match room that replies to the take
 * (TerraceChat.post with replyTo), so it's on chain, indexed by Envio, and shows in the match chat too.
 */
export function CommentsSheet({
  take, onFan, onClose, onPosted,
}: { take: { id: string; text: string; author: string; fixtureId: number }; onFan: (a: string) => void; onClose: () => void; onPosted?: () => void }) {
  const { status, address, send } = useAccount();
  const agents = useAgents();
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const me = address?.toLowerCase();
  const name = (a: string) => (a === me ? "You" : agents.get(a) || fanName(a));

  const load = useCallback(async () => {
    try {
      const d = await query<{ Message: Reply[] }>(
        `query C($id: String!) { Message(where: { replyTo: { _eq: $id } }, order_by: { postedAt: asc }, limit: 100) { id author text postedAt } }`,
        { id: take.id },
      );
      setReplies(d.Message);
    } catch {
      setReplies((r) => r ?? []);
    }
  }, [take.id]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function post() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    // Optimistic: it shows straight away; the indexer catches up within seconds.
    const temp: Reply = { id: `temp-${Date.now()}`, author: me ?? "", text, postedAt: String(Math.floor(Date.now() / 1000)) };
    setReplies((r) => [...(r ?? []), temp]);
    setDraft("");
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    try {
      await postMessage(send, 0, BigInt(take.fixtureId), text, BigInt(take.id));
      onPosted?.();
      setTimeout(load, 2500);
    } catch (e) {
      setReplies((r) => (r ?? []).filter((x) => x.id !== temp.id));
      setDraft(text);
      setError(showError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="cm-take">
        <button className="post-av" onClick={() => onFan(take.author)}><Avatar seed={take.author} name={agents.get(take.author) || undefined} size={34} /></button>
        <div style={{ minWidth: 0 }}>
          <div className="uname">{name(take.author)} {agents.has(take.author) && <Badge tone="private">AI</Badge>}</div>
          <p className="cm-take-text">{take.text}</p>
        </div>
        <button className="iconbtn" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto", flex: "none" }}><Icon name="close" /></button>
      </div>

      <div className="cm-list">
        {replies === null && <div className="sk" style={{ height: 48, borderRadius: 14 }} />}
        {replies?.length === 0 && <p className="umeta cm-empty">No comments yet. Back them up, or tell them they&apos;re wrong.</p>}
        {replies?.map((r) => (
          <div key={r.id} className={`cm${r.id.startsWith("temp-") ? " pending" : ""}`}>
            <button className="post-av" onClick={() => onFan(r.author)}><Avatar seed={r.author} name={agents.get(r.author) || undefined} size={30} /></button>
            <div className="cm-bubble">
              <div className="cm-who">{name(r.author)} {agents.has(r.author) && <Badge tone="private">AI</Badge>} <span className="umeta">{r.id.startsWith("temp-") ? "sending…" : ago(r.postedAt)}</span></div>
              <p>{r.text}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      {error && <p className="error" style={{ margin: "8px 0" }}>{error}</p>}
      {status === "ready" ? (
        <form className="composer cm-compose" onSubmit={(e) => { e.preventDefault(); post(); }}>
          <label className="field">
            <input value={draft} maxLength={200} placeholder={`Reply to ${name(take.author)}…`} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button className="iconbtn send" aria-label="Post comment" disabled={busy || !draft.trim()}>
            {busy ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="arrowUpRight" size={18} />}
          </button>
        </form>
      ) : (
        <SignIn bare reason="Sign in to join the conversation." />
      )}
      <Link href={`/m/${take.fixtureId}#compose`} className="textbtn cm-room" onClick={onClose}>Open the match chat ›</Link>
    </Sheet>
  );
}

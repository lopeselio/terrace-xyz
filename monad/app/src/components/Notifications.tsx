"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FollowButton } from "./FollowButton";
import { Icon } from "./Icon";
import { Avatar, Badge, Sheet, SheetHead, ago } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { query } from "@/lib/indexer";
import { BET_FIELDS, DUEL_FIELDS, buildNotes, type BetN, type DuelN, type FollowN, type Note, type PointN } from "@/lib/notes";
import { useMatches } from "@/lib/useMatches";
import { PushPrompt } from "./PushSettings";

/*
 * The bell: what happened to you. Challenges a mate sent you (with Accept), your 1v1s being taken on
 * and settled, your bets' results, and activity on your takes. Unread items light the bell's dot.
 * The same notes go out as push notifications (lib/notes.ts, /api/push/run).
 */

export type { Note };

export function useNotifications() {
  const { status, address } = useAccount();
  const matches = useMatches();
  const agents = useAgents();
  const [notes, setNotes] = useState<Note[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const key = address ? `terrace.notes.seen.${address.toLowerCase()}` : null;

  useEffect(() => {
    if (!key) return;
    try {
      setSeenAt(Number(localStorage.getItem(key) ?? 0));
    } catch {}
  }, [key]);

  const load = useCallback(async () => {
    if (!address) return;
    const me = address.toLowerCase();
    try {
      const d = await query<{ Matchup: DuelN[]; Bet: BetN[] }>(
        `query N($me: String!) {
          Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }, limit: 30) { ${DUEL_FIELDS} }
          Bet(where: { bettor: { _eq: $me } }) { ${BET_FIELDS} }
        }`,
        { me },
      );
      // Points lines are a separate, optional query (older indexer deployments don't have them).
      const p = await query<{ PointsEvent: PointN[] }>(
        `query P($me: String!) { PointsEvent(where: { player: { _eq: $me } }, order_by: { timestamp: desc }, limit: 30) { id reason amount timestamp } }`,
        { me },
      ).catch(() => ({ PointsEvent: [] as PointN[] }));
      // New followers (only once the follow graph is indexed).
      const fl = await query<{ Follow: FollowN[] }>(
        `query W($me: String!) { Follow(where: { followee: { _eq: $me }, active: { _eq: true } }, order_by: { since: desc }, limit: 20) { follower since } }`,
        { me },
      ).catch(() => ({ Follow: [] as FollowN[] }));

      const out = buildNotes(me, { duels: d.Matchup, bets: d.Bet, follows: fl.Follow, points: p.PointsEvent }, { agents, match: (id) => matches.get(id) });
      setNotes(out.slice(0, 40));
    } catch {}
  }, [address, agents, matches]);

  useEffect(() => {
    if (status !== "ready") return setNotes([]);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 25_000);
    window.addEventListener("terrace-balance", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("terrace-balance", load);
    };
  }, [status, load]);

  // New since you last looked, plus challenges still waiting on your answer.
  const unread = notes.filter((n) => n.at > seenAt || n.action === "Accept").length;
  const markSeen = () => {
    const t = Math.floor(Date.now() / 1000);
    setSeenAt(t);
    try {
      if (key) localStorage.setItem(key, String(t));
    } catch {}
  };
  return { notes, unread, markSeen, seenAt };
}

const TONE: Record<Note["tone"], string> = {
  green: "var(--green)", red: "var(--red-ink)", amber: "var(--amber-ink)", violet: "var(--violet-ink)", neutral: "var(--ink-2)",
};

export function NotificationsSheet({ notes, seenAt, onClose }: { notes: Note[]; seenAt: number; onClose: () => void }) {
  const waiting = notes.filter((n) => n.action === "Accept");
  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow="What's happened" title="Notifications" onClose={onClose} />
      <PushPrompt />
      {notes.length === 0 && (
        <div className="empty" style={{ padding: "30px 10px" }}>
          <h4>All quiet</h4>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Challenges from mates, your results and activity on your takes land here.</div>
          <Link href="/challenges" className="textbtn" style={{ display: "inline-block", marginTop: 12 }} onClick={onClose}>Challenge a mate ›</Link>
        </div>
      )}
      {waiting.length > 0 && <div className="flabel" style={{ marginTop: 16 }}>Waiting for you</div>}
      <div className="rowlist" style={{ marginTop: waiting.length ? 0 : 12 }}>
        {[...waiting, ...notes.filter((n) => n.action !== "Accept")].map((n) => n.followBack ? (
          <div key={n.id} className={`note${n.at > seenAt ? " unread" : ""}`}>
            <Avatar seed={n.followBack} size={38} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="uname" style={{ display: "block", color: TONE[n.tone] }}>{n.title}</span>
              <span className="umeta" style={{ display: "block", opacity: 0.8 }}>{ago(n.at)}</span>
            </span>
            <FollowButton who={n.followBack} />
          </div>
        ) : (
          <Link key={n.id} href={n.href} className={`note${n.at > seenAt ? " unread" : ""}`} onClick={onClose}>
            {n.who ? (
              <Avatar seed={n.who} size={38} />
            ) : (
              <span className="note-icon" style={{ color: TONE[n.tone], borderColor: TONE[n.tone] }}><Icon name={n.icon} size={18} /></span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="uname" style={{ display: "block", color: n.tone === "neutral" ? undefined : TONE[n.tone] }}>{n.title}</span>
              {n.sub && <span className="umeta" style={{ display: "block" }}>{n.sub}</span>}
              <span className="umeta" style={{ display: "block", opacity: 0.8 }}>{ago(n.at)}</span>
            </span>
            {n.action ? <Badge tone={n.action === "Accept" ? "open" : "won"}>{n.action}</Badge> : <Icon name="chevronRight" size={16} />}
          </Link>
        ))}
      </div>
    </Sheet>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Avatar, Badge, Sheet, SheetHead, ago, fanName, money } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { query } from "@/lib/indexer";
import { questionLabel, type QuestionLike } from "@/lib/labels";
import { betOutcome } from "@/lib/outcome";
import { points, reasonLabel } from "@/lib/terracePoints";
import { useMatches } from "@/lib/useMatches";

/*
 * The bell: what happened to you. Challenges a mate sent you (with Accept), your 1v1s being taken on
 * and settled, your bets' results, and activity on your takes. Unread items light the bell's dot.
 */

type Q = QuestionLike & { answer?: number };
type Duel = { id: string; challenger: string; opponent: string | null; stake: string; status: number; winner: string | null; createdAt: string; question: Q };
type BetN = {
  id: string; side: number; stake: string; result: number | null; payout: string | null;
  market: { id: string; feeBps: number; yesPool: string; noPool: string; take: { room_id: string } | null; question: Q & { answer: number; closeTime: string } };
};
type PointN = { id: string; reason: string; amount: string; timestamp: string };

export type Note = {
  id: string;
  at: number;
  icon: IconName;
  tone: "green" | "red" | "amber" | "violet" | "neutral";
  who?: string;
  title: string;
  sub?: string;
  href: string;
  action?: string;
};

const SOCIAL_REASONS = new Set(["TAKE_BACKED", "BET_ON_YOUR_TAKE", "CHALLENGE_TAKEN", "LEAGUE_MEMBER", "INVITE", "STREAK_3", "STREAK_7"]);

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
      const d = await query<{ Matchup: Duel[]; Bet: BetN[] }>(
        `query N($me: String!) {
          Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }, limit: 30) {
            id challenger opponent stake status winner createdAt question { kind line text answer fixture { id } }
          }
          Bet(where: { bettor: { _eq: $me } }) {
            id side stake result payout
            market { id feeBps yesPool noPool take { room_id } question { kind line text answer closeTime fixture { id } } }
          }
        }`,
        { me },
      );
      // Points lines are a separate, optional query (older indexer deployments don't have them).
      const p = await query<{ PointsEvent: PointN[] }>(
        `query P($me: String!) { PointsEvent(where: { player: { _eq: $me } }, order_by: { timestamp: desc }, limit: 30) { id reason amount timestamp } }`,
        { me },
      ).catch(() => ({ PointsEvent: [] as PointN[] }));

      const name = (a: string) => agents.get(a) || fanName(a);
      const label = (q: Q) => questionLabel(q, q.fixture ? matches.get(Number(q.fixture.id)) : undefined) || "a match result";
      const out: Note[] = [];

      for (const m of d.Matchup) {
        const mine = m.challenger === me;
        const other = mine ? m.opponent : m.challenger;
        const at = Number(m.createdAt);
        if (!mine && m.status === 0) {
          out.push({ id: `c${m.id}`, at, icon: "swords", tone: "green", who: m.challenger, title: `${name(m.challenger)} challenged you`, sub: `${label(m.question)} · ${money(m.stake)} each`, href: `/c/${m.id}`, action: "Accept" });
        } else if (mine && m.status === 1 && other) {
          out.push({ id: `a${m.id}`, at, icon: "swords", tone: "amber", who: other, title: `${name(other)} took on your 1v1`, sub: `${label(m.question)} · winner takes ${money(Number(m.stake) * 2)}`, href: `/c/${m.id}` });
        } else if (m.status === 4) {
          const won = m.winner === me;
          out.push({ id: `s${m.id}`, at, icon: won ? "trophy" : "close", tone: won ? "green" : "red", who: other ?? undefined, title: won ? `You won your 1v1 with ${other ? name(other) : "a mate"}` : `${other ? name(other) : "Your mate"} won your 1v1`, sub: `${label(m.question)} · ${won ? "+" : "−"}${money(won ? Number(m.stake) * 2 : m.stake)}`, href: `/c/${m.id}` });
        } else if (mine && m.status === 2 && other) {
          out.push({ id: `d${m.id}`, at, icon: "swords", tone: "neutral", who: other, title: `${name(other)} turned down your 1v1`, sub: `${label(m.question)} · your stake is back`, href: `/c/${m.id}` });
        }
      }

      for (const b of d.Bet) {
        const r = betOutcome(b);
        if (r.outcome === "open") continue;
        const fixture = b.market.question.fixture?.id ?? b.market.take?.room_id.split("-")[1];
        out.push({
          id: `b${b.id}`,
          at: Number(b.market.question.closeTime),
          icon: r.outcome === "won" ? "trophy" : r.outcome === "lost" ? "close" : "refresh",
          tone: r.outcome === "won" ? "green" : r.outcome === "lost" ? "red" : "neutral",
          title: r.outcome === "won" ? `You won ${money(r.amount)}` : r.outcome === "lost" ? `Your bet didn't come in · −${money(r.amount)}` : `Stake back · ${money(r.amount)}`,
          sub: label(b.market.question),
          href: r.collected ? (fixture ? `/m/${fixture}` : "/me") : "/me",
          action: !r.collected && r.outcome !== "lost" ? "Collect" : undefined,
        });
      }

      for (const e of p.PointsEvent) {
        if (!SOCIAL_REASONS.has(e.reason)) continue;
        out.push({ id: `p${e.id}`, at: Number(e.timestamp), icon: "bolt", tone: "amber", title: reasonLabel(e.reason), sub: `+${points(e.amount)} Terrace Points`, href: "/me" });
      }

      setNotes(out.sort((a, b) => b.at - a.at).slice(0, 40));
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
      {notes.length === 0 && (
        <div className="empty" style={{ padding: "30px 10px" }}>
          <h4>All quiet</h4>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Challenges from mates, your results and activity on your takes land here.</div>
          <Link href="/challenges" className="textbtn" style={{ display: "inline-block", marginTop: 12 }} onClick={onClose}>Challenge a mate ›</Link>
        </div>
      )}
      {waiting.length > 0 && <div className="flabel" style={{ marginTop: 16 }}>Waiting for you</div>}
      <div className="rowlist" style={{ marginTop: waiting.length ? 0 : 12 }}>
        {[...waiting, ...notes.filter((n) => n.action !== "Accept")].map((n) => (
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

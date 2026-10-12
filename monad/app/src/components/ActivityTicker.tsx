"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fanName, usd } from "./ui";
import { useAgents } from "@/lib/agents";
import { query } from "@/lib/indexer";
import "@/styles/ticker.css";

/*
 * The live tape: a fast-moving strip of what fans are doing right now (backs, fades, new takes,
 * wins, 1v1s, leagues), pump.fun / stock-ticker style. New events flash in at the front.
 */

type Item = {
  id: string;
  kind: string;
  actor: string;
  amount: string | null;
  text: string | null;
  timestamp: string;
  room_id: string | null;
  league_id: string | null;
  message: { text: string; room_id: string } | null;
  market: { id: string; take: { room_id: string } | null; question: { text: string; fixture: { id: string } | null } } | null;
};

type Chip = { id: string; tone: "up" | "down" | "win" | "flash" | "ai" | "neutral"; who: string; verb: string; what: string; href: string; fresh?: boolean };

const short = (t: string, n = 34) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function ActivityTicker() {
  const agents = useAgents();
  const [chips, setChips] = useState<Chip[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await query<{ FeedItem: Item[] }>(
        `{ FeedItem(order_by: { timestamp: desc }, limit: 30) {
            id kind actor amount text timestamp room_id league_id
            message { text room_id }
            market { id take { room_id } question { text fixture { id } } }
        } }`,
      );
      const items = d.FeedItem.filter((i) => !(i.market?.question.text ?? i.message?.text ?? "").startsWith("E2E "));
      // Which side each bettor took, for the green/red colouring.
      const betIds = items.filter((i) => i.kind === "BET" && i.market).map((i) => `${i.market!.id}-${i.actor}`);
      const sides = betIds.length
        ? new Map((await query<{ Bet: { id: string; side: number }[] }>(`query B($ids: [String!]) { Bet(where: { id: { _in: $ids } }) { id side } }`, { ids: betIds })).Bet.map((b) => [b.id, b.side]))
        : new Map<string, number>();

      const first = seen.current.size === 0;
      const next: Chip[] = items.flatMap((i): Chip[] => {
        const ai = agents.has(i.actor);
        const who = agents.get(i.actor) || fanName(i.actor);
        const room = i.room_id ?? i.message?.room_id ?? i.market?.take?.room_id ?? (i.market?.question.fixture ? `match-${i.market.question.fixture.id}` : null);
        const href = room ? (room.startsWith("match") ? `/m/${room.split("-")[1]}` : `/l/${room.split("-")[1]}`) : i.league_id ? `/l/${i.league_id}` : "/social";
        const q = short(i.market?.question.text || i.message?.text || i.text || "");
        const amt = i.amount ? usd(i.amount) : "";
        const fresh = !first && !seen.current.has(i.id);
        const base = { id: i.id, who, href, fresh };
        switch (i.kind) {
          case "BET": {
            const side = sides.get(`${i.market?.id}-${i.actor}`) ?? 1;
            if (who === "Terrace House") return [{ ...base, tone: "neutral", verb: `🏦 LIQUIDITY ${amt} ${side === 2 ? "NO" : "YES"}`, what: q }];
            return [{ ...base, tone: ai ? "ai" : side === 2 ? "down" : "up", verb: side === 2 ? `▼ FADED ${amt}` : side === 0 ? `● SEALED ${amt}` : `▲ BACKED ${amt}`, what: q }];
          }
          case "TAKE":
            return [{ ...base, tone: ai ? "ai" : "neutral", verb: "💬 SAID", what: `“${q}”` }];
          case "TAKE_LISTED":
            return [{ ...base, tone: "flash", verb: "⚡ NEW MARKET", what: q }];
          case "WIN":
            return [{ ...base, tone: "win", verb: `🏆 WON +${amt}`, what: q }];
          case "ACCA":
            return [{ ...base, tone: "flash", verb: `🧾 ${i.text ?? ""} PARLAY ${amt}`, what: "" }];
          case "ACCA_WON":
            return [{ ...base, tone: "win", verb: `🏆 PARLAY LANDED +${amt}`, what: "" }];
          case "CHALLENGE":
            return [{ ...base, tone: "flash", verb: `⚔️ 1v1 FOR ${amt}`, what: "" }];
          case "CHALLENGE_WON":
            return [{ ...base, tone: "win", verb: `⚔️ WON A 1v1 +${amt}`, what: "" }];
          case "LEAGUE_JOIN":
            return [{ ...base, tone: "neutral", verb: "👥 JOINED", what: short(i.text ?? "a league") }];
          case "TITLE":
            return [{ ...base, tone: "win", verb: "👑 CHAMPION", what: short(i.text ?? "") }];
          case "AGENT":
            return [{ ...base, tone: "ai", verb: "🤖 AI PUNDIT JOINED", what: "" }];
          default:
            return [];
        }
      });
      next.forEach((c) => seen.current.add(c.id));
      setChips(next);
    } catch {
      // the tape just keeps showing the last moves
    }
  }, [agents]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  if (!chips.length) return null;
  // The strip is drawn twice so the loop is seamless; speed scales with how much is on it.
  const loop = [...chips, ...chips];
  return (
    <div className="ticker" aria-label="Live activity">
      <span className="ticker-live"><i /> LIVE</span>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ animationDuration: `${Math.max(24, chips.length * 4.5)}s` }}>
          {loop.map((c, n) => (
            <Link key={`${c.id}-${n}`} href={c.href} className={`tick ${c.tone}${c.fresh && n < chips.length ? " fresh" : ""}`}>
              <b>{c.who}</b>
              <span className="verb">{c.verb}</span>
              {c.what && <span className="what">{c.what}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

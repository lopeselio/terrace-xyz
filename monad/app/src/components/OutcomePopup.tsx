"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { shareLink } from "./Header";
import { Icon } from "./Icon";
import { money } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { betOutcome, type Outcome } from "@/lib/outcome";
import { collect } from "@/lib/play";
import { balanceChanged } from "@/lib/useBalance";
import { play } from "@/lib/sound";
import "@/styles/outcome.css";
import { showError } from "@/lib/errors";

/*
 * The full-time moment: whenever one of your bets, parlays or 1v1s is decided, a popup says so —
 * green for a win (with Collect), red for a loss, grey when the stake comes back. Each result is
 * announced once per device; results already collected before this device saw them stay quiet.
 */

type Moment = {
  key: string;
  outcome: Exclude<Outcome, "open">;
  title: string; // what it was about
  amount: number; // 6-decimal units
  kind: "bet" | "parlay" | "1v1";
  marketId?: string; // uncollected market bets can be collected from the popup
  collected: boolean;
  href: string;
};

type BetRow = {
  id: string; side: number; stake: string; result: number | null; payout: string | null;
  market: { id: string; feeBps: number; yesPool: string; noPool: string; take: { room_id: string } | null; question: { answer: number; text: string; fixture: { id: string } | null } };
};
type ParlayRow = { id: string; legs: number; stake: string; status: number; payout: string | null };
type DuelRow = { id: string; stake: string; status: number; winner: string | null; question: { text: string } };

const POLL_MS = 20_000;
const ANNOUNCE = "terrace-outcome";

/** Show the popup for a result the fan just collected somewhere else (Profile, Notifications). */
export function announceCollected(m: { id: string; outcome: Exclude<Outcome, "open">; title: string; amount: number; href: string }) {
  window.dispatchEvent(
    new CustomEvent<Moment>(ANNOUNCE, {
      detail: { key: `bet:${m.id}`, outcome: m.outcome, title: m.title, amount: m.amount, kind: "bet", marketId: m.id, collected: true, href: m.href },
    }),
  );
}

export function OutcomePopup() {
  const { status, address, send } = useAccount();
  const [queue, setQueue] = useState<Moment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0); // counts up for the amount
  const loading = useRef(false);

  const storeKey = address ? `terrace.announced.${address.toLowerCase()}` : null;
  const readSeen = useCallback((): Set<string> | null => {
    if (!storeKey) return null;
    try {
      const raw = localStorage.getItem(storeKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : null;
    } catch {
      return new Set();
    }
  }, [storeKey]);
  const writeSeen = useCallback(
    (seen: Set<string>) => {
      if (!storeKey) return;
      try {
        localStorage.setItem(storeKey, JSON.stringify([...seen].slice(-500)));
      } catch {}
    },
    [storeKey],
  );

  const check = useCallback(async () => {
    if (!address || loading.current) return;
    loading.current = true;
    try {
      const me = address.toLowerCase();
      const d = await query<{ Bet: BetRow[]; Parlay: ParlayRow[]; Matchup: DuelRow[] }>(
        `query Results($me: String!) {
          Bet(where: { bettor: { _eq: $me } }) {
            id side stake result payout
            market { id feeBps yesPool noPool take { room_id } question { answer text fixture { id } } }
          }
          Parlay(where: { player: { _eq: $me }, status: { _gt: 0 } }) { id legs stake status payout }
          Matchup(where: { status: { _eq: 4 }, _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }) { id stake status winner question { text } }
        }`,
        { me },
      );
      const moments: Moment[] = [];
      for (const b of d.Bet) {
        const r = betOutcome(b);
        if (r.outcome === "open") continue;
        const fixture = b.market.question.fixture?.id ?? b.market.take?.room_id.split("-")[1];
        moments.push({
          key: `bet:${b.id}`,
          outcome: r.outcome,
          title: b.market.question.text || "Your call",
          amount: r.amount,
          kind: "bet",
          marketId: b.market.id,
          collected: r.collected,
          href: fixture ? `/m/${fixture}` : "/me",
        });
      }
      for (const p of d.Parlay) {
        const outcome = p.status === 2 ? "lost" : p.status === 3 ? "refund" : "won";
        moments.push({
          key: `parlay:${p.id}`,
          outcome,
          title: `${p.legs}-leg parlay`,
          amount: outcome === "won" ? Number(p.payout ?? p.stake) : Number(p.stake),
          kind: "parlay",
          collected: p.status >= 3,
          href: "/acca",
        });
      }
      for (const m of d.Matchup) {
        const won = m.winner?.toLowerCase() === me;
        moments.push({
          key: `1v1:${m.id}`,
          outcome: m.winner ? (won ? "won" : "lost") : "refund",
          title: m.question.text || "Your 1v1",
          amount: won ? Number(m.stake) * 2 : Number(m.stake),
          kind: "1v1",
          collected: true, // the winner is paid when it settles
          href: `/c/${m.id}`,
        });
      }

      let seen = readSeen();
      if (seen === null) {
        // First time on this device: anything already collected is old news.
        seen = new Set(moments.filter((m) => m.collected).map((m) => m.key));
        writeSeen(seen);
      }
      const fresh = moments.filter((m) => !seen!.has(m.key));
      if (fresh.length) {
        setQueue((q) => [...q, ...fresh.filter((f) => !q.some((x) => x.key === f.key))]);
        fresh.forEach((f) => seen!.add(f.key));
        writeSeen(seen);
      }
    } catch {
      // the indexer is catching up; try again next round
    } finally {
      loading.current = false;
    }
  }, [address, readSeen, writeSeen]);

  // Development only: preview the popup with ?preview-result=won|lost|refund.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const p = new URLSearchParams(location.search).get("preview-result") as Moment["outcome"] | null;
    if (p === "won" || p === "lost" || p === "refund")
      setQueue([{ key: "preview", outcome: p, title: "Haaland scores in the first half", amount: p === "won" ? 13_330_000 : 5_000_000, kind: "bet", collected: true, href: "/" }]);
  }, []);

  // A collect made elsewhere: put it up front, and don't announce it again from the poll.
  useEffect(() => {
    const on = (e: Event) => {
      const m = (e as CustomEvent<Moment>).detail;
      const seen = readSeen() ?? new Set<string>();
      seen.add(m.key);
      writeSeen(seen);
      setQueue((q) => [m, ...q.filter((x) => x.key !== m.key)]);
    };
    window.addEventListener(ANNOUNCE, on);
    return () => window.removeEventListener(ANNOUNCE, on);
  }, [readSeen, writeSeen]);

  useEffect(() => {
    if (status !== "ready") return;
    check();
    const t = setInterval(check, POLL_MS);
    window.addEventListener("terrace-balance", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("terrace-balance", check);
    };
  }, [status, check]);

  const now = queue[0];

  // Count the amount up, and buzz the phone on a win.
  useEffect(() => {
    if (!now) return;
    setError(null);
    if (now.outcome === "won") navigator.vibrate?.([30, 40, 60]);
    play(now.outcome === "won" ? "win" : now.outcome === "lost" ? "lose" : "refund");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setShown(now.amount);
    setShown(0);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(now.amount * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [now]);

  if (!now) return null;
  const next = () => setQueue((q) => q.slice(1));

  async function collectNow() {
    if (!now?.marketId || !address) return next();
    setBusy(true);
    setError(null);
    try {
      await collect(send, BigInt(now.marketId), address);
      balanceChanged();
      next();
    } catch (e) {
      setError(showError(e));
    } finally {
      setBusy(false);
    }
  }

  const head = now.outcome === "won" ? (now.kind === "parlay" ? "Parlay landed" : "You won") : now.outcome === "lost" ? "Not this time" : "Stake back";
  const sign = now.outcome === "won" ? "+" : now.outcome === "lost" ? "−" : "";
  const sub =
    now.outcome === "won"
      ? now.kind === "1v1" ? "You won the 1v1. It's already in your balance." : "Called it."
      : now.outcome === "lost"
        ? now.kind === "1v1" ? "Your mate had this one." : "It didn't come in. Plenty more matches."
        : "Nobody backed the winning side, or the match was called off, so your stake comes back.";
  const canCollect = !now.collected && now.kind === "bet" && now.outcome !== "lost";

  return (
    <div className={`outcome ${now.outcome}`} role="dialog" aria-modal aria-label={head}>
      <div className="outcome-scrim" onClick={next} />
      <div className="outcome-card">
        {now.outcome === "won" && (
          <div className="burst" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${(360 / 14) * i}deg`, ["--d" as string]: `${i % 3}` }} />)}
          </div>
        )}
        <div className="outcome-icon">
          <Icon name={now.outcome === "won" ? "trophy" : now.outcome === "lost" ? "close" : "refresh"} size={30} />
        </div>
        <div className="outcome-head">{head}</div>
        <div className="outcome-amount">{sign}{money(shown)}</div>
        <div className="outcome-title">{now.title}</div>
        <div className="outcome-sub">{sub}</div>
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
        <div className="outcome-actions">
          {canCollect ? (
            <button className="cta" disabled={busy} onClick={collectNow}>
              {busy ? "Collecting…" : now.outcome === "won" ? `Collect ${money(now.amount)}` : `Get my ${money(now.amount)} back`}
            </button>
          ) : now.outcome === "lost" ? (
            <Link className="cta cta-ghost" href="/markets" onClick={next}>Find the next one</Link>
          ) : (
            <button className="cta" onClick={next}>Nice one</button>
          )}
          <div className="row" style={{ gap: 8 }}>
            {now.outcome === "won" && (
              <button
                className="cta cta-ghost cta-sm"
                onClick={() => shareLink("Terrace", `Called it on Terrace: "${now.title}" +${money(now.amount)}.`, `${location.origin}${now.href}`)}
              >
                <Icon name="share" size={16} /> Share
              </button>
            )}
            <button className="cta cta-ghost cta-sm" onClick={next}>{queue.length > 1 ? `Next (${queue.length - 1})` : "Close"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

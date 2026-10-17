"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useAccount } from "@/lib/account";
import { showError } from "@/lib/errors";
import { DAY, MAX_GAP, REPAIR_COST, repairNote, streakState, today } from "@/lib/streak";
import { points as fmt } from "@/lib/terracePoints";
import "@/styles/streak.css";

type Data = { days: number[]; repaired: number[]; spent: number; points: number; today: number };

/** The signed-in fan's streak: played days from the indexer, repaired days from /api/streak (Azure). */
export function useStreak() {
  const { address } = useAccount();
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(async () => {
    if (!address) return setData(null);
    try {
      const r = await fetch(`/api/streak?who=${address}`);
      if (r.ok) setData(await r.json());
    } catch {}
  }, [address]);
  useEffect(() => {
    load();
    // A new action may be today's first: look again once the indexer has counted it.
    const later = () => setTimeout(load, 6000);
    window.addEventListener("terrace-sent", later);
    window.addEventListener("terrace-streak", load);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => {
      window.removeEventListener("terrace-sent", later);
      window.removeEventListener("terrace-streak", load);
      clearInterval(t);
    };
  }, [load]);
  const state = useMemo(() => (data ? streakState(new Set([...data.days, ...data.repaired]), data.today) : null), [data]);
  return { data, state, setData };
}

/** Flame + day count for the header. Grey when today isn't played yet, red when the run just broke. */
export function StreakPill() {
  const { status } = useAccount();
  const { data, state, setData } = useStreak();
  const [open, setOpen] = useState(false);
  if (status !== "ready") return null;
  const broken = !!state?.gap.length;
  return (
    <>
      <button className={`streakpill${state?.doneToday ? " lit" : ""}${broken ? " broken" : ""}`} aria-label={`${state?.current ?? 0}-day streak`} onClick={() => setOpen(true)}>
        <Icon name="flame" size={15} />
        {state ? state.current : "–"}
      </button>
      {open && <StreakSheet data={data} onChange={setData} onClose={() => setOpen(false)} />}
    </>
  );
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

export function StreakSheet({ data, onChange, onClose }: { data: Data | null; onChange: (d: Data) => void; onClose: () => void }) {
  const { address, sign } = useAccount();
  const now = data?.today ?? today();
  const played = useMemo(() => new Set(data?.days ?? []), [data]);
  const repaired = useMemo(() => new Set(data?.repaired ?? []), [data]);
  const s = useMemo(() => streakState(new Set([...played, ...repaired]), now), [played, repaired, now]);
  const gap = new Set(s.gap);
  const [month, setMonth] = useState(() => {
    const d = new Date(now * DAY * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState(false);

  // The month grid, Monday first, in UTC days (the same days the points count in).
  const first = Date.UTC(month.y, month.m, 1) / 1000 / DAY;
  const length = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const lead = (new Date(first * DAY * 1000).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => first + i)];
  const inMonth = cells.filter((d): d is number => d !== null && (played.has(d) || repaired.has(d))).length;
  const title = new Date(Date.UTC(month.y, month.m, 1)).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const cost = s.gap.length * REPAIR_COST;
  const afford = (data?.points ?? 0) >= cost;
  const shift = (k: number) => setMonth(({ y, m }) => ({ y: m + k < 0 ? y - 1 : m + k > 11 ? y + 1 : y, m: (m + k + 12) % 12 }));
  const thisMonth = (() => { const d = new Date(now * DAY * 1000); return d.getUTCFullYear() === month.y && d.getUTCMonth() === month.m; })();

  async function repair() {
    if (!address || !s.gap.length) return;
    setBusy(true);
    setError(null);
    try {
      const at = Math.floor(Date.now() / 1000);
      const signature = await sign(repairNote(address, s.gap, at));
      const r = await fetch("/api/streak", { method: "POST", body: JSON.stringify({ address, days: s.gap, at, signature }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "That repair didn't go through.");
      onChange(body);
      setFixed(true);
      window.dispatchEvent(new Event("terrace-streak")); // points pill and other streak pills refresh
    } catch (e) {
      setError(e instanceof Error && !/0x|revert/i.test(e.message) ? e.message : showError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="streak-hero">
        <div className={`streak-flame${s.doneToday ? " lit" : ""}`}><Icon name="flame" size={44} strokeWidth={1.6} /></div>
        <div>
          <div className="streak-n">{s.current}</div>
          <div className="streak-k">day streak</div>
        </div>
        <button className="iconbtn" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto", alignSelf: "flex-start" }}><Icon name="close" /></button>
      </div>
      <p className="streak-line">
        {fixed ? "Streak repaired. Keep it going today."
          : s.gap.length ? `Your ${s.lost}-day streak broke ${s.gap.length === 1 ? "yesterday" : `${s.gap.length} days ago`}. Buy the missed day${s.gap.length > 1 ? "s" : ""} back and it carries on.`
          : s.doneToday ? "You're on for today. Come back tomorrow to keep it going."
          : s.current ? "Make a pick, post a take or back one today to keep your streak alive."
          : "Play today to start a streak. Every day you play adds a flame."}
      </p>

      {s.gap.length > 0 && !fixed && (
        <div className="repair">
          <div className="repair-ice"><Icon name="shield" size={22} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="uname">Repair your streak</div>
            <div className="umeta">{s.gap.length} missed day{s.gap.length > 1 ? "s" : ""} · {REPAIR_COST} points each · you have {fmt(data?.points ?? 0)}</div>
          </div>
          <button className="repair-btn" onClick={repair} disabled={busy || !afford}>
            {busy ? "…" : <><Icon name="bolt" size={14} /> {fmt(cost)}</>}
          </button>
        </div>
      )}
      {s.gap.length > 0 && !afford && !fixed && <p className="umeta" style={{ marginTop: 6 }}>Not enough points yet. Play today to start a new run.</p>}
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="cal">
        <div className="cal-hd">
          <button className="iconbtn" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="chevronLeft" size={16} /></button>
          <span>{title}</span>
          <button className="iconbtn" aria-label="Next month" onClick={() => shift(1)} disabled={thisMonth}><Icon name="chevronRight" size={16} /></button>
        </div>
        <div className="cal-grid">
          {WEEK.map((w, i) => <span key={`w${i}`} className="cal-wd">{w}</span>)}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />;
            const on = played.has(d), fix = repaired.has(d), miss = gap.has(d) && !fixed;
            const linkL = (played.has(d - 1) || repaired.has(d - 1)) && (on || fix) && i % 7 !== 0;
            const linkR = (played.has(d + 1) || repaired.has(d + 1)) && (on || fix) && i % 7 !== 6;
            return (
              <span key={d} className={`cal-d${on ? " on" : ""}${fix ? " fix" : ""}${miss ? " miss" : ""}${d === now ? " today" : ""}${d > now ? " future" : ""}${linkL ? " l" : ""}${linkR ? " r" : ""}`}>
                <span className="cal-dot">{on ? <Icon name="flame" size={14} /> : fix ? <Icon name="shield" size={13} /> : d - first + 1}</span>
              </span>
            );
          })}
        </div>
        <div className="cal-key">
          <span><i className="k-on" /> Played</span>
          <span><i className="k-fix" /> Repaired</span>
          {s.gap.length > 0 && !fixed && <span><i className="k-miss" /> Missed</span>}
        </div>
      </div>

      <div className="streak-stats">
        <div><b>{s.longest}</b><small>Longest streak</small></div>
        <div><b>{inMonth}</b><small>Days this month</small></div>
        <div><b>{played.size}</b><small>Days played</small></div>
      </div>
      <p className="umeta" style={{ marginTop: 12, textAlign: "center" }}>
        A day counts when you make a pick, post or back a take, or place a bet. Breaks of up to {MAX_GAP} days can be repaired with points. Days are in UTC.
      </p>
    </Sheet>
  );
}

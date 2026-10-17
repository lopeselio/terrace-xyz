/*
 * Day streaks, Duolingo-style. A day counts when the fan earned their DAILY Terrace Points (their first
 * action of that UTC day, see indexer/src/points.ts) or repaired it with points. Shared by the app and
 * /api/streak so the calendar and the server agree on what's repairable.
 */

export const DAY = 86_400;
/** Points per missed day to repair a broken streak. */
export const REPAIR_COST = 150;
/** Only short breaks can be repaired: up to this many missed days in a row. */
export const MAX_GAP = 3;
export const REACTIONS = ["🔥", "⚽", "😂", "🎯", "😬", "🤡"] as const;

export const dayOf = (unix: number | string) => Math.floor(Number(unix) / DAY);
export const today = () => dayOf(Date.now() / 1000);

/** The run ending on `end`: how many days in a row up to and including it. */
function runTo(active: Set<number>, end: number) {
  let n = 0;
  while (active.has(end - n)) n++;
  return n;
}

export type StreakState = {
  /** The streak as it stands: alive if you played today or yesterday. */
  current: number;
  /** Played today already. */
  doneToday: boolean;
  longest: number;
  /** Missed days that can be bought back right now (empty if nothing to repair). */
  gap: number[];
  /** The run those days would save. */
  lost: number;
};

export function streakState(active: Set<number>, now = today()): StreakState {
  const doneToday = active.has(now);
  const current = doneToday ? runTo(active, now) : runTo(active, now - 1);

  let longest = 0;
  for (const d of active) {
    if (active.has(d - 1)) continue;
    let n = 0;
    while (active.has(d + n)) n++;
    longest = Math.max(longest, n);
  }

  // A fresh break: yesterday was missed (whether or not you've played today) and the last played day is
  // at most MAX_GAP+1 days back, so 1..MAX_GAP days are missing in between. Older breaks stay broken.
  const runStart = doneToday ? now - current + 1 : now;
  let prev = runStart - 1;
  while (prev > runStart - 1 - (MAX_GAP + 1) && !active.has(prev)) prev--;
  const gap: number[] = [];
  if (active.has(prev) && prev < runStart - 1 && (current === 0 || (doneToday && current === 1))) {
    for (let d = prev + 1; d < runStart; d++) gap.push(d);
  }
  return { current, doneToday, longest, gap: gap.length <= MAX_GAP ? gap : [], lost: gap.length ? runTo(active, prev) : 0 };
}

/** The exact note a fan signs to repair `days`; the server rebuilds and checks it. */
export const repairNote = (address: string, days: number[], at: number) => `Terrace streak repair\nfan:${address.toLowerCase()}\ndays:${days.join(",")}\nat:${at}`;
export const reactNote = (address: string, post: string, emoji: string, at: number) => `Terrace reaction\nfan:${address.toLowerCase()}\npost:${post}\nemoji:${emoji || "none"}\nat:${at}`;

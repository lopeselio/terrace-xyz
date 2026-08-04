// ---------------------------------------------------------------------------
// One market, one state (TODO Sprint 12 #11).
//
// The chain gives a card three statuses — Open / Closed / Settled — plus an
// expiry, and that is not enough to be unambiguous. An "Open" market whose
// expiry passed ten minutes ago is waiting on its creator to settle; one whose
// expiry passed a week ago has been abandoned. A fan reading "Open" on either
// would reasonably tap a price, and the program refuses both.
//
// So the state a card shows is derived here, in one place, from status +
// expiry on the trusted clock:
//
//   counter    — takeable right now. The badge is the countdown.
//   resolving  — past expiry, inside the settlement window. Nothing to take.
//   expired    — past expiry and past that window: nobody settled it.
//   settled    — outcome is on chain.
//
// Every screen derives from this rather than testing `status` itself, so a
// market reads the same on Home, in the Markets list and in the detail sheet.
//
// Pure, with `now` injected: the screens pass `serverNow()` (see
// hooks/useServerTime) so countdowns run off cluster time, and tests pass a
// fixed number so they need no clock at all.
// ---------------------------------------------------------------------------

export type MarketState = "counter" | "resolving" | "expired" | "settled";

/**
 * How long after expiry a market still reads RESOLVING rather than EXPIRED.
 *
 * Settlement is creator-driven (or an Arcium reveal), so a gap between the
 * whistle and the settle transaction is normal — a few hours covers a match
 * finishing late, a creator asleep, or a reveal queued behind the MPC cluster.
 * Past that, silence is the story: the card says EXPIRED and stops implying
 * a result is on its way.
 */
export const RESOLVING_WINDOW_MS = 6 * 3_600_000;

/** Under this much time left, a counter card reads as closing-soon. */
export const URGENT_MS = 15 * 60_000;

export interface MarketStateInfo {
  state: MarketState;
  /** Badge text — a countdown while takeable, otherwise the state name. */
  label: string;
  /** Muted second line: "closed 12m ago", "ended 3d ago". "" when there's none. */
  detail: string;
  /** True only when a price can actually be taken. */
  takeable: boolean;
  /** Counter markets inside URGENT_MS — the badge warms to amber. */
  urgent: boolean;
  /** Winning side once settled, when the chain told us. */
  winner: "YES" | "NO" | null;
}

/** The slice of a market this module needs — anything market-shaped fits. */
export interface MarketStateInput {
  status: "Open" | "Settled" | "Closed";
  expiry: Date | null;
  /** Native markets only: 0 = YES, 1 = NO. */
  outcome?: 0 | 1 | null;
}

/** Remaining time, in the card idiom: "2d 4h", "3h 05m", "4:31". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1_000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Elapsed time, coarse: "just now", "12m ago", "3h ago", "2d ago". */
export function formatAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Long-form deadline for the detail sheet — "Sat 9 Aug, 15:00". The list cards
 * use the countdown; the sheet is where a fan checks the actual kick-off.
 */
export function formatDeadline(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function winnerOf(market: MarketStateInput): "YES" | "NO" | null {
  if (market.outcome === 0) return "YES";
  if (market.outcome === 1) return "NO";
  return null;
}

/**
 * Derive the card state. `now` is milliseconds on the trusted clock.
 */
export function marketStateOf(market: MarketStateInput, now: number): MarketStateInfo {
  const winner = winnerOf(market);

  if (market.status === "Settled") {
    return {
      state: "settled",
      label: "SETTLED",
      detail: market.expiry ? `ended ${formatAgo(now - market.expiry.getTime())}` : "",
      takeable: false,
      urgent: false,
      winner,
    };
  }

  // A market with no expiry can only be closed by its status. Nothing to count
  // down to, so it stays takeable and the badge just says so.
  if (!market.expiry) {
    const open = market.status === "Open";
    return {
      state: open ? "counter" : "resolving",
      label: open ? "OPEN" : "RESOLVING",
      detail: "",
      takeable: open,
      urgent: false,
      winner,
    };
  }

  const msLeft = market.expiry.getTime() - now;

  // Still trading: Open and the deadline hasn't passed.
  if (market.status === "Open" && msLeft > 0) {
    return {
      state: "counter",
      label: formatCountdown(msLeft),
      detail: "",
      takeable: true,
      urgent: msLeft <= URGENT_MS,
      winner,
    };
  }

  // Past the deadline (or closed on chain early) and no outcome yet. Inside the
  // window that's the normal wait for settlement; beyond it, nobody came.
  const sinceClose = Math.max(0, -msLeft);
  const stale = sinceClose > RESOLVING_WINDOW_MS;
  return {
    state: stale ? "expired" : "resolving",
    label: stale ? "EXPIRED" : "RESOLVING",
    detail: `closed ${formatAgo(sinceClose)}`,
    takeable: false,
    urgent: false,
    winner,
  };
}

/**
 * How long until this state's label could change — the tick period for a card
 * showing it. 0 means it never changes on its own and needs no timer.
 */
export function tickPeriodFor(info: MarketStateInfo): number {
  if (info.state === "settled") return 0;
  // mm:ss labels move every second; "2d 4h" and the ago-lines do not.
  if (info.state === "counter") return info.label.includes(":") ? 1_000 : 30_000;
  if (info.state === "resolving") return 1_000; // can tip into expired
  return 60_000; // expired — only the "3d ago" line ages
}

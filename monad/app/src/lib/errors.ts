/** Contract and network errors, in football language. */
const MESSAGES: Record<string, string> = {
  MarketClosed: "Too late: this one has closed.",
  ContestLocked: "Picks are closed. This one has kicked off.",
  StakeTooSmall: "The minimum is 10 cents.",
  WrongSide: "You've already backed the other side of this one.",
  SealedMarket: "This one is sealed: your side stays secret until kickoff.",
  AlreadyBet: "You've already got a sealed pick on this one.",
  NotMember: "Join the league first.",
  WrongInviteCode: "That invite code doesn't match.",
  LeagueFull: "This league is full.",
  AlreadyMember: "You're already in this league.",
  AlreadyVoted: "You've already voted on this.",
  AlreadyBacked: "You've already backed this take.",
  NotYourChallenge: "This challenge is for someone else.",
  QuestionClosed: "That window has already closed.",
  NotResolved: "No result yet. Check back after the final whistle.",
  BadInput: "Something about that didn't look right.",
  "insufficient funds": "Your account is still being topped up. Try again in a few seconds.",
  "transfer amount exceeds balance": "Not enough dollars for that stake.",
  ERC20InsufficientBalance: "Not enough dollars for that stake.",
  "0xe450d38c": "Not enough dollars for that stake.", // ERC20InsufficientBalance selector
  ERC20InsufficientAllowance: "One moment: setting up your account for bets.",
  "exceeds allowance": "One moment: setting up your account for bets.",
};

/** An error whose message is already written for fans: shown as-is, never re-translated. */
export class FanError extends Error {}

/** Lost connection, RPC or server trouble: worth a popup, not just a line under the button. */
const OUTAGE = /Failed to fetch|NetworkError|Load failed|network|HTTP request failed|fetch failed|timed? ?out|ECONN|ETIMEDOUT|503|502|504|Internal Server Error|rate limit|429/i;

/** Passkey prompts (WebAuthn) that the fan closed, timed out, or that the browser blocked. */
const PASSKEY: [RegExp, string][] = [
  [/NotAllowedError|not allowed|timed out or was not allowed/i, "No passkey was used. Try again when you're ready."],
  [/InvalidStateError|already registered/i, "This phone already has a Terrace passkey. Use Sign in instead."],
  [/NotSupportedError|not supported/i, "This browser can't use passkeys. Try Safari on iPhone or Chrome on Android."],
  [/SecurityError/i, "Passkeys only work on play.terrace.social. Open Terrace there and try again."],
  [/AbortError|aborted/i, "Passkey cancelled. Try again when you're ready."],
];

function textOf(e: unknown) {
  return e instanceof Error ? `${e.name} ${e.message} ${(e as { shortMessage?: string }).shortMessage ?? ""}` : String(e);
}

export function friendlyError(e: unknown): string {
  if (e instanceof FanError) return e.message;
  const text = textOf(e);
  for (const [needle, message] of Object.entries(MESSAGES)) if (text.includes(needle)) return message;
  for (const [re, message] of PASSKEY) if (re.test(text)) return message;
  if (/nonce|replacement transaction|already known/i.test(text)) return "Your last move is still going through. Try again in a few seconds.";
  if (/User rejected|denied/i.test(text)) return "Cancelled. Nothing was placed.";
  if (isOutage(e)) return "We lost the connection to the ground. Try again in a moment.";
  return "That didn't go through. Try again in a moment.";
}

export function isOutage(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return !(e instanceof FanError) && OUTAGE.test(textOf(e));
}

/**
 * For action handlers: the line to show under the button, plus a stoppage popup when the cause
 * is a dropped connection or a server outage rather than something the fan can fix.
 */
export function showError(e: unknown, retry?: () => void): string {
  if (typeof window !== "undefined" && isOutage(e)) {
    callStoppage(navigator.onLine ? "network" : "offline", retry ? { primary: { label: "Try again", run: retry }, secondary: { label: "Not now" } } : undefined);
  }
  return friendlyError(e);
}

/*
 * Stoppages: when Terrace AI or the match data can't be reached, a popup says what happened and
 * what the fan can still do, in football terms. Raise one from anywhere with `callStoppage`.
 */
export type StoppageCode = "ai_busy" | "ai_offline" | "match_data" | "offline" | "network" | "bad_input" | "server" | "kit_bag" | "data_lag" | "offline_soft";
export type Stoppage = { code: StoppageCode; title: string; body: string; icon: "whistle" | "hourglass" | "pitch" | "bolt" | "info" | "dollar" | "clock"; soft?: boolean };

export const STOPPAGES: Record<StoppageCode, Omit<Stoppage, "code">> = {
  ai_busy: {
    icon: "hourglass",
    title: "Crowd's too loud",
    body: "Terrace AI has a queue of takes to read. Go again in a few seconds, or publish now and the AI judge rules on it after full time.",
  },
  ai_offline: {
    icon: "whistle",
    title: "Our analyst is off the pitch",
    body: "Terrace AI can't read takes right now, so this one can't be checked minute by minute. You can still publish it: the AI judge rules on it after full time, and if it's unclear everyone gets their money back.",
  },
  match_data: {
    icon: "pitch",
    title: "Team sheet's not in",
    body: "We can't reach the match data right now. Try again in a minute.",
  },
  offline: {
    icon: "bolt",
    title: "Lost the signal",
    body: "Looks like you're offline. Check your connection and go again.",
  },
  network: {
    icon: "bolt",
    title: "Floodlight failure",
    body: "We lost the connection to the ground for a moment. If your move went through it'll show up shortly; if not, go again.",
  },
  kit_bag: {
    icon: "dollar",
    title: "Kit man's restocking",
    body: "We couldn't top up your test dollars just now. Give it a minute and try again.",
  },
  data_lag: {
    icon: "clock",
    soft: true,
    title: "Scoreboard's lagging",
    body: "Some numbers may be a minute behind.",
  },
  offline_soft: {
    icon: "bolt",
    soft: true,
    title: "You're offline",
    body: "Scores and odds will catch up when you're back.",
  },
  bad_input: {
    icon: "info",
    title: "That take's offside",
    body: "Keep it under 140 characters and pick a match.",
  },
  server: {
    icon: "whistle",
    title: "Stoppage time",
    body: "Something went wrong on our side. Play resumes in a moment: try again shortly.",
  },
};

export type StoppageAction = { label: string; run?: () => void };

export function callStoppage(code: StoppageCode, actions?: { primary?: StoppageAction; secondary?: StoppageAction }) {
  window.dispatchEvent(new CustomEvent("terrace-stoppage", { detail: { code, ...actions } }));
}

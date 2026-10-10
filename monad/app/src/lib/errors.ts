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

export function friendlyError(e: unknown): string {
  const text = e instanceof Error ? `${e.message} ${(e as { shortMessage?: string }).shortMessage ?? ""}` : String(e);
  for (const [needle, message] of Object.entries(MESSAGES)) if (text.includes(needle)) return message;
  return "That didn't go through. Try again in a moment.";
}

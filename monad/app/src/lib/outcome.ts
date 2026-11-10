/*
 * What a bet comes to, exactly as TerraceMarkets.settleBet pays it: void, an unbacked side or nobody on
 * the winning side → stake back; your side wins → share of the pool less the creator's fee on profit.
 */
export type Outcome = "won" | "lost" | "refund" | "open";

export type BetLike = {
  side: number;
  stake: string;
  result: number | null; // 0 refund, 1 won, 2 lost (once collected)
  payout: string | null;
  market: { feeBps: number; yesPool: string; noPool: string; question: { answer: number } };
};

export function betOutcome(b: BetLike): { outcome: Outcome; amount: number; collected: boolean } {
  const stake = Number(b.stake);
  if (b.result !== null) {
    const outcome: Outcome = b.result === 1 ? "won" : b.result === 2 ? "lost" : "refund";
    return { outcome, amount: outcome === "lost" ? stake : Number(b.payout ?? stake), collected: true };
  }
  const answer = b.market.question.answer; // 0 open, 1 yes, 2 no, 3 void
  if (answer === 0) return { outcome: "open", amount: stake, collected: false };
  const yes = Number(b.market.yesPool), no = Number(b.market.noPool);
  const winning = answer === 1 ? yes : answer === 2 ? no : 0;
  if (answer === 3 || b.side === 0 || winning === 0) return { outcome: "refund", amount: stake, collected: false };
  if (b.side !== answer) return { outcome: "lost", amount: stake, collected: false };
  const gross = (stake * (yes + no)) / winning;
  return { outcome: "won", amount: gross - ((gross - stake) * b.market.feeBps) / 10_000, collected: false };
}

/**
 * A standard question's answer from its fixture, as TerraceOracle.outcomeOf works it out (1X2, over
 * goals, both teams score never get an answer report). Answers: 0 open, 1 yes, 2 no, 3 void.
 */
export function standardAnswer(kind: number, line: number, f: { state: number; homeGoals: number; awayGoals: number }) {
  if (kind === 0 || f.state === 0) return 0;
  if (f.state === 2) return 3;
  const h = f.homeGoals, a = f.awayGoals;
  const yes = kind === 1 ? h > a : kind === 2 ? h === a : kind === 3 ? a > h : kind === 4 ? h + a > line : h > 0 && a > 0;
  return yes ? 1 : 2;
}

/** TerraceOracle.RESOLVE_GRACE: a match or take with no answer this long after it closes counts as void. */
export const RESOLVE_GRACE = 3 * 86400;

export type AnswerLike = { answer: number; kind: number; closeTime?: string | null; fixture?: { state: number; kickoff: string } | null };

/**
 * The answer the contracts act on, as TerraceOracle.outcomeOf works it out: the stored answer, or void
 * once the match is called off or the grace has passed with nothing reported. The indexer only sees
 * stored answers, so without this a timed-out question would read "awaiting result" for ever.
 */
export function effectiveAnswer(q: AnswerLike, now = Date.now() / 1000): number {
  if (q.answer !== 0) return q.answer;
  if (q.fixture?.state === 2) return 3;
  const close = q.kind === 0 ? Number(q.closeTime || q.fixture?.kickoff || 0) : q.fixture?.state === 0 ? Number(q.fixture.kickoff) : 0;
  return close && now > close + RESOLVE_GRACE ? 3 : 0;
}

/*
 * Prices, the sportsbook way. Every Terrace market is a pool: winners split the losers' money
 * in proportion to their stake. A pool still has a price — what one dollar returns if the pool
 * closed now — and we show it as fractional odds. Before a pool has money on both sides we show
 * the bookmakers' opening line instead, and say so in the bet sheet.
 */

const LADDER: [number, number][] = [
  [1, 100], [1, 50], [1, 33], [1, 25], [1, 20], [1, 16], [1, 14], [1, 12], [1, 10], [1, 9], [1, 8], [1, 7], [1, 6], [1, 5],
  [2, 9], [1, 4], [2, 7], [3, 10], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5],
  [5, 6], [10, 11], [1, 1], [21, 20], [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4],
  [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [9, 1],
  [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [50, 1], [66, 1], [100, 1],
];

/** Decimal odds (total return per 1 staked) → the nearest bookmaker fraction, e.g. 1.67 → "4/6". */
export function fractional(decimal: number | null | undefined): string {
  if (!decimal || !Number.isFinite(decimal) || decimal <= 1) return "—";
  const target = decimal - 1;
  let best = LADDER[0];
  for (const f of LADDER) if (Math.abs(f[0] / f[1] - target) < Math.abs(best[0] / best[1] - target)) best = f;
  return best[0] === best[1] ? "Evs" : `${best[0]}/${best[1]}`;
}

/** Pool price for one side: what 1 returns if the pool closed now (null when that side is empty). */
export function poolDecimal(side: number, other: number): number | null {
  if (side <= 0 || other <= 0) return null;
  return (side + other) / side;
}

/** Estimated returns for a new stake on one side, after the creator's fee on profit. All in the same units. */
export function poolReturns(stake: number, side: number, other: number, feeBps = 0): number {
  if (stake <= 0) return 0;
  const gross = (stake * (side + stake + other)) / (side + stake);
  return gross - ((gross - stake) * feeBps) / 10_000;
}

/** Returns at a fixed decimal price (used for opening lines and accumulators). */
export const fixedReturns = (stake: number, decimal: number) => stake * decimal;

/** Neutral weight added to each side of a one-sided pool so its price shows the crowd's lean ($5, in units). */
const PRIOR = 5_000_000;

/**
 * One price for a side: the live pool if both sides have money; a one-sided pool leans the price
 * with a small neutral prior (all the money on Yes → Yes short, No long); else the opening line, else evens.
 */
export function price(pool: { side: number; other: number } | null, opening?: number | null): { decimal: number; source: "pool" | "opening" | "evens" } {
  const p = pool ? poolDecimal(pool.side, pool.other) : null;
  if (p) return { decimal: p, source: "pool" };
  if (pool && pool.side + pool.other > 0) return { decimal: (pool.side + pool.other + 2 * PRIOR) / (pool.side + PRIOR), source: "pool" };
  if (opening && opening > 1) return { decimal: opening, source: "opening" };
  return { decimal: 2, source: "evens" };
}

/** Accumulator price: the product of each leg's decimal price. */
export const combined = (decimals: number[]) => decimals.reduce((a, d) => a * d, 1);

/** Implied chance of a decimal price, for the detail sheet only. */
export const implied = (decimal: number) => Math.round(100 / decimal);

// ---------------------------------------------------------------------------
// Sportsbook formatting — fractional odds, £ money, and copy renames.
// See WIRING-NEEDS.md #1/#2 for the currency + odds product decisions.
// ---------------------------------------------------------------------------

/**
 * Currency symbol. Per product decision (WIRING-NEEDS.md #1) we keep the honest
 * on-chain unit — "$" / USDC — while adopting the sportsbook layout and copy.
 * Set to "£" here if the currency call ever changes.
 */
export const CURRENCY_SYMBOL = "$";

const SYMBOL = CURRENCY_SYMBOL;

/** Money with thousands separators. `money(14.2)` → "£14.20", `money(1240,0)` → "£1,240". */
export function money(amount: number, decimals = 2): string {
  if (!isFinite(amount)) return `${SYMBOL}0.00`;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${withSep}.${frac}` : withSep;
  return `${amount < 0 ? "-" : ""}${SYMBOL}${body}`;
}

/** "Matched £1,240" style — no decimals, comma-grouped. */
export function moneyWhole(amount: number): string {
  return money(amount, 0);
}

// --- Fractional odds -------------------------------------------------------

// Standard UK bookmaker fractional-odds ladder (num/den). We snap to the nearest
// rung so prices read like a real book (7/2, 9/4, 25/1) — not 193/7.
const ODDS_LADDER: [number, number][] = [
  [1, 100], [1, 66], [1, 50], [1, 40], [1, 33], [1, 25], [1, 20], [1, 16], [1, 14], [1, 12],
  [1, 10], [1, 9], [1, 8], [1, 7], [1, 6], [1, 5], [2, 9], [1, 4], [2, 7], [3, 10],
  [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11],
  [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [8, 5],
  [7, 4], [9, 5], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1],
  [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [9, 1], [10, 1],
  [11, 1], [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1], [66, 1], [100, 1],
];

// The ladder's extreme rungs, as implied probabilities: 100/1 (longest) and
// 1/100 (shortest). Prices outside this band are clamped to them.
const LADDER_MIN_PROB = 1 / (100 + 1);   // 100/1  ≈ 0.0099
const LADDER_MAX_PROB = 100 / (100 + 1); // 1/100  ≈ 0.9901

/**
 * Implied probability (0–1] → fractional odds string, snapped to the standard
 * bookmaker ladder, e.g. 0.31 → "9/4". Returns "—" only when there is no price.
 */
export function probToFractional(prob: number | null | undefined): string {
  if (prob == null || !isFinite(prob) || prob <= 0) return "—";
  // Clamp into the ladder's range instead of dashing out. A 100/1 outsider
  // implies the other side is ~certain, and a real book prices that 1/100 — it
  // does not leave the field blank. Only a genuinely absent price gets "—".
  const p = Math.min(Math.max(prob, LADDER_MIN_PROB), LADDER_MAX_PROB);
  const value = (1 - p) / p; // fractional value = profit per unit staked
  let best: [number, number] = ODDS_LADDER[0];
  let bestErr = Infinity;
  for (const [num, den] of ODDS_LADDER) {
    const err = Math.abs(num / den - value);
    if (err < bestErr) { bestErr = err; best = [num, den]; }
  }
  return `${best[0]}/${best[1]}`;
}

/** Implied probability (0–1) → decimal odds (for combined parlay maths). */
export function probToDecimal(prob: number): number {
  if (!isFinite(prob) || prob <= 0) return 1;
  return 1 / prob;
}

/** Decimal odds → fractional string (used for parlay combined odds). */
export function decimalToFractional(dec: number): string {
  if (!isFinite(dec) || dec <= 1) return "—";
  return probToFractional(1 / dec);
}

/** Implied probability as a percent string, e.g. 0.31 → "31%". Detail sheet only. */
export function probToPercent(prob: number | null | undefined): string {
  if (prob == null || !isFinite(prob) || prob <= 0) return "—";
  return `${Math.round(prob * 100)}%`;
}

// --- Copy renames (sportsbook language, design change #3) -------------------

export const COPY = {
  stake: "Stake",
  placeBet: "Place bet",
  betSlip: "Bet slip",
  potentialReturns: "Potential returns",
  matched: "Matched",
  back: "Back",
  fade: "Fade",
  available: "Available balance",
} as const;

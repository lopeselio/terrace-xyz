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

const NICE_DENOMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 25, 33, 50, 100];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Implied probability (0–1) → fractional odds string, e.g. 0.31 → "9/4".
 * Returns "—" for an unpriced / invalid probability.
 */
export function probToFractional(prob: number | null | undefined): string {
  if (prob == null || !isFinite(prob) || prob <= 0 || prob >= 1) return "—";
  // Fractional value = (1 - p) / p  (profit per unit staked).
  const value = (1 - prob) / prob;
  let best = { num: 1, den: 1, err: Infinity };
  for (const den of NICE_DENOMS) {
    const num = Math.max(1, Math.round(value * den));
    const err = Math.abs(num / den - value);
    if (err < best.err - 1e-9) best = { num, den, err };
  }
  const g = gcd(best.num, best.den);
  return `${best.num / g}/${best.den / g}`;
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

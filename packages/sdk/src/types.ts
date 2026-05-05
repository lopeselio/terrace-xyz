import type { Address } from "@solana/kit";

export type MarketStatus = "Open" | "Closed" | "Settled";
export type BadgeTier = "Casual" | "Sharp" | "Legend";

export interface Market {
  address: Address;
  question: string;
  expiry: bigint;
  creator: Address;
  outcome: number | null;
  totalVolume: bigint;
  yesVolume: bigint;
  noVolume: bigint;
  vault: Address;
  status: MarketStatus;
  creatorFeeBps: number;
  /** Switchboard Function oracle pubkey. null = creator-only settlement. */
  oracle: Address | null;
  /** Private group market — positions hidden (Light Protocol Phase 4). */
  isPrivate: boolean;
  /** Flash market — very short expiry for in-match micro-markets. */
  isFlash: boolean;
  nonce: bigint;
  bump: number;
}

export interface Bet {
  address: Address;
  market: Address;
  bettor: Address;
  outcome: number;
  amount: bigint;
  claimed: boolean;
  resultRecorded: boolean;
  bump: number;
}

export interface Reputation {
  address: Address;
  owner: Address;
  totalBets: number;
  winningBets: number;
  winRateBps: number;
  currentStreak: number;
  badgeTier: BadgeTier;
  bump: number;
}

export interface CreateMarketParams {
  question: string;
  expiry: bigint;
  /** Creator fee in basis points (0–500). Defaults to 0. */
  creatorFeeBps?: number;
  nonce: bigint;
  usdcMint: Address;
  /** Switchboard Function pubkey allowed to call settle_market_oracle. null = creator-only. */
  oracle?: Address | null;
  isPrivate?: boolean;
  isFlash?: boolean;
}

export interface SettleMarketOracleParams {
  market: Address;
  winningOutcome: 0 | 1;
}

export type MatchupStatus = "Pending" | "Accepted" | "Settled" | "Declined";

export interface Matchup {
  address: Address;
  challenger: Address;
  opponent: Address;
  market: Address;
  challengerOutcome: 0 | 1;
  stakeUsdc: bigint;
  status: MatchupStatus;
  nonce: bigint;
  bump: number;
}

export interface CreateMatchupParams {
  market: Address;
  opponent: Address;
  challengerOutcome: 0 | 1;
  stakeUsdc: bigint;
  nonce: bigint;
  usdcMint: Address;
}

export interface AcceptMatchupParams {
  matchup: Address;
  usdcMint: Address;
}

export interface SettleMatchupParams {
  matchup: Address;
  market: Address;
  challenger: Address;
  opponent: Address;
  usdcMint: Address;
}

export interface DeclineMatchupParams {
  matchup: Address;
  challenger: Address;
  usdcMint: Address;
}

export interface PlaceBetParams {
  market: Address;
  outcome: 0 | 1;
  amount: bigint;
  usdcMint: Address;
}

export interface SettleMarketParams {
  market: Address;
  winningOutcome: 0 | 1;
}

export interface ClaimWinningsParams {
  market: Address;
  usdcMint: Address;
}

export interface RecordLossParams {
  market: Address;
}

export interface ParlayLeg {
  market: Address;
  outcome: 0 | 1;
}

export type ParlayStatus = "Open" | "Won" | "Lost" | "Claimed" | "Cancelled";

export interface Parlay {
  address: Address;
  creator: Address;
  legs: ParlayLeg[];
  stakeUsdc: bigint;
  status: ParlayStatus;
  nonce: bigint;
  bump: number;
}

export interface CreateParlayParams {
  legs: ParlayLeg[];
  stakeUsdc: bigint;
  nonce: bigint;
  usdcMint: Address;
}

export interface SettleParlayParams {
  parlay: Address;
  /** Market accounts in the same order as the parlay legs. */
  marketAccounts: Address[];
}

export interface ClaimParlayParams {
  parlay: Address;
  usdcMint: Address;
}

export const USDC_DEVNET_MINT =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address;

export const MIN_BET_LAMPORTS = 100_000n; // 0.1 USDC (6 dp)

import type { Address } from "@solana/kit";

export type MarketStatus = "Open" | "Closed" | "Settled";

export interface Market {
  address: Address;
  question: string;
  expiry: bigint;
  creator: Address;
  outcome: number | null;
  totalVolume: bigint;
  vault: Address;
  status: MarketStatus;
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
  bump: number;
}

export interface CreateMarketParams {
  question: string;
  expiry: bigint;
  nonce: bigint;
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

export const USDC_DEVNET_MINT =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address;

export const MIN_BET_LAMPORTS = 100_000n; // 0.1 USDC (6 dp)

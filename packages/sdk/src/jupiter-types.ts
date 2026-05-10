// Jupiter Prediction Market API — response types
// API base: https://prediction-market-api.jup.ag/api/v1
// Also accessible at: https://api.jup.ag/prediction/v1

export interface JupiterMarketPricing {
  /** Integer micro-units: divide by 1_000_000 to get 0–1 probability */
  buyYesPriceUsd: number;
  buyNoPriceUsd: number;
  sellYesPriceUsd: number;
  sellNoPriceUsd: number;
  /** Market-level volume (micro-USDC) */
  volume?: number;
}

export interface JupiterEventMarket {
  /** e.g. "POLY-422415-0" */
  marketId: string;
  /** Outcome title e.g. "Arsenal FC", "Draw" */
  title: string;
  pricing: JupiterMarketPricing;
  /** "open" | "closed" | "resolved" */
  status: string;
  /** Unix timestamp in seconds */
  closeTime?: number;
  outcomePrices?: string[];
  sportsMarketType?: string;
}

export interface JupiterEvent {
  eventId: string;
  metadata: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
  };
  /** Total volume in micro-USDC */
  volumeUsd?: number;
  volume24hr?: number;
  category: string;
  subcategory?: string;
  tags?: string[];
  markets?: JupiterEventMarket[];
}

export interface JupiterPosition {
  pubkey: string;
  marketId: string;
  marketMetadata: {
    title: string;
    eventTitle?: string;
  };
  isYes: boolean;
  contracts: string;
  avgPriceUsd: string;
  currentValueUsd?: string;
  pnlUsd?: string;
  /** "open" | "closed" | "claimed" */
  status: string;
}

export interface JupiterOrder {
  pubkey: string;
  marketId: string;
  isYes: boolean;
  isBuy: boolean;
  contracts: string;
  priceUsd: string;
  status: string;
  createdAt?: string;
}

export interface JupiterProfile {
  ownerPubkey: string;
  totalPnlUsd?: string;
  winRate?: number;
  totalTrades?: number;
  volume?: string;
  rank?: number;
}

export interface JupiterLeaderboardEntry {
  ownerPubkey: string;
  rank: number;
  pnlUsd?: string;
  winRate?: number;
  volume?: string;
}

export interface JupiterOrderbookLevel {
  price: string;
  size: string;
}

export interface JupiterOrderbook {
  bids: JupiterOrderbookLevel[];
  asks: JupiterOrderbookLevel[];
}

// ---------------------------------------------------------------------------
// Unified market type — normalises both native Terrace and Jupiter markets
// ---------------------------------------------------------------------------

export type MarketSource = "native" | "jupiter";

export interface UnifiedMarket {
  source: MarketSource;
  /** PDA address (native) or Jupiter marketId (jupiter) */
  id: string;
  /** For Jupiter markets: the individual outcome title e.g. "Sunderland", "Draw", "Brighton".
   *  For native markets: the full question text. */
  question: string;
  /** 0–1 probability, e.g. 0.62 */
  yesPrice: number;
  noPrice: number;
  /** Total volume in USDC (human units, e.g. 1500.00) */
  totalVolumeUsdc: number;
  expiry: Date | null;
  status: "Open" | "Settled" | "Closed";
  /** Set for Jupiter markets — needed to build orders */
  jupiterMarketId?: string;
  jupiterEventId?: string;
  /** Parent event title, e.g. "Sunderland vs Brighton" — used for match grouping */
  jupiterEventTitle?: string;
  /** Native Terrace markets only */
  nativeMarketAddress?: string;
  isPrivate?: boolean;
  isFlash?: boolean;
}

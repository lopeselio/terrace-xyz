import type {
  JupiterEvent,
  JupiterEventMarket,
  JupiterPosition,
  JupiterOrder,
  JupiterOrderbook,
  JupiterProfile,
  JupiterLeaderboardEntry,
  UnifiedMarket,
} from "./jupiter-types";

// Confirmed from OpenAPI spec at prediction-market-api.jup.ag/openapi.json
const JUPITER_BASE = "https://prediction-market-api.jup.ag/api/v1";

export class JupiterMarketsClient {
  constructor(private readonly apiKey: string) {}

  private get headers(): HeadersInit {
    return {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${JUPITER_BASE}${path}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Jupiter API ${path} → ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${JUPITER_BASE}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jupiter API POST ${path} → ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async del<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${JUPITER_BASE}${path}`, {
      method: "DELETE",
      headers: this.headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Jupiter API DELETE ${path} → ${res.status} ${res.statusText}`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /** Fetch active sports events, optionally filtered to a football search term. */
  async getSportsEvents(query?: string): Promise<JupiterEvent[]> {
    if (query) {
      const json = await this.get<{ data: JupiterEvent[] }>(
        `/events/search?query=${encodeURIComponent(query)}&category=sports`
      );
      return json.data ?? [];
    }
    const json = await this.get<{ data: JupiterEvent[] }>(
      "/events?category=sports&includeMarkets=true"
    );
    return json.data ?? [];
  }

  async getEvent(eventId: string): Promise<JupiterEvent> {
    return this.get<JupiterEvent>(`/events/${eventId}`);
  }

  async getEventMarkets(eventId: string): Promise<JupiterEventMarket[]> {
    const json = await this.get<{ data: JupiterEventMarket[] }>(
      `/events/${eventId}/markets`
    );
    return json.data ?? [];
  }

  async getSuggestedEvents(category = "sports"): Promise<JupiterEvent[]> {
    const json = await this.get<{ data: JupiterEvent[] }>(
      `/events/suggested?category=${category}`
    );
    return json.data ?? [];
  }

  /** Returns events suggested based on the user's historical order activity. */
  async getPersonalisedSuggestions(ownerPubkey: string): Promise<JupiterEvent[]> {
    const json = await this.get<{ data: JupiterEvent[] }>(
      `/events/suggested/${ownerPubkey}`
    );
    return json.data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Markets
  // ---------------------------------------------------------------------------

  async getMarket(marketId: string): Promise<JupiterEventMarket> {
    return this.get<JupiterEventMarket>(`/markets/${marketId}`);
  }

  async getOrderbook(marketId: string): Promise<JupiterOrderbook> {
    return this.get<JupiterOrderbook>(`/orderbook/${marketId}`);
  }

  // ---------------------------------------------------------------------------
  // Orders — returns base64 transaction; caller must sign then call execute()
  // ---------------------------------------------------------------------------

  async buildBuyOrder(params: {
    ownerPubkey: string;
    marketId: string;
    isYes: boolean;
    /** USDC in human units, e.g. 2.0 */
    depositAmountUsdc: number;
    /** Defaults to USDC mainnet mint */
    depositMint?: string;
  }): Promise<{ transaction: string }> {
    return this.post("/orders", {
      ownerPubkey: params.ownerPubkey,
      marketId: params.marketId,
      isYes: params.isYes,
      isBuy: true,
      depositAmount: String(Math.round(params.depositAmountUsdc * 1_000_000)),
      depositMint:
        params.depositMint ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
  }

  async buildSellOrder(params: {
    ownerPubkey: string;
    positionPubkey: string;
    /** Number of contracts to sell (as string to avoid precision loss) */
    contracts: string;
  }): Promise<{ transaction: string }> {
    return this.post("/orders", {
      ownerPubkey: params.ownerPubkey,
      positionPubkey: params.positionPubkey,
      isBuy: false,
      contracts: params.contracts,
    });
  }

  async closeAllOrders(ownerPubkey: string): Promise<{ transaction: string }> {
    return this.del("/orders/close-all", { ownerPubkey });
  }

  async getOrderStatus(orderPubkey: string) {
    return this.get(`/orders/status/${orderPubkey}`);
  }

  async getUserOrders(ownerPubkey: string): Promise<JupiterOrder[]> {
    const json = await this.get<{ data: JupiterOrder[] }>(
      `/orders?ownerPubkey=${ownerPubkey}`
    );
    return json.data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Execution — submit a wallet-signed base64 transaction
  // ---------------------------------------------------------------------------

  async execute(signedTxBase64: string): Promise<{ signature: string }> {
    return this.post("/execute", { transaction: signedTxBase64 });
  }

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------

  async getUserPositions(ownerPubkey: string): Promise<JupiterPosition[]> {
    const json = await this.get<{ data: JupiterPosition[] }>(
      `/positions?ownerPubkey=${ownerPubkey}`
    );
    return json.data ?? [];
  }

  /** Returns a base64 tx to claim payout for a winning position. */
  async buildClaimTx(
    positionPubkey: string,
    ownerPubkey: string
  ): Promise<{ transaction: string }> {
    return this.post(`/positions/${positionPubkey}/claim`, { ownerPubkey });
  }

  async closeAllPositions(ownerPubkey: string): Promise<{ transaction: string }> {
    return this.del("/positions", { ownerPubkey });
  }

  // ---------------------------------------------------------------------------
  // Profiles & social
  // ---------------------------------------------------------------------------

  async getUserProfile(ownerPubkey: string): Promise<JupiterProfile> {
    return this.get<JupiterProfile>(`/profiles/${ownerPubkey}`);
  }

  async getUserPnlHistory(ownerPubkey: string) {
    return this.get(`/profiles/${ownerPubkey}/pnl-history`);
  }

  async getLeaderboard(
    period: "daily" | "weekly" | "alltime" = "weekly"
  ): Promise<JupiterLeaderboardEntry[]> {
    const json = await this.get<{ data: JupiterLeaderboardEntry[] }>(
      `/leaderboards?period=${period}`
    );
    return json.data ?? [];
  }

  async followUser(
    targetPubkey: string,
    followerPubkey: string
  ): Promise<void> {
    await this.post(`/follow/${targetPubkey}`, { ownerPubkey: followerPubkey });
  }

  async unfollowUser(
    targetPubkey: string,
    followerPubkey: string
  ): Promise<void> {
    await this.del(`/unfollow/${targetPubkey}`, { ownerPubkey: followerPubkey });
  }

  async getFollowing(ownerPubkey: string): Promise<JupiterProfile[]> {
    const json = await this.get<{ data: JupiterProfile[] }>(
      `/following/${ownerPubkey}`
    );
    return json.data ?? [];
  }

  async getFollowers(ownerPubkey: string): Promise<JupiterProfile[]> {
    const json = await this.get<{ data: JupiterProfile[] }>(
      `/followers/${ownerPubkey}`
    );
    return json.data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Normalise Jupiter events → UnifiedMarket[]
  // ---------------------------------------------------------------------------

  static normaliseEvents(events: JupiterEvent[]): UnifiedMarket[] {
    const markets: UnifiedMarket[] = [];

    for (const event of events) {
      for (const market of event.markets ?? []) {
        const yesPrice = parseFloat(market.pricing?.buyYesPriceUsd ?? "0.5");
        const noPrice = parseFloat(market.pricing?.buyNoPriceUsd ?? "0.5");
        const totalVolumeUsdc =
          parseFloat(market.totalVolume ?? "0") / 1_000_000;

        let status: UnifiedMarket["status"] = "Open";
        if (market.status === "resolved") status = "Settled";
        else if (market.status === "closed") status = "Closed";

        markets.push({
          source: "jupiter",
          id: market.id,
          question: market.metadata?.title ?? event.title,
          yesPrice,
          noPrice,
          totalVolumeUsdc,
          expiry: market.endDate ? new Date(market.endDate) : null,
          status,
          jupiterMarketId: market.id,
          jupiterEventId: event.id,
          jupiterEventTitle: event.title,
        });
      }
    }

    return markets;
  }
}

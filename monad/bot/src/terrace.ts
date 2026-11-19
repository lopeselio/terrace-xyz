/*
 * The bot's view of Terrace: the same public app endpoints the PWA uses (match list, take compiler,
 * indexer proxy). Read-only; nothing here can move money.
 */
import type { Fixture } from "./parse";
import type { Snapshot } from "./fanout";

export type Match = Fixture & { elapsed: number | null; goals: { home: number | null; away: number | null } };
export type Compiled = { spec: string; reading: string; closeTime: number; ai?: "busy" | "offline" };

export type IndexedMarket = {
  id: string;
  createdAt: string;
  creator: string;
  yesPool: string;
  noPool: string;
  bettors: number;
  take: { id: string } | null;
  question: { id: string; text: string; spec: string; answer: number; closeTime: string; fixture: { id: string } | null };
};
export type IndexedBet = { bettor: string; side: number; stake: string; result: number | null; market: { id: string } };

export class Terrace {
  constructor(
    public url: string,
    private fetcher: typeof fetch = fetch,
  ) {
    this.url = url.replace(/\/+$/, "");
  }

  async matches(): Promise<Match[]> {
    const r = await this.fetcher(`${this.url}/api/matches`);
    if (!r.ok) throw new Error(`matches ${r.status}`);
    const body = (await r.json()) as Match[] | { matches: Match[] };
    return Array.isArray(body) ? body : body.matches;
  }

  /** The app's own take compiler: rule, plain-English reading and lock time. */
  async compile(text: string, fixtureId: number): Promise<Compiled | { error: string }> {
    const r = await this.fetcher(`${this.url}/api/compile-take`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, fixtureId }) });
    const body = (await r.json().catch(() => ({ error: "server" }))) as Compiled & { error?: string };
    return !r.ok || body.error ? { error: body.error ?? "server" } : body;
  }

  async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const r = await this.fetcher(`${this.url}/api/indexer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
    const body = (await r.json().catch(() => ({}))) as { data?: T; error?: string; errors?: { message: string }[] };
    if (!r.ok || !body.data) throw new Error(`indexer: ${body.error ?? body.errors?.[0]?.message ?? r.status}`);
    return body.data;
  }

  /** Take markets listed since a time on some fixtures: used to spot the market a group take opened. */
  async takeMarketsSince(fixtureIds: number[], sinceUnix: number): Promise<IndexedMarket[]> {
    const d = await this.gql<{ Market: IndexedMarket[] }>(
      `query($f: [String!], $t: numeric!) { Market(where: { question: { fixture_id: { _in: $f } }, take_id: { _is_null: false }, createdAt: { _gte: $t } }, order_by: { createdAt: asc }, limit: 200) { ${MARKET} } }`,
      { f: fixtureIds.map(String), t: sinceUnix },
    );
    return d.Market;
  }

  async marketsByIds(ids: string[]): Promise<IndexedMarket[]> {
    if (!ids.length) return [];
    const d = await this.gql<{ Market: IndexedMarket[] }>(`query($ids: [String!]) { Market(where: { id: { _in: $ids } }) { ${MARKET} } }`, { ids });
    return d.Market;
  }

  async betsOn(marketIds: string[]): Promise<IndexedBet[]> {
    if (!marketIds.length) return [];
    const d = await this.gql<{ Bet: IndexedBet[] }>(`query($ids: [String!]) { Bet(where: { market_id: { _in: $ids } }, limit: 1000) { bettor side stake result market { id } } }`, { ids: marketIds });
    return d.Bet;
  }

  async players(addresses: string[]): Promise<{ id: string; points: string; wins: number; results: number }[]> {
    if (!addresses.length) return [];
    const d = await this.gql<{ Player: { id: string; points: string; wins: number; results: number }[] }>(
      `query($ids: [String!]) { Player(where: { id: { _in: $ids } }) { id points wins results } }`,
      { ids: addresses.map((a) => a.toLowerCase()) },
    );
    return d.Player;
  }

  /** Live snapshots for the fan-out hub: one request for every watched fixture. */
  async snapshots(ids: number[]): Promise<Snapshot[]> {
    const want = new Set(ids);
    return (await this.matches())
      .filter((m) => want.has(m.id))
      .map((m) => ({ id: m.id, status: m.status, elapsed: m.elapsed, home: m.home.name, away: m.away.name, goals: m.goals }));
  }
}

const MARKET = `id createdAt creator yesPool noPool bettors take { id } question { id text spec answer closeTime fixture { id } }`;

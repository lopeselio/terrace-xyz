// API-Football (api-sports.io) client for live fixtures + match predictions.
//
// Tier model:
//   - Free tier: 100 requests/day, full live + scheduled fixtures including
//     EPL / La Liga / UCL. No credit card required.
//   - Direct route uses the "x-apisports-key" header against
//     https://v3.football.api-sports.io. The RapidAPI route exists but adds a
//     layer of dependency we don't need.
//
// The shim is intentionally narrow: enrich Jupiter/Polymarket cards with
// live score + status, and feed AI insights with real scoreline context.

const API_BASE = "https://v3.football.api-sports.io";

export interface ApiFootballTeam {
  id: number;
  name: string;
  logo: string;
}

export interface LiveFixture {
  fixtureId: number;
  /** ISO kickoff timestamp */
  kickoff: string;
  /** "NS" not-started, "1H"/"2H" in-play, "HT" halftime, "FT" full-time, etc. */
  statusShort: string;
  statusLong: string;
  /** Minutes elapsed (null when not started or finished) */
  elapsed: number | null;
  homeScore: number | null;
  awayScore: number | null;
  league: { id: number; name: string; country: string; logo: string };
  home: ApiFootballTeam;
  away: ApiFootballTeam;
}

export interface FixturePrediction {
  /** Win probabilities as fractions in [0, 1] */
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Short advice string from the predictions endpoint */
  advice?: string;
}

/**
 * Strip common suffixes / lower-case / collapse whitespace so team names from
 * different providers can be matched. "Manchester United FC" → "manchester united".
 */
function normaliseTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|afc|sc|cf|ac|sa|sk)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(name: string): string[] {
  return normaliseTeam(name).split(" ").filter((t) => t.length >= 3);
}

/** Loose match — any non-trivial token from `query` appears in `candidate`. */
function fuzzyTeamMatch(query: string, candidate: string): boolean {
  const queryTokens = tokensOf(query);
  if (queryTokens.length === 0) return false;
  const candNorm = normaliseTeam(candidate);
  return queryTokens.some((t) => candNorm.includes(t));
}

export interface ApiFootballOptions {
  /**
   * Direct api-football key. Omit when `baseUrl` points at a proxy that holds
   * the key server-side — shipping it to devices means each install burns its
   * own share of a 100/day allowance.
   */
  apiKey?: string;
  /**
   * Override the upstream. Point this at the notifications worker's /football
   * route to share one key and one cache across every device.
   */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ApiFootballClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiFootballOptions | string = {}, legacyFetch?: typeof fetch) {
    // A bare key is still accepted so the direct-to-provider path reads the
    // same as it always did.
    const opts: ApiFootballOptions =
      typeof options === "string" ? { apiKey: options, fetchImpl: legacyFetch } : options;
    this.apiKey = opts.apiKey ?? "";
    this.baseUrl = (opts.baseUrl ?? API_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** True when requests go through a proxy that supplies the key. */
  private get proxied(): boolean {
    return this.baseUrl !== API_BASE;
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    if (!this.apiKey && !this.proxied) throw new Error("ApiFootballClient: missing API key");
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    const res = await this.fetchImpl(url, {
      headers: this.proxied ? {} : { "x-apisports-key": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`ApiFootball ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    const json = (await res.json()) as { response: T; errors?: unknown };
    // API-Sports returns 200 with an "errors" object on validation failures.
    if (json.errors && Array.isArray(json.errors) ? json.errors.length > 0 : json.errors && Object.keys(json.errors as object).length > 0) {
      throw new Error(`ApiFootball error: ${JSON.stringify(json.errors)}`);
    }
    return json.response;
  }

  async getLiveFixtures(): Promise<LiveFixture[]> {
    const raw = await this.request<RawFixture[]>("/fixtures", { live: "all" });
    return raw.map(toLiveFixture);
  }

  async getFixturesByDate(date: string): Promise<LiveFixture[]> {
    const raw = await this.request<RawFixture[]>("/fixtures", { date });
    return raw.map(toLiveFixture);
  }

  /**
   * Fixtures for several dates at once — the matchday board's seed.
   *
   * Deliberately date-keyed rather than `league + season + from/to`, which
   * would be the obvious query and is rejected on the free plan: seasons are
   * capped at 2024 there, as are the `next` and multi-day range parameters.
   * A bare `date=` works for the current season, returns every competition for
   * that day, and callers filter to the leagues they care about — one request
   * per day covers all of them rather than one per league.
   *
   * Dates are YYYY-MM-DD. A day the plan refuses is skipped, not fatal: the
   * free tier only serves today ±1, so a wider window degrades to what it can
   * actually see instead of failing whole.
   */
  async getFixturesForDates(dates: string[]): Promise<LiveFixture[]> {
    const results = await Promise.allSettled(dates.map((d) => this.getFixturesByDate(d)));
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  /**
   * Find a fixture by home + away team names within a ±48h window around the
   * given reference date (defaults to today). Order-sensitive — pass home/away
   * as Jupiter provides them so we don't mis-attach a reversed fixture.
   */
  async findFixtureByTeams(
    home: string,
    away: string,
    referenceDate: Date = new Date(),
  ): Promise<LiveFixture | null> {
    const days = [-1, 0, 1].map((d) => {
      const dt = new Date(referenceDate);
      dt.setUTCDate(dt.getUTCDate() + d);
      return dt.toISOString().slice(0, 10);
    });

    const fixturesPerDay = await Promise.all(days.map((d) => this.getFixturesByDate(d)));
    const all = fixturesPerDay.flat();

    // Exact-order match first, then fall back to either-order (handles Polymarket
    // sometimes listing teams in reverse vs. the data feed)
    const ordered = all.find(
      (f) => fuzzyTeamMatch(home, f.home.name) && fuzzyTeamMatch(away, f.away.name),
    );
    if (ordered) return ordered;
    const reversed = all.find(
      (f) => fuzzyTeamMatch(home, f.away.name) && fuzzyTeamMatch(away, f.home.name),
    );
    return reversed ?? null;
  }

  async getPrediction(fixtureId: number): Promise<FixturePrediction | null> {
    const raw = await this.request<RawPrediction[]>("/predictions", { fixture: fixtureId });
    const p = raw[0];
    if (!p?.predictions?.percent) return null;
    const pct = p.predictions.percent;
    return {
      homeWin: parsePct(pct.home),
      draw: parsePct(pct.draw),
      awayWin: parsePct(pct.away),
      advice: p.predictions.advice,
    };
  }
}

// ---------------------------------------------------------------------------
// Raw API shapes (only what we need)
// ---------------------------------------------------------------------------

interface RawFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
  };
  league: { id: number; name: string; country: string; logo: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

interface RawPrediction {
  predictions?: {
    percent?: { home?: string; draw?: string; away?: string };
    advice?: string;
  };
}

function toLiveFixture(r: RawFixture): LiveFixture {
  return {
    fixtureId: r.fixture.id,
    kickoff: r.fixture.date,
    statusShort: r.fixture.status.short,
    statusLong: r.fixture.status.long,
    elapsed: r.fixture.status.elapsed,
    homeScore: r.goals.home,
    awayScore: r.goals.away,
    league: r.league,
    home: r.teams.home,
    away: r.teams.away,
  };
}

function parsePct(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace("%", ""));
  return Number.isFinite(n) ? n / 100 : 0;
}

/** "1H"/"2H"/"ET"/"LIVE" — match is currently in play. */
export function isFixtureLive(f: { statusShort: string }): boolean {
  return ["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(f.statusShort);
}

/** Status is one of the "match has ended" codes. */
export function isFixtureFinished(f: { statusShort: string }): boolean {
  return ["FT", "AET", "PEN"].includes(f.statusShort);
}

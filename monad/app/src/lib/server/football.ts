import "server-only";

/** API-Football, server side only (the key never reaches the browser). Short in-memory cache per instance. */
const BASE = "https://v3.football.api-sports.io";
const cache = new Map<string, { at: number; data: unknown }>();

export async function football<T>(path: string, ttlMs = 30_000): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" }, cache: "no-store" });
    if (!res.ok) throw new Error(`football API ${res.status}`);
    const body = (await res.json()) as { response: T; errors: unknown };
    // Rate limits and outages come back as 200 with `errors` set and an empty response: never cache those.
    const errors = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
    if (errors) throw new Error(`football API: ${JSON.stringify(body.errors)}`);
    cache.set(path, { at: Date.now(), data: body.response });
    return body.response;
  } catch (e) {
    if (hit) return hit.data as T; // serve the last good answer rather than an empty screen
    throw e;
  }
}

export type Team = { id: number; name: string; logo: string };
export type MatchInfo = {
  id: number;
  kickoff: number;
  status: string; // NS, 1H, HT, 2H, FT...
  elapsed: number | null;
  league: string;
  leagueId: number;
  leagueLogo: string;
  home: Team;
  away: Team;
  goals: { home: number | null; away: number | null };
};

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number; name: string; logo: string };
  teams: { home: Team; away: Team };
  goals: { home: number | null; away: number | null };
};

/** Names fans know, where API-Football's are ambiguous (two "Serie A"s) or long. */
const LEAGUE_NAMES: Record<number, string> = {
  71: "Brasileirão", 128: "Liga Argentina", 262: "Liga MX", 253: "MLS", 307: "Saudi Pro League",
  179: "Scottish Premiership", 17: "AFC Champions League", 848: "Conference League", 2: "Champions League", 3: "Europa League",
};

/** Per-match cache: finished matches never change, upcoming ones rarely, only live ones need fresh data. */
const byId = new Map<number, { at: number; m: MatchInfo }>();
const FINAL = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);

function stale(e: { at: number; m: MatchInfo } | undefined, liveTtlMs: number, now: number) {
  if (!e) return true;
  const age = now - e.at;
  if (FINAL.has(e.m.status)) return false;
  if (e.m.status === "NS" || e.m.status === "TBD" || e.m.status === "PST") {
    // Upcoming: every 10 minutes, but every live tick once kick-off is near or past.
    return e.m.kickoff * 1000 - now < 5 * 60_000 ? age > liveTtlMs : age > 10 * 60_000;
  }
  return age > liveTtlMs;
}

export async function matches(ids: readonly (number | bigint)[], ttlMs = 30_000): Promise<MatchInfo[]> {
  const now = Date.now();
  const want = ids.map(Number);
  const due = want.filter((id) => stale(byId.get(id), ttlMs, now));
  for (let i = 0; i < due.length; i += 20) {
    const batch = due.slice(i, i + 20).join("-");
    try {
      const rows = await football<ApiFixture[]>(`/fixtures?ids=${batch}`, 0);
      for (const f of rows) {
        byId.set(f.fixture.id, {
          at: now,
          m: {
            id: f.fixture.id,
            kickoff: Math.floor(Date.parse(f.fixture.date) / 1000),
            status: f.fixture.status.short,
            elapsed: f.fixture.status.elapsed,
            league: LEAGUE_NAMES[f.league.id] ?? f.league.name,
            leagueId: f.league.id,
            leagueLogo: f.league.logo,
            home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
            away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
            goals: f.goals,
          },
        });
      }
    } catch {} // keep serving what we have
  }
  const out = want.map((id) => byId.get(id)?.m).filter((m): m is MatchInfo => !!m);
  return out.sort((a, b) => a.kickoff - b.kickoff);
}

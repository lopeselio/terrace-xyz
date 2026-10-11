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
  home: Team;
  away: Team;
  goals: { home: number | null; away: number | null };
};

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { name: string };
  teams: { home: Team; away: Team };
  goals: { home: number | null; away: number | null };
};

export async function matches(ids: readonly (number | bigint)[], ttlMs = 30_000): Promise<MatchInfo[]> {
  const out: MatchInfo[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20).join("-");
    const rows = await football<ApiFixture[]>(`/fixtures?ids=${batch}`, ttlMs);
    for (const f of rows) {
      out.push({
        id: f.fixture.id,
        kickoff: Math.floor(Date.parse(f.fixture.date) / 1000),
        status: f.fixture.status.short,
        elapsed: f.fixture.status.elapsed,
        league: f.league.name,
        home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
        away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
        goals: f.goals,
      });
    }
  }
  return out.sort((a, b) => a.kickoff - b.kickoff);
}

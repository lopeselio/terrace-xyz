import { NextResponse } from "next/server";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { football } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

/*
 * A matchday brief for one club, FPL-helper style: their next match (and whether it's on Terrace),
 * the bookmakers' prices, the data provider's prediction, form, league position and head-to-head.
 */
type Team = { id: number; name: string; logo: string };
type Fixture = {
  fixture: { id: number; date: string; venue?: { name?: string } };
  league: { id: number; name: string; logo: string; season: number };
  teams: { home: Team; away: Team };
  goals: { home: number | null; away: number | null };
};
type Prediction = {
  predictions: { advice: string; percent: { home: string; draw: string; away: string }; winner: { name: string | null; comment: string | null } | null };
  teams: { home: { league: { form: string | null } }; away: { league: { form: string | null } } };
  comparison: Record<string, { home: string; away: string }>;
  h2h: Fixture[];
};
type Odds = { bookmakers: { bets: { id: number; values: { value: string; odd: string }[] }[] }[] };
type Standing = { league: { standings: { rank: number; team: Team; points: number; all: { played: number } }[][] } };

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : undefined);

export async function GET(req: Request) {
  const team = Number(new URL(req.url).searchParams.get("team"));
  if (!team) return NextResponse.json({ error: "team required" }, { status: 400 });
  try {
    const [next] = await football<Fixture[]>(`/fixtures?team=${team}&next=1`, 30 * 60_000);
    if (!next) return NextResponse.json({ next: null });
    const id = next.fixture.id;
    const onTerrace = (await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" })).some((x) => Number(x) === id);

    const [pred, odds, table] = await Promise.all([
      football<Prediction[]>(`/predictions?fixture=${id}`, 3 * 3600_000).then((r) => r[0]).catch(() => undefined),
      football<Odds[]>(`/odds?fixture=${id}&bet=1`, 3600_000).then((r) => r[0]).catch(() => undefined),
      football<Standing[]>(`/standings?league=${next.league.id}&season=${next.league.season}`, 6 * 3600_000).then((r) => r[0]).catch(() => undefined),
    ]);

    const price = (v: string) =>
      median((odds?.bookmakers ?? []).flatMap((b) => b.bets.filter((x) => x.id === 1).flatMap((x) => x.values.filter((y) => y.value === v).map((y) => Number(y.odd)))));
    const rows = table?.league.standings.flat() ?? [];
    const pos = (t: number) => {
      const r = rows.find((x) => x.team.id === t);
      return r ? { rank: r.rank, points: r.points, played: r.all.played, of: rows.length } : null;
    };
    const isHome = next.teams.home.id === team;

    return NextResponse.json(
      {
        next: {
          id,
          kickoff: Math.floor(Date.parse(next.fixture.date) / 1000),
          venue: next.fixture.venue?.name ?? null,
          league: { id: next.league.id, name: next.league.name, logo: next.league.logo },
          home: next.teams.home,
          away: next.teams.away,
          isHome,
          onTerrace,
        },
        odds: odds ? { home: price("Home"), draw: price("Draw"), away: price("Away") } : null,
        prediction: pred
          ? {
              advice: pred.predictions.advice,
              percent: pred.predictions.percent,
              form: { home: (pred.teams.home.league.form ?? "").slice(-5), away: (pred.teams.away.league.form ?? "").slice(-5) },
              comparison: pred.comparison,
              h2h: pred.h2h.slice(0, 5).map((f) => ({
                date: f.fixture.date.slice(0, 10),
                home: f.teams.home.name,
                away: f.teams.away.name,
                score: `${f.goals.home ?? "-"}–${f.goals.away ?? "-"}`,
              })),
            }
          : null,
        table: { home: pos(next.teams.home.id), away: pos(next.teams.away.id) },
      },
      { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

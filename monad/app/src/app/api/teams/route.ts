import { NextResponse } from "next/server";
import { football } from "@/lib/server/football";

/** Clubs in a league, for the favourite-team picker. Cached for a day. */
type ApiTeam = { team: { id: number; name: string; logo: string } };

export async function GET(req: Request) {
  const league = Number(new URL(req.url).searchParams.get("league"));
  if (!league) return NextResponse.json({ error: "league required" }, { status: 400 });
  try {
    const rows = await football<ApiTeam[]>(`/teams?league=${league}&season=2026`, 24 * 3600_000);
    const teams = rows.map((r) => r.team).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(teams, { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=172800" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

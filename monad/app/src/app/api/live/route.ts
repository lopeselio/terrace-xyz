import { NextResponse } from "next/server";
import { asItStands, parseRule, type FixtureDetail } from "@shared/rules";
import { football } from "@/lib/server/football";

/*
 * Game day: how a fan's custom takes read right now. The browser sends the takes it holds on matches
 * in play; each match's full detail (events, stats, lineups) is fetched once and shared for 30 seconds,
 * then every rule is read with the same code CRE settles with. A reading, never a result.
 */
const MAX_MATCHES = 8;

export async function POST(req: Request) {
  const { takes } = (await req.json().catch(() => ({}))) as { takes?: { id: string; fixture: number; spec: string }[] };
  if (!Array.isArray(takes)) return NextResponse.json({ error: "takes required" }, { status: 400 });
  const fixtures = [...new Set(takes.map((t) => Number(t.fixture)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_MATCHES);
  const detail = new Map<number, FixtureDetail>();
  await Promise.all(
    fixtures.map(async (id) => {
      const rows = await football<FixtureDetail[]>(`/fixtures?id=${id}`, 30_000).catch(() => []);
      if (rows[0]) detail.set(id, rows[0]);
    }),
  );
  const out: Record<string, "YES" | "NO" | null> = {};
  for (const t of takes.slice(0, 40)) {
    const f = detail.get(Number(t.fixture));
    const rule = typeof t.spec === "string" ? parseRule(t.spec) : null;
    out[t.id] = f && rule ? asItStands(rule, f) : null;
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

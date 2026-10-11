import { NextResponse } from "next/server";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { football } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

/** Bookmakers' opening lines (decimal, median across books) for every scheduled match. */
export type OpeningLine = { home?: number; draw?: number; away?: number; over25?: number; under25?: number; bttsYes?: number; bttsNo?: number };

type ApiOdds = { fixture: { id: number }; bookmakers: { bets: { id: number; values: { value: string; odd: string }[] }[] }[] };

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 100) / 100;
};

export async function GET() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const out: Record<number, OpeningLine> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const [row] = await football<ApiOdds[]>(`/odds?fixture=${id}`, 10 * 60_000);
        if (!row) return;
        const pick = (bet: number, value: string) =>
          median(row.bookmakers.flatMap((b) => b.bets.filter((x) => x.id === bet).flatMap((x) => x.values.filter((v) => v.value === value).map((v) => Number(v.odd)))));
        out[Number(id)] = {
          home: pick(1, "Home"), draw: pick(1, "Draw"), away: pick(1, "Away"),
          over25: pick(5, "Over 2.5"), under25: pick(5, "Under 2.5"),
          bttsYes: pick(8, "Yes"), bttsNo: pick(8, "No"),
        };
      } catch {}
    }),
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } });
}

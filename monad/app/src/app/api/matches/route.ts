import { NextResponse } from "next/server";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

/** Matches scheduled on TerraceOracle (by CRE), with names, crests and live state. */
export async function GET() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = await matches(ids);
  return NextResponse.json(list, { headers: { "Cache-Control": "s-maxage=20, stale-while-revalidate=40" } });
}

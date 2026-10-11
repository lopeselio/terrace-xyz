import { CreateMarket } from "@/components/CreateMarket";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

export const revalidate = 20;

const DONE = new Set(["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"]);

/** The green + button: say a take, pick the match, publish it as a market. */
export default async function Take({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const { match } = await searchParams;
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = (await matches(ids)).filter((m) => !DONE.has(m.status));
  return <CreateMarket fixtures={list} initial={match ? Number(match) : undefined} />;
}

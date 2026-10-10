import { MatchRow } from "@/components/MatchRow";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";
import { Feed } from "@/components/Feed";

export const revalidate = 20;

export default async function Home() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = await matches(ids);
  return (
    <>
      <h1>Matchday</h1>
      <p className="lede">Pick a match, say your piece, and put money on your takes. Your mates can back you or take you on.</p>
      <section className="plain-card">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </section>
      <h2>Hottest takes</h2>
      <Feed />
    </>
  );
}

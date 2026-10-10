import { MatchRow } from "@/components/MatchRow";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

export const revalidate = 20;

export default async function Matches() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = await matches(ids);
  return (
    <>
      <h1>Matches</h1>
      <p className="lede">Every match has a room. Pick one to chat, back takes and start markets.</p>
      <div className="fixtures">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </div>
    </>
  );
}

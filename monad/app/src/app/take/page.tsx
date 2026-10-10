import Link from "next/link";
import { FINISHED, kickoffLabel } from "@/components/MatchRow";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

export const revalidate = 20;

/** The green + button: pick a match, then say your take in its room. */
export default async function Take() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = (await matches(ids)).filter((m) => !FINISHED.has(m.status));
  return (
    <>
      <h1>What&apos;s your take?</h1>
      <p className="lede">Pick the match. You can post it to the room, then put money on it if you&apos;re sure.</p>
      <div className="stack">
        {list.map((m) => (
          <Link key={m.id} href={`/m/${m.id}#compose`} className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={m.home.logo} alt="" width={22} height={22} />
            <strong style={{ flex: 1 }}>{m.home.name} v {m.away.name}</strong>
            <span className="meta">{kickoffLabel(m)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

import { Feed } from "@/components/Feed";
import { FINISHED, MatchRow } from "@/components/MatchRow";
import { SectionHead } from "@/components/ui";
import { ADDR, oracleAbi } from "@/lib/contracts";
import { matches } from "@/lib/server/football";
import { serverClient } from "@/lib/server/rpc";

export const revalidate = 20;

export default async function Home() {
  const ids = await serverClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "fixtureIds" });
  const list = (await matches(ids)).filter((m) => !FINISHED.has(m.status)).slice(0, 4);
  return (
    <>
      <section className="hero">
        <h1>Back your take.</h1>
        <p>Say it in the match chat, put money on it, and let the room back you or fade you. Settled by Chainlink from live match data.</p>
      </section>
      <SectionHead title="Live & next" more="All matches" href="/matches" />
      <div className="fixtures">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </div>
      <div className="odds-row" style={{ marginTop: 12 }}>
        <a className="cta ghost" href="/acca">Build an acca</a>
        <a className="cta ghost" href="/challenges">1v1 challenges</a>
      </div>
      <SectionHead title="Hottest takes" />
      <Feed />
    </>
  );
}

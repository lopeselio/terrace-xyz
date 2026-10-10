import Link from "next/link";
import { CreateLeague } from "@/components/CreateLeague";
import { gql } from "@/lib/server/indexer";

export const revalidate = 10;

type Row = { id: string; name: string; memberCount: number; gameweeks: number; isPrivate: boolean; entryFee: string };

export default async function Leagues() {
  let leagues: Row[] = [];
  try {
    leagues = (await gql<{ League: Row[] }>(`{ League(order_by: { memberCount: desc }, limit: 50) { id name memberCount gameweeks isPrivate entryFee } }`)).League;
  } catch {}
  return (
    <>
      <h1>Leagues</h1>
      <p className="lede">Your mates, a season, one table. Run it yourself, or let the members vote on every gameweek.</p>
      <CreateLeague />
      <div className="section-head"><h3>Open leagues</h3></div>
      <ul className="board">
        {leagues.filter((l) => !l.isPrivate).map((l) => (
          <li key={l.id}>
            <Link href={`/l/${l.id}`} className="name">{l.name}</Link>
            <span className="sub">{l.memberCount} in · {l.gameweeks} GW{Number(l.entryFee) ? ` · $${Number(l.entryFee) / 1e6}` : " · free"}</span>
          </li>
        ))}
        {leagues.filter((l) => !l.isPrivate).length === 0 && <li className="muted">No open leagues yet. Start one.</li>}
      </ul>
    </>
  );
}

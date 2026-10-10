import { notFound } from "next/navigation";
import { Room } from "@/components/Room";
import { kickoffLabel } from "@/components/MatchRow";
import { matches } from "@/lib/server/football";

export const revalidate = 15;

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m] = await matches([Number(id)], 15_000);
  if (!m) notFound();
  const started = m.goals.home !== null;
  return (
    <>
      <div className="scoreboard-head">
        <span className="team home"><img src={m.home.logo} alt="" width={36} height={36} /> {m.home.name}</span>
        <span className="score">
          {started ? `${m.goals.home}–${m.goals.away}` : "v"}
          <small>{kickoffLabel(m)}</small>
        </span>
        <span className="team away">{m.away.name} <img src={m.away.logo} alt="" width={36} height={36} /></span>
      </div>
      <p className="lede">{m.league}. Say your take; if you're sure, put money on it and let the room back you or fade you.</p>
      <Room kind={0} roomId={m.id} fixtureId={m.id} />
    </>
  );
}

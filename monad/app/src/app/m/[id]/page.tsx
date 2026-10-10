import { notFound } from "next/navigation";
import { kickoffLabel, LIVE } from "@/components/MatchRow";
import { MatchMarkets } from "@/components/MatchMarkets";
import { Room } from "@/components/Room";
import { Badge } from "@/components/ui";
import { matches } from "@/lib/server/football";

export const revalidate = 15;

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m] = await matches([Number(id)], 15_000);
  if (!m) notFound();
  const started = m.goals.home !== null;
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {LIVE.has(m.status) && <Badge tone="live">LIVE</Badge>}
        <Badge tone="settled">{m.league.toUpperCase()}</Badge>
      </div>
      <div className="match-hero">
        <span className="team"><img src={m.home.logo} alt="" width={44} height={44} /> {m.home.name}</span>
        <span className={`score${LIVE.has(m.status) ? " live" : ""}`}>
          {started ? `${m.goals.home}–${m.goals.away}` : "v"}
          <small>{kickoffLabel(m)}</small>
        </span>
        <span className="team"><img src={m.away.logo} alt="" width={44} height={44} /> {m.away.name}</span>
      </div>
      <MatchMarkets fixtureId={m.id} home={m.home.name} away={m.away.name} open={m.status === "NS" || m.status === "TBD"} />
      <Room kind={0} roomId={m.id} fixtureId={m.id} />
    </>
  );
}

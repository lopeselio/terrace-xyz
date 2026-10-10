import Link from "next/link";
import type { MatchInfo } from "@/lib/server/football";
import { LocalTime } from "./LocalTime";

export const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
export const FINISHED = new Set(["FT", "AET", "PEN"]);

export function kickoffLabel(m: MatchInfo): React.ReactNode {
  if (LIVE.has(m.status)) return m.status === "HT" ? "HALF TIME" : `${m.elapsed ?? ""}'`;
  if (FINISHED.has(m.status)) return "FULL TIME";
  return <LocalTime unix={m.kickoff} />;
}

export function MatchRow({ m }: { m: MatchInfo }) {
  const started = m.goals.home !== null;
  return (
    <Link href={`/m/${m.id}`} className="fixture">
      <span className="team home">
        <img src={m.home.logo} alt="" width={24} height={24} /> {m.home.name}
      </span>
      <span className={`score${LIVE.has(m.status) ? " live" : ""}`}>
        {started ? `${m.goals.home}–${m.goals.away}` : "v"}
        <small>{kickoffLabel(m)}</small>
      </span>
      <span className="team away">
        {m.away.name} <img src={m.away.logo} alt="" width={24} height={24} />
      </span>
    </Link>
  );
}

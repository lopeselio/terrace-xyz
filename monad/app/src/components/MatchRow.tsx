import Link from "next/link";
import type { MatchInfo } from "@/lib/server/football";

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);

export function kickoffLabel(m: MatchInfo) {
  if (LIVE.has(m.status)) return m.status === "HT" ? "Half time" : `${m.elapsed ?? ""}'`;
  if (["FT", "AET", "PEN"].includes(m.status)) return "Full time";
  return new Date(m.kickoff * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function MatchRow({ m }: { m: MatchInfo }) {
  const started = m.goals.home !== null;
  return (
    <Link href={`/m/${m.id}`} className="match">
      <span className="team home">
        <img src={m.home.logo} alt="" width={22} height={22} /> {m.home.name}
      </span>
      <span className={`score${LIVE.has(m.status) ? " live" : ""}`}>
        {started ? `${m.goals.home}–${m.goals.away}` : "v"}
        <small>{kickoffLabel(m)}</small>
      </span>
      <span className="team away">
        {m.away.name} <img src={m.away.logo} alt="" width={22} height={22} />
      </span>
    </Link>
  );
}

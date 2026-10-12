"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Sheet, SheetHead, SkeletonCards } from "./ui";
import { saveTeam, type FavTeam } from "@/lib/favTeam";
import { useMatches } from "@/lib/useMatches";

type Team = { id: number; name: string; logo: string };

/** Pick your club: first the league (every league Terrace covers), then the team. */
export function TeamPicker({ onClose }: { onClose: () => void }) {
  const matches = useMatches();
  const leagues = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; logo: string }>();
    for (const m of matches.values()) if (m.leagueId && !seen.has(m.leagueId)) seen.set(m.leagueId, { id: m.leagueId, name: m.league ?? "", logo: m.leagueLogo ?? "" });
    return [...seen.values()].sort((a, b) => (a.id === 39 ? -1 : b.id === 39 ? 1 : a.name.localeCompare(b.name)));
  }, [matches]);
  const [league, setLeague] = useState<{ id: number; name: string; logo: string } | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!league) return;
    setTeams(null);
    fetch(`/api/teams?league=${league.id}`).then((r) => r.json()).then((t) => setTeams(Array.isArray(t) ? t : [])).catch(() => setTeams([]));
  }, [league]);

  const pick = (t: Team) => {
    saveTeam({ id: t.id, name: t.name, logo: t.logo, leagueId: league!.id, league: league!.name } satisfies FavTeam);
    onClose();
  };
  const shown = (teams ?? []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow={league ? league.name : "Make Terrace yours"} title={league ? "Pick your club" : "Who do you support?"} onClose={onClose} />
      {!league ? (
        <>
          <div className="umeta" style={{ margin: "6px 0 12px" }}>Pick a league, then your club. Home turns into your matchday brief: next game, odds, form and predictions.</div>
          {leagues.length === 0 && <SkeletonCards n={2} odds={2} />}
          <div className="league-grid">
            {leagues.map((l) => (
              <button key={l.id} className="league-pick" onClick={() => setLeague(l)}>
                <span className="league-tile" style={{ width: 34, height: 34 }}>{l.logo && <img src={l.logo} alt="" width={28} height={28} />}</span>
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="textbtn" style={{ margin: "6px 0 10px" }} onClick={() => setLeague(null)}>‹ All leagues</button>
          <label className="field row" style={{ gap: 8, marginBottom: 10 }}>
            <Icon name="search" size={16} />
            <input placeholder="Search clubs" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {teams === null && <SkeletonCards n={2} odds={2} />}
          <div className="team-grid">
            {shown.map((t) => (
              <button key={t.id} className="team-pick" onClick={() => pick(t)}>
                <img src={t.logo} alt="" width={40} height={40} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          {teams?.length === 0 && <div className="umeta">No clubs found for this league yet.</div>}
        </>
      )}
    </Sheet>
  );
}

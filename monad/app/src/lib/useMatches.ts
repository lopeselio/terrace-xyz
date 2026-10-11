"use client";
import { useEffect, useState } from "react";

export type MatchLite = { id: number; kickoff: number; status: string; league?: string; leagueId?: number; leagueLogo?: string; elapsed?: number | null; home: { name: string; logo: string }; away: { name: string; logo: string }; goals?: { home: number | null; away: number | null } };

/** Match names and crests for labelling questions (shared, fetched once per page). */
export function useMatches() {
  const [byId, setById] = useState<Map<number, MatchLite>>(new Map());
  useEffect(() => {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((list: MatchLite[]) => setById(new Map(list.map((m) => [m.id, m]))))
      .catch(() => {});
  }, []);
  return byId;
}

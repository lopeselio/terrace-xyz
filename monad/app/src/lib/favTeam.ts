"use client";
import { useEffect, useState } from "react";

/** The fan's club, for the personalised Home brief. Kept on this device. */
export type FavTeam = { id: number; name: string; logo: string; leagueId: number; league: string };
const KEY = "terrace.team";

export function readTeam(): FavTeam | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as FavTeam | null;
  } catch {
    return null;
  }
}

export function saveTeam(t: FavTeam | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("terrace-team"));
}

export function useFavTeam() {
  const [team, setTeam] = useState<FavTeam | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      setTeam(readTeam());
      setReady(true);
    };
    sync();
    window.addEventListener("terrace-team", sync);
    return () => window.removeEventListener("terrace-team", sync);
  }, []);
  return { team, ready, setTeam: saveTeam };
}

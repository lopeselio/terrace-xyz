import { useState, useEffect } from "react";
import { getSearchName } from "../utils/teamDatabase";

const cache = new Map<string, string | null>();

export function useTeamCrest(teamName: string): string | null {
  const [crest, setCrest] = useState<string | null>(cache.get(teamName) ?? null);

  useEffect(() => {
    if (!teamName.trim()) return;
    if (cache.has(teamName)) {
      setCrest(cache.get(teamName) ?? null);
      return;
    }

    // Expand abbreviations: "PSG" → "paris saint-germain", strip "FC" suffix, etc.
    const searchName = getSearchName(teamName);
    fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(searchName)}`
    )
      .then((r) => r.json())
      .then((data) => {
        const badge: string | null = data?.teams?.[0]?.strBadge ?? null;
        cache.set(teamName, badge);
        setCrest(badge);
      })
      .catch(() => {
        cache.set(teamName, null);
      });
  }, [teamName]);

  return crest;
}

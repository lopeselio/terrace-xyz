import { useState, useEffect } from "react";
import { getSearchName } from "../utils/teamDatabase";

// Only cache successes — never cache null so failures can retry
const cache = new Map<string, string>();
// Prevent duplicate in-flight requests for the same team
const fetching = new Set<string>();

export function useTeamCrest(teamName: string): string | null {
  const [crest, setCrest] = useState<string | null>(cache.get(teamName) ?? null);

  useEffect(() => {
    const name = teamName.trim();
    if (!name) return;
    if (cache.has(name)) { setCrest(cache.get(name)!); return; }
    if (fetching.has(name)) return;

    fetching.add(name);
    const searchName = getSearchName(name);
    fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(searchName)}`
    )
      .then((r) => r.json())
      .then((data) => {
        fetching.delete(name);
        const badge: string | undefined = data?.teams?.[0]?.strBadge;
        if (badge) {
          cache.set(name, badge);
          setCrest(badge);
        }
        // Don't cache null — next render will retry
      })
      .catch(() => {
        fetching.delete(name);
        // No caching on error — will retry next time the component mounts
      });
  }, [teamName]);

  return crest;
}

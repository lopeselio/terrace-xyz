import { useState, useEffect } from "react";
import { getSearchName } from "../utils/teamDatabase";

// Only cache successes — never cache null so failures can retry
const cache = new Map<string, string>();
// Prevent duplicate in-flight requests for the same team
const fetching = new Set<string>();

/** Lowercase letters only, collapsed. Used for fuzzy name-match. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * TheSportsDB's search is loose — `?t=france` returns French clubs, mis-tagged
 * youth squads, and at times Arsenal (because "Arsenal" appears in another
 * team's `strAlternate` field). We accept a result only when our query and the
 * returned team's primary name share a meaningful substring (≥3 chars).
 */
function isPlausibleMatch(query: string, teamName: string | undefined): boolean {
  if (!teamName) return false;
  const q = norm(query);
  const t = norm(teamName);
  if (q.length < 3 || t.length < 3) return false;
  return q.includes(t) || t.includes(q);
}

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
        const teams: Array<{ strTeam?: string; strBadge?: string }> | undefined = data?.teams;
        const hit = teams?.find((t) => isPlausibleMatch(searchName, t.strTeam) && t.strBadge);
        if (hit?.strBadge) {
          cache.set(name, hit.strBadge);
          setCrest(hit.strBadge);
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

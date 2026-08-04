import { useEffect, useState } from "react";
import { isFixtureLive, type LiveFixture } from "@terrace/sdk";
import { footballClient } from "../utils/apiFootball";

// In-flight + result caches keyed by "home|away|YYYY-MM-DD". We never cache
// nulls (so the next mount can retry once a fixture appears in the API feed).
const cache = new Map<string, LiveFixture>();
const inFlight = new Map<string, Promise<LiveFixture | null>>();

// Poll live in-play matches every 30s; static fixtures (NS / FT) hold their
// last value. 30s × ~3 visible cards = ~7 calls/min — well inside the free
// tier's 100/day budget assuming a typical session length.
const LIVE_POLL_MS = 30_000;

function cacheKey(home: string, away: string, date: Date): string {
  return `${home.toLowerCase()}|${away.toLowerCase()}|${date.toISOString().slice(0, 10)}`;
}

/**
 * Resolve a Jupiter/Polymarket "Home vs Away" event title to a live fixture
 * from API-Football. Returns null while loading, or if no match is found.
 *
 * - `home` / `away`: team names from `splitEventTitle(jupiterEventTitle)`
 * - `referenceDate`: anchor for the ±48h search window. Defaults to expiry
 *   when provided (Jupiter expiry ≈ kickoff for live sports), else today.
 */
export function useLiveFixture(
  home: string,
  away: string,
  referenceDate: Date | null,
): LiveFixture | null {
  const ref = referenceDate ?? new Date();
  const key = cacheKey(home, away, ref);
  const [fixture, setFixture] = useState<LiveFixture | null>(cache.get(key) ?? null);

  useEffect(() => {
    const client = footballClient();
    if (!client) return;
    if (!home || !away) return;

    let cancelled = false;

    const load = async () => {
      if (cache.has(key)) {
        if (!cancelled) setFixture(cache.get(key)!);
        return;
      }
      let req = inFlight.get(key);
      if (!req) {
        req = client.findFixtureByTeams(home, away, ref).catch(() => null);
        inFlight.set(key, req);
      }
      const result = await req;
      inFlight.delete(key);
      if (result) cache.set(key, result);
      if (!cancelled) setFixture(result);
    };

    void load();

    // Poll only while the current cached fixture is in-play. Static fixtures
    // don't refresh — the card will rehydrate on next mount.
    const cached = cache.get(key);
    if (!cached || !isFixtureLive(cached)) return () => { cancelled = true; };

    const iv = setInterval(() => {
      void client.findFixtureByTeams(home, away, ref).then((result) => {
        if (cancelled) return;
        if (result) {
          cache.set(key, result);
          setFixture(result);
        }
      }).catch(() => {});
    }, LIVE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [home, away, key]);

  return fixture;
}

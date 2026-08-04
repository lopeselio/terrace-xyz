import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { isFixtureFinished, type LiveFixture } from "@terrace/sdk";
import { footballClient } from "../utils/apiFootball";
import { competitionForApiId, type Competition } from "../utils/football";

// ---------------------------------------------------------------------------
// The matchday schedule (TODO Sprint 12 #8).
//
// Until now the board was whatever Polymarket happened to list. Across five
// leagues that's a board with holes in it — a fan opens the app on a Saturday
// morning, sees three of the ten fixtures being played, and concludes nothing
// is on. Fixtures come from api-football instead, and markets attach to them
// where they exist; where they don't, the fixture is an invitation to create
// one.
//
// Queried by date, not by league. `league + season + from/to` is the obvious
// shape and the free plan rejects it outright — seasons cap at 2024 there, and
// so do the `next` and multi-day range parameters. A bare `date=` works for the
// current season and returns every competition that day, so one request covers
// all seven leagues instead of one request each, and we filter by league id
// here.
//
// Like useLiveFixtures this is a module-level store: mounting the board and the
// create sheet at once costs one fetch, not two.
// ---------------------------------------------------------------------------

/**
 * How far ahead the board looks, in days beyond today.
 *
 * 1 (today + tomorrow) is not a design choice — it is the free plan's ceiling.
 * Asking for a date beyond tomorrow returns "Free plans do not have access to
 * this date", so a wider window would quietly render nothing for the days it
 * can't see. On a paid plan raise this and the board fills out; the request
 * shape doesn't change.
 */
const WINDOW_DAYS = 1;

/** Refetch cadence while foregrounded — matches the proxy's fixture TTL. */
const REFRESH_MS = 30 * 60_000;

/** Don't refetch on every mount; a schedule this fresh is still right. */
const STALE_MS = 15 * 60_000;

export interface UpcomingFixture {
  fixture: LiveFixture;
  competition: Competition;
}

export interface UpcomingFixturesSnapshot {
  fixtures: UpcomingFixture[];
  loading: boolean;
  /** Non-null when the last refresh failed; the previous schedule is kept. */
  error: string | null;
}

// --- Store -----------------------------------------------------------------

let snapshot: UpcomingFixturesSnapshot = { fixtures: [], loading: false, error: null };

const subscribers = new Set<(s: UpcomingFixturesSnapshot) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;

function publish(next: Partial<UpcomingFixturesSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const fn of subscribers) fn(snapshot);
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function fetchUpcoming(force = false): Promise<void> {
  const client = footballClient();
  if (!client) return;
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetchedAt < STALE_MS) return;

  const dates = Array.from({ length: WINDOW_DAYS + 1 }, (_, i) => isoDay(i));

  publish({ loading: snapshot.fixtures.length === 0 });

  inFlight = (async () => {
    // A day the plan refuses is skipped rather than fatal, so the board shows
    // what it can see instead of failing whole.
    const all = await client.getFixturesForDates(dates);

    const merged: UpcomingFixture[] = [];
    for (const fixture of all) {
      const competition = competitionForApiId(fixture.league.id);
      // The date query returns every competition on earth for that day —
      // 224 fixtures for a single Wednesday. Only the leagues we cover belong
      // on the board.
      if (competition) merged.push({ fixture, competition });
    }

    // A finished match is history, not schedule. In-play stays: it's the most
    // interesting row on the board.
    const upcoming = merged
      .filter((u) => !isFixtureFinished(u.fixture))
      .sort((a, b) => Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff));

    if (all.length > 0) lastFetchedAt = Date.now();

    publish({
      // Keep the previous schedule when the whole window failed — a stale board
      // beats an empty one.
      fixtures: all.length > 0 ? upcoming : snapshot.fixtures,
      loading: false,
      error: null,
    });
  })()
    .catch((e: unknown) => {
      publish({ loading: false, error: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function startPolling(): void {
  if (timer || !footballClient()) return;
  void fetchUpcoming();
  timer = setInterval(() => void fetchUpcoming(true), REFRESH_MS);
}

function stopPolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

let appStateSub: { remove: () => void } | null = null;
function onAppStateChange(state: AppStateStatus): void {
  if (state === "active" && subscribers.size > 0) startPolling();
  else stopPolling();
}

function subscribe(fn: (s: UpcomingFixturesSnapshot) => void): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1) {
    appStateSub ??= AppState.addEventListener("change", onAppStateChange);
    if (AppState.currentState === "active") startPolling();
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stopPolling();
  };
}

// --- Hook ------------------------------------------------------------------

/** The next week of fixtures across the seeded leagues, soonest first. */
export function useUpcomingFixtures(): UpcomingFixturesSnapshot & { refresh: () => void } {
  const [state, setState] = useState<UpcomingFixturesSnapshot>(snapshot);
  useEffect(() => subscribe(setState), []);
  return { ...state, refresh: () => void fetchUpcoming(true) };
}

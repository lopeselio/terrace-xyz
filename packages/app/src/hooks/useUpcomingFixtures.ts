import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { isFixtureFinished, type LiveFixture } from "@terrace/sdk";
import { footballClient } from "../utils/apiFootball";
import {
  COMPETITION_API_ID,
  CURRENT_SEASON,
  SEEDABLE_COMPETITIONS,
  type Competition,
} from "../utils/football";

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
// Cost: one request per league per window, and a fixture list for next weekend
// does not change, so the worker proxy caches it for half an hour and nobody
// pays for it twice. That is the whole reason the proxy landed first.
//
// Like useLiveFixtures this is a module-level store: mounting the board and the
// create sheet at once costs one fetch, not two.
// ---------------------------------------------------------------------------

/** How far ahead the board looks. A week covers the next two matchdays. */
const WINDOW_DAYS = 7;

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

  const from = isoDay(0);
  const to = isoDay(WINDOW_DAYS);

  publish({ loading: snapshot.fixtures.length === 0 });

  inFlight = (async () => {
    // Leagues are fetched in parallel and merged. One failing league shouldn't
    // empty the board — a partial schedule is still a schedule.
    const results = await Promise.allSettled(
      SEEDABLE_COMPETITIONS.map(async (competition) => {
        const leagueId = COMPETITION_API_ID[competition];
        if (leagueId == null) return [] as UpcomingFixture[];
        const fixtures = await client.getLeagueFixtures(leagueId, CURRENT_SEASON, from, to);
        return fixtures.map((fixture) => ({ fixture, competition }));
      }),
    );

    const merged: UpcomingFixture[] = [];
    let firstError: string | null = null;
    for (const result of results) {
      if (result.status === "fulfilled") merged.push(...result.value);
      else if (!firstError) firstError = String(result.reason?.message ?? result.reason);
    }

    // A finished match is history, not schedule. In-play stays: it's the most
    // interesting row on the board.
    const upcoming = merged
      .filter((u) => !isFixtureFinished(u.fixture))
      .sort((a, b) => Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff));

    if (merged.length > 0) lastFetchedAt = Date.now();

    publish({
      // Keep the previous schedule when every league failed — a stale board
      // beats an empty one.
      fixtures: merged.length > 0 ? upcoming : snapshot.fixtures,
      loading: false,
      error: merged.length > 0 ? null : firstError,
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

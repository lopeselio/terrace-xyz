import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { ApiFootballClient, isFixtureLive, type LiveFixture } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// Live-score subscription — the list of football matches in play right now.
//
// `useLiveFixture` (singular) answers "is *this* fixture live?" and needs a
// per-match ±48h search. The In-play carousel and Flash screen need the
// opposite: the whole live board, cheaply, shared.
//
// So this is a module-level store, not per-component state. Every subscriber
// reads the same snapshot from one poll — mounting the carousel on Home and
// the Flash screen at once costs one request, not two.
//
// Budget: the free API-Football tier allows 100 requests/day. At LIVE_POLL_MS
// we would exhaust that in under two hours of continuous foreground use, so:
//   - we only poll while the app is foregrounded AND something is subscribed
//   - we stop entirely once DAILY_BUDGET requests have been spent, keeping the
//     last snapshot on screen rather than showing an error
// Moving to a paid tier or proxying through the notifications worker removes
// the cap; raise DAILY_BUDGET there and nothing else changes.
// ---------------------------------------------------------------------------

const API_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY ?? "";

const LIVE_POLL_MS = 60_000;
const DAILY_BUDGET = 80;

// Competition weighting for the carousel. API-Football league ids — a live
// Champions League tie should outrank a live Danish second-division game.
const LEAGUE_RANK: Record<number, number> = {
  1: 0,    // World Cup
  2: 1,    // UEFA Champions League
  3: 2,    // UEFA Europa League
  848: 3,  // UEFA Europa Conference League
  39: 4,   // Premier League
  140: 5,  // La Liga
  135: 6,  // Serie A
  78: 7,   // Bundesliga
  61: 8,   // Ligue 1
  94: 9,   // Primeira Liga
  88: 10,  // Eredivisie
  40: 11,  // EFL Championship
  253: 12, // MLS
};
const UNRANKED = 99;

function rankOf(f: LiveFixture): number {
  return LEAGUE_RANK[f.league.id] ?? UNRANKED;
}

export interface LiveFixturesSnapshot {
  fixtures: LiveFixture[];
  loading: boolean;
  /** Non-null when the last fetch failed. The previous snapshot is retained. */
  error: string | null;
  /** True once the daily request budget is spent — data is frozen, not broken. */
  budgetSpent: boolean;
}

// --- Store -----------------------------------------------------------------

let snapshot: LiveFixturesSnapshot = {
  fixtures: [],
  loading: false,
  error: null,
  budgetSpent: false,
};

const subscribers = new Set<(s: LiveFixturesSnapshot) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let requestsSpent = 0;
let budgetDay = todayKey();
let client: ApiFootballClient | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function publish(next: Partial<LiveFixturesSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const fn of subscribers) fn(snapshot);
}

function getClient(): ApiFootballClient | null {
  if (!API_KEY) return null;
  client ??= new ApiFootballClient(API_KEY);
  return client;
}

async function fetchLive(): Promise<void> {
  const c = getClient();
  if (!c) return;

  // Roll the budget at UTC midnight so a long-running session recovers.
  const day = todayKey();
  if (day !== budgetDay) {
    budgetDay = day;
    requestsSpent = 0;
    publish({ budgetSpent: false });
  }
  if (requestsSpent >= DAILY_BUDGET) {
    publish({ loading: false, budgetSpent: true });
    return;
  }
  if (inFlight) return inFlight;

  publish({ loading: snapshot.fixtures.length === 0 });
  requestsSpent += 1;

  inFlight = c
    .getLiveFixtures()
    .then((all) => {
      // `live=all` occasionally includes fixtures that have just finished;
      // isFixtureLive is the authority on what belongs on an in-play surface.
      const live = all
        .filter(isFixtureLive)
        .sort((a, b) => rankOf(a) - rankOf(b) || (b.elapsed ?? 0) - (a.elapsed ?? 0));
      publish({ fixtures: live, loading: false, error: null });
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      // DAILY_BUDGET only counts requests *this app* made, but the quota is
      // per-account: a second device, or a script sharing the key, can exhaust
      // it first and we'd never know. Treat the provider saying so as
      // authoritative, or the board silently freezes on stale scores with
      // nothing on screen to explain why.
      const quotaHit = /request limit|rate limit|quota|too many requests/i.test(msg);
      if (quotaHit) requestsSpent = DAILY_BUDGET;
      // Keep the previous snapshot on screen — a stale score beats a blank row.
      publish({ loading: false, error: msg, budgetSpent: quotaHit || snapshot.budgetSpent });
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function startPolling(): void {
  if (timer || !getClient()) return;
  void fetchLive();
  timer = setInterval(() => void fetchLive(), LIVE_POLL_MS);
}

function stopPolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// Foreground gating. A backgrounded app burning the request budget is the
// fastest way to have no live scores when the user actually looks.
let appStateSub: { remove: () => void } | null = null;
function onAppStateChange(state: AppStateStatus): void {
  if (state === "active" && subscribers.size > 0) startPolling();
  else stopPolling();
}

function subscribe(fn: (s: LiveFixturesSnapshot) => void): () => void {
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

/**
 * Currently in-play football fixtures, ranked by competition. Shared across all
 * callers — mounting this in several places does not multiply requests.
 */
export function useLiveFixtures(): LiveFixturesSnapshot & { refresh: () => void } {
  const [state, setState] = useState<LiveFixturesSnapshot>(snapshot);

  useEffect(() => subscribe(setState), []);

  return { ...state, refresh: () => void fetchLive() };
}

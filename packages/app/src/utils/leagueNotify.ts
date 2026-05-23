/**
 * Tiny client for the Cloudflare notifications-worker's league endpoints.
 * Everything is best-effort fire-and-forget so callers never have to wrap
 * these in try/catch — failures don't surface to the user.
 */

const WORKER_URL = "https://terrace-notifications.terrace-xyz.workers.dev";

export type LeagueEventKind =
  | "join"
  | "win"
  | "advance"
  | "reveal"
  | "market_create";

export interface LeagueEventPayload {
  // Optional context the worker uses for nicer copy.
  leagueName?: string;
  gameweek?: number;
  // free-form forwarders for the receiving device's deep-link handling.
  [key: string]: unknown;
}

export function registerLeagues(pubkey: string, leagues: string[]): void {
  if (!pubkey || !Array.isArray(leagues)) return;
  fetch(`${WORKER_URL}/league-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pubkey, leagues }),
  }).catch(() => {});
}

export function publishLeagueEvent(
  leagueAddress: string,
  actorPubkey: string,
  kind: LeagueEventKind,
  payload: LeagueEventPayload = {},
): void {
  if (!leagueAddress || !actorPubkey) return;
  fetch(`${WORKER_URL}/league-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leagueAddress, actorPubkey, kind, payload }),
  }).catch(() => {});
}

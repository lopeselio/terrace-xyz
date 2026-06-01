/**
 * Tiny client for the Cloudflare notifications-worker's league endpoints.
 * Everything is best-effort fire-and-forget so callers never have to wrap
 * these in try/catch — failures don't surface to the user.
 *
 * Also maintains a local AsyncStorage-backed "wallet → leagues" index. This
 * is what powers the cross-wallet local fan-out in useLeagueActivityFeed:
 * when wallet A logs an action on this device, we mirror it into the bell
 * feed of every OTHER wallet on the device that's a member of the same
 * league. Without this, multi-wallet testing on one phone (and real users
 * with multiple wallets) sees an empty bell whenever they switch wallets.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const WORKER_URL = "https://terrace-notifications.terrace-xyz.workers.dev";

const WALLET_LEAGUES_KEY = (pubkey: string) => `terrace:wallet-leagues:${pubkey}`;
const WALLET_LEAGUES_PREFIX = "terrace:wallet-leagues:";

async function persistWalletLeagueIndex(pubkey: string, leagues: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(WALLET_LEAGUES_KEY(pubkey), JSON.stringify(leagues));
  } catch { /* best-effort */ }
}

export async function loadWalletLeagueIndex(pubkey: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(WALLET_LEAGUES_KEY(pubkey));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

/** All wallet pubkeys that have a wallet-leagues index on this device. */
export async function listKnownWalletPubkeys(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys
      .filter((k) => k.startsWith(WALLET_LEAGUES_PREFIX))
      .map((k) => k.slice(WALLET_LEAGUES_PREFIX.length));
  } catch { return []; }
}

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
  // Maintain a local mirror so cross-wallet local fan-out can find who's in
  // which league without a network round-trip.
  persistWalletLeagueIndex(pubkey, leagues).catch(() => {});
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

// Broadcasts to every league the actor belongs to. Used when the action
// isn't tied to a specific league (e.g. creating a public market).
export function broadcastLeagueEvent(
  actorPubkey: string,
  kind: LeagueEventKind,
  payload: LeagueEventPayload = {},
): void {
  if (!actorPubkey) return;
  fetch(`${WORKER_URL}/league-event-broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorPubkey, kind, payload }),
  }).catch(() => {});
}

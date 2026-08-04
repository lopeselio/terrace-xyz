import { ApiFootballClient } from "@terrace/sdk";

// ---------------------------------------------------------------------------
// One football client for the whole app.
//
// Two routes to the same provider:
//
//   proxied  — EXPO_PUBLIC_FOOTBALL_PROXY_URL points at the notifications
//              worker's /football route. The key lives server-side and every
//              device shares one cache, so ten testers watching the same
//              matchday cost one upstream request per cache window instead of
//              ten separate daily allowances. This is the intended path.
//
//   direct   — EXPO_PUBLIC_API_FOOTBALL_KEY on the device. Kept for local work
//              against a personal key, and as the fallback if the worker is
//              unreachable at build time.
//
// Proxy wins when both are set.
// ---------------------------------------------------------------------------

const PROXY_URL = process.env.EXPO_PUBLIC_FOOTBALL_PROXY_URL ?? "";
const API_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY ?? "";

/** True when requests go through the shared worker cache. */
export const FOOTBALL_PROXIED = !!PROXY_URL;

let client: ApiFootballClient | null = null;

/** The shared client, or null when neither route is configured. */
export function footballClient(): ApiFootballClient | null {
  if (!PROXY_URL && !API_KEY) return null;
  client ??= new ApiFootballClient(
    PROXY_URL ? { baseUrl: PROXY_URL } : { apiKey: API_KEY },
  );
  return client;
}

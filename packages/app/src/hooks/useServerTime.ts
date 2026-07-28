import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Trusted clock (WIRING-NEEDS.md #7).
//
// Flash markets close on a deadline the chain enforces. If the countdown runs
// off `Date.now()` and the phone's clock is two minutes fast, the card locks
// early and the user watches a bet they could still have placed disappear —
// or worse, runs late, lets them tap Back, and the transaction reverts.
//
// The cluster is the clock we already trust for settlement, so we take it as
// the clock for the UI too: `getBlockTime(getSlot())` gives cluster unix time,
// and we hold the offset from device time. One offset, refreshed occasionally,
// shared by every countdown in the app.
//
// If the RPC is unreachable the offset stays 0 — countdowns fall back to device
// time rather than freezing. That's the right failure: slightly wrong beats
// stopped.
// ---------------------------------------------------------------------------

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

/** Re-sync the offset every 5 minutes; drift over that window is negligible. */
const RESYNC_MS = 5 * 60_000;

let offsetMs = 0;
let syncing: Promise<void> | null = null;
let lastSyncAt = 0;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function syncOffset(): Promise<void> {
  if (!HELIUS_RPC_URL) return;
  if (syncing) return syncing;

  syncing = (async () => {
    try {
      const slot = (await rpc("getSlot", [{ commitment: "confirmed" }])) as number;
      const blockTime = (await rpc("getBlockTime", [slot])) as number | null;
      if (typeof blockTime === "number") {
        offsetMs = blockTime * 1_000 - Date.now();
        lastSyncAt = Date.now();
      }
    } catch {
      // Keep the last known offset (0 on first failure) — see the note above.
    } finally {
      syncing = null;
    }
  })();

  return syncing;
}

/** Current time in ms, corrected toward cluster time. Safe to call anywhere. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Milliseconds until `deadline` on the trusted clock. Negative once passed. */
export function msUntil(deadline: Date | null): number {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return deadline.getTime() - serverNow();
}

/**
 * Keeps the shared offset fresh while mounted. Mount once per screen that
 * shows deadlines; the offset itself is global, so extra mounts are cheap.
 */
export function useServerTime(): { offsetMs: number; synced: boolean } {
  const [state, setState] = useState({ offsetMs, synced: lastSyncAt > 0 });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await syncOffset();
      if (!cancelled) setState({ offsetMs, synced: lastSyncAt > 0 });
    };
    void run();
    const id = setInterval(() => void run(), RESYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

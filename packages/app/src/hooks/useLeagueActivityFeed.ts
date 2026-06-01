import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { LeagueEventKind } from "../utils/leagueNotify";

/**
 * In-app activity feed for league-mate events. Captures pushes that the
 * notifications-worker fans out (data.terraceKind === "league_event") into a
 * local log that the bell-icon panel renders. Survives app restarts via
 * AsyncStorage.
 *
 * The push payload from the worker carries everything we need to render
 * without a network round-trip:
 *   { terraceKind, leagueAddress, actorPubkey, kind, leagueName?, gameweek? }
 *
 * "Seen" state lives alongside the entries (an entry has seen=true after the
 * user opens the bell panel that contains it). Capped at MAX_ENTRIES so the
 * log doesn't grow unbounded.
 */

const STORAGE_KEY = (pubkey: string) => `terrace:league-activity:${pubkey}`;
const MAX_ENTRIES = 40;

// Module-level pubsub so hook instances on different screens (HomeScreen
// bell + LeagueScreen actions) share state. When one screen records a local
// entry, all mounted hook instances re-render.
const subscribers = new Set<(pubkey: string) => void>();
function notifyAll(pubkey: string) {
  for (const fn of subscribers) fn(pubkey);
}

export interface LeagueActivityEntry {
  id: string;             // notification request id (Expo-generated)
  leagueAddress: string;
  leagueName?: string;
  actorPubkey: string;
  kind: LeagueEventKind;
  gameweek?: number;
  receivedAt: number;     // epoch ms
  seen: boolean;
}

async function loadEntries(pubkey: string): Promise<LeagueActivityEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY(pubkey));
    return raw ? (JSON.parse(raw) as LeagueActivityEntry[]) : [];
  } catch { return []; }
}

async function saveEntries(pubkey: string, entries: LeagueActivityEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY(pubkey), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* best-effort */ }
}

function entryFromNotification(
  n: Notifications.Notification | Notifications.NotificationResponse,
): LeagueActivityEntry | null {
  const req = "request" in n ? n.request : n.notification.request;
  const data: any = req.content?.data ?? {};
  if (data.terraceKind !== "league_event") return null;
  if (!data.leagueAddress || !data.actorPubkey || !data.kind) return null;

  return {
    id: req.identifier,
    leagueAddress: String(data.leagueAddress),
    leagueName: typeof data.leagueName === "string" ? data.leagueName : undefined,
    actorPubkey: String(data.actorPubkey),
    kind: data.kind as LeagueEventKind,
    gameweek: typeof data.gameweek === "number" ? data.gameweek : undefined,
    receivedAt: Date.now(),
    seen: false,
  };
}

export function useLeagueActivityFeed(walletPubkey: string | null) {
  const [entries, setEntries] = useState<LeagueActivityEntry[]>([]);

  // Hydrate from storage when wallet changes.
  useEffect(() => {
    if (!walletPubkey) { setEntries([]); return; }
    let cancelled = false;
    loadEntries(walletPubkey).then((e) => { if (!cancelled) setEntries(e); });
    return () => { cancelled = true; };
  }, [walletPubkey]);

  // Subscribe to cross-screen updates so e.g. an action on LeagueScreen
  // refreshes the bell badge in HomeScreen instantly.
  useEffect(() => {
    if (!walletPubkey) return;
    const onChange = (pubkey: string) => {
      if (pubkey !== walletPubkey) return;
      loadEntries(walletPubkey).then(setEntries);
    };
    subscribers.add(onChange);
    return () => { subscribers.delete(onChange); };
  }, [walletPubkey]);

  // Subscribe to inbound pushes (foreground + tapped-from-background).
  useEffect(() => {
    if (!walletPubkey) return;

    const append = (entry: LeagueActivityEntry | null) => {
      if (!entry) return;
      setEntries((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev; // dedupe by notification id
        const next = [entry, ...prev].slice(0, MAX_ENTRIES);
        saveEntries(walletPubkey, next);
        return next;
      });
    };

    const recvSub = Notifications.addNotificationReceivedListener((n) => {
      append(entryFromNotification(n));
    });
    const respSub = Notifications.addNotificationResponseReceivedListener((r) => {
      // Notifications tapped from the OS shade — still record them so the
      // bell stays a complete activity feed.
      append(entryFromNotification(r));
    });

    return () => {
      recvSub.remove();
      respSub.remove();
    };
  }, [walletPubkey]);

  const markAllSeen = useCallback(async () => {
    if (!walletPubkey) return;
    setEntries((prev) => {
      if (prev.every((e) => e.seen)) return prev;
      const next = prev.map((e) => ({ ...e, seen: true }));
      saveEntries(walletPubkey, next);
      return next;
    });
  }, [walletPubkey]);

  const clear = useCallback(async () => {
    if (!walletPubkey) return;
    setEntries([]);
    try { await AsyncStorage.removeItem(STORAGE_KEY(walletPubkey)); } catch {}
  }, [walletPubkey]);

  /**
   * Log a local activity entry — used when the user takes an action
   * themselves (score, advance, reveal). The worker fans the same event out
   * to OTHER members as push notifications; this path mirrors it so the
   * actor's own bell tray shows their own activity too. Without this, the
   * tray would be empty for anyone testing solo or on a dev wallet without
   * push permissions.
   */
  const recordLocal = useCallback((params: {
    leagueAddress: string;
    leagueName?: string;
    kind: LeagueEventKind;
    gameweek?: number;
  }) => {
    if (!walletPubkey) return;
    const entry: LeagueActivityEntry = {
      // Local entries get a stable-enough id from kind + timestamp so dedup
      // against any incoming push that the worker may also have queued.
      id: `local-${params.kind}-${params.leagueAddress.slice(0, 8)}-${Date.now()}`,
      leagueAddress: params.leagueAddress,
      leagueName: params.leagueName,
      actorPubkey: walletPubkey,
      kind: params.kind,
      gameweek: params.gameweek,
      receivedAt: Date.now(),
      seen: false,
    };
    setEntries((prev) => {
      // Skip if an identical-recent entry already exists (e.g. the push race
      // beat us by milliseconds). Match on (leagueAddress, kind, gameweek)
      // within the last 3 seconds.
      const now = Date.now();
      const dupe = prev.some((e) =>
        e.leagueAddress === entry.leagueAddress &&
        e.kind === entry.kind &&
        e.gameweek === entry.gameweek &&
        now - e.receivedAt < 3000,
      );
      if (dupe) return prev;
      const next = [entry, ...prev].slice(0, MAX_ENTRIES);
      saveEntries(walletPubkey, next);
      // Notify other hook instances (e.g. bell on HomeScreen) so they pick
      // up the new entry without waiting for a remount.
      queueMicrotask(() => notifyAll(walletPubkey));
      return next;
    });
  }, [walletPubkey]);

  const unseenCount = entries.filter((e) => !e.seen).length;

  return { entries, unseenCount, markAllSeen, clear, recordLocal };
}

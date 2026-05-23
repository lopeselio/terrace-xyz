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

  const unseenCount = entries.filter((e) => !e.seen).length;

  return { entries, unseenCount, markAllSeen, clear };
}

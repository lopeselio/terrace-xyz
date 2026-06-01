/**
 * Bell tray fed from the source of truth: the chain.
 *
 * Reads each LeagueMember PDA the user is a member of and detects changes
 * since the last sync:
 *   - totalScore went up by N         → N "win" entries for that member
 *   - lastScoredGameweek advanced     → a "reveal" entry for that member
 *
 * Synthesised entries land in the same AsyncStorage key the push-receiver
 * appends to, so the bell tray reads a unified feed. Stable IDs prevent
 * duplicates across syncs and across the push path.
 *
 * Why this matters in production:
 *   - Works on a fresh install (no missed-pushes window)
 *   - Survives Expo Push outages, lapsed permissions, locked devices
 *   - Works on dev workflows where the same physical device has multiple
 *     wallets and pushes only fire for the currently-active one
 *
 * The chain is the source of truth; pushes are a real-time enhancement.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchLeagueMembersForLeague } from "../hooks/useLeague";
import { loadWalletLeagueIndex } from "./leagueNotify";
import type { LeagueEventKind } from "./leagueNotify";

const ACTIVITY_KEY = (pubkey: string) => `terrace:league-activity:${pubkey}`;
const SYNC_STATE_KEY = (pubkey: string, league: string) => `terrace:chain-sync:${pubkey}:${league}`;
const MAX_ENTRIES = 40;

interface MemberStateSnapshot {
  totalScore: number;
  lastScoredGameweek: number;
}

interface ActivityEntry {
  id: string;
  leagueAddress: string;
  leagueName?: string;
  actorPubkey: string;
  kind: LeagueEventKind;
  gameweek?: number;
  receivedAt: number;
  seen: boolean;
}

async function loadSyncState(pubkey: string, league: string): Promise<Record<string, MemberStateSnapshot>> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATE_KEY(pubkey, league));
    return raw ? (JSON.parse(raw) as Record<string, MemberStateSnapshot>) : {};
  } catch { return {}; }
}

async function saveSyncState(pubkey: string, league: string, state: Record<string, MemberStateSnapshot>): Promise<void> {
  try { await AsyncStorage.setItem(SYNC_STATE_KEY(pubkey, league), JSON.stringify(state)); } catch {}
}

async function loadActivityEntries(pubkey: string): Promise<ActivityEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_KEY(pubkey));
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch { return []; }
}

async function saveActivityEntries(pubkey: string, entries: ActivityEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVITY_KEY(pubkey), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {}
}

export interface ChainSyncResult {
  walletPubkey: string;
  newEntryCount: number;
}

/**
 * Pulls fresh LeagueMember state for every league the user belongs to and
 * synthesises bell entries for any deltas. Idempotent — safe to call on
 * mount, on bell open, on app foreground.
 *
 * On first sync (no prior state record) entries get `seen: true` so the
 * badge doesn't suddenly spike with historical activity; only NEW deltas
 * after the first sync push the badge.
 */
export async function syncLeagueActivityFromChain(walletPubkey: string): Promise<ChainSyncResult> {
  if (!walletPubkey) return { walletPubkey, newEntryCount: 0 };

  const leagues = await loadWalletLeagueIndex(walletPubkey);
  if (leagues.length === 0) return { walletPubkey, newEntryCount: 0 };

  const synthesised: ActivityEntry[] = [];

  for (const leagueAddress of leagues) {
    try {
      const members = await fetchLeagueMembersForLeague(leagueAddress);
      const prevState = await loadSyncState(walletPubkey, leagueAddress);
      const isFirstSync = Object.keys(prevState).length === 0;
      const nextState: Record<string, MemberStateSnapshot> = {};

      for (const m of members) {
        const memberKey = String(m.member);
        nextState[memberKey] = {
          totalScore: m.totalScore,
          lastScoredGameweek: m.lastScoredGameweek,
        };

        // Skip self-events — the recordLocal path covers those.
        if (memberKey === walletPubkey) continue;

        const prev = prevState[memberKey] ?? { totalScore: 0, lastScoredGameweek: 0 };

        // "win" events: totalScore went up by N → N entries.
        const winDelta = m.totalScore - prev.totalScore;
        if (winDelta > 0) {
          for (let i = 0; i < winDelta; i++) {
            // Stable ID keyed on the resulting score level so the same win
            // never gets logged twice, even across pushes + syncs.
            synthesised.push({
              id: `chain-win-${leagueAddress.slice(0, 12)}-${memberKey.slice(0, 12)}-ts${m.totalScore - i}`,
              leagueAddress,
              actorPubkey: memberKey,
              kind: "win",
              receivedAt: Date.now() - i, // tiny offset for stable ordering
              seen: isFirstSync,
            });
          }
        }

        // "reveal" events: lastScoredGameweek advanced.
        if (m.lastScoredGameweek > prev.lastScoredGameweek && m.lastScoredGameweek > 0) {
          synthesised.push({
            id: `chain-reveal-${leagueAddress.slice(0, 12)}-${memberKey.slice(0, 12)}-gw${m.lastScoredGameweek}`,
            leagueAddress,
            actorPubkey: memberKey,
            kind: "reveal",
            gameweek: m.lastScoredGameweek,
            receivedAt: Date.now(),
            seen: isFirstSync,
          });
        }
      }

      await saveSyncState(walletPubkey, leagueAddress, nextState);
    } catch {
      // Per-league best-effort. A bad league doesn't kill the whole sync.
    }
  }

  if (synthesised.length === 0) return { walletPubkey, newEntryCount: 0 };

  // Dedupe against the existing feed by stable ID.
  const existing = await loadActivityEntries(walletPubkey);
  const existingIds = new Set(existing.map((e) => e.id));
  const fresh = synthesised.filter((e) => !existingIds.has(e.id));
  if (fresh.length === 0) return { walletPubkey, newEntryCount: 0 };

  const merged = [...fresh, ...existing].slice(0, MAX_ENTRIES);
  await saveActivityEntries(walletPubkey, merged);
  return { walletPubkey, newEntryCount: fresh.length };
}

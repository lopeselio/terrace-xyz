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

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const TERRACE_PROGRAM_ID = process.env.EXPO_PUBLIC_TERRACE_PROGRAM_ID ?? "";

// Manual base58 encoder for LeagueMember.league field (32-byte pubkey).
// Avoids pulling in bs58 just for this one call.
const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = B58_ALPHA[Number(n % 58n)] + s; n /= 58n; }
  const lead = bytes.findIndex((b) => b !== 0);
  return "1".repeat(lead < 0 ? 0 : lead) + s;
}

/**
 * Source-of-truth lookup: ask Solana directly which leagues the wallet is a
 * member of, by querying LeagueMember PDAs with member = walletPubkey at
 * offset 40. Works on a fresh sign-in before any local index is written.
 *
 * LeagueMember layout: 8 disc + 32 league + 32 member + ... → dataSize 96,
 * member field at offset 40.
 */
async function fetchUserLeagueAddresses(walletPubkey: string): Promise<string[]> {
  if (!HELIUS_RPC_URL || !TERRACE_PROGRAM_ID) return [];
  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          TERRACE_PROGRAM_ID,
          {
            encoding: "base64",
            commitment: "confirmed",
            filters: [
              { dataSize: 96 },
              { memcmp: { offset: 40, bytes: walletPubkey } },
            ],
          },
        ],
      }),
    });
    const json = await res.json();
    const out = new Set<string>();
    for (const item of (json.result ?? [])) {
      const data = item?.account?.data?.[0];
      if (!data) continue;
      const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      if (raw.length < 40) continue;
      out.add(b58encode(raw.slice(8, 40)));
    }
    return [...out];
  } catch { return []; }
}

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

  // Resolve the user's leagues from the chain FIRST (source of truth — works
  // on fresh sign-in before registerLeagues has populated the local index).
  // Merge with the local index as a fallback for cases where the chain query
  // races against a recent join that hasn't propagated yet.
  const [chainLeagues, localLeagues] = await Promise.all([
    fetchUserLeagueAddresses(walletPubkey),
    loadWalletLeagueIndex(walletPubkey),
  ]);
  const leagues = [...new Set([...chainLeagues, ...localLeagues])];
  if (leagues.length === 0) return { walletPubkey, newEntryCount: 0 };

  const synthesised: ActivityEntry[] = [];

  // Threshold above which a first-sync surface as 'seen' (silent) to avoid
  // flooding the bell badge on app install for a long-running league. Under
  // the threshold, surface as unseen so the user sees real activity right
  // when they log in. Set fairly high — fresh-signin should show mate
  // activity by default; only very chatty leagues get silenced.
  const FIRST_SYNC_SILENT_THRESHOLD = 30;

  for (const leagueAddress of leagues) {
    try {
      const members = await fetchLeagueMembersForLeague(leagueAddress);
      const prevState = await loadSyncState(walletPubkey, leagueAddress);
      const isFirstSync = Object.keys(prevState).length === 0;
      const nextState: Record<string, MemberStateSnapshot> = {};

      // Buffer this league's new entries separately so we can decide
      // silent-vs-unseen based on the count.
      const leagueEntries: ActivityEntry[] = [];

      for (const m of members) {
        const memberKey = String(m.member);
        nextState[memberKey] = {
          totalScore: m.totalScore,
          lastScoredGameweek: m.lastScoredGameweek,
        };

        // Skip self-events — the recordLocal path covers those.
        if (memberKey === walletPubkey) continue;

        const prev = prevState[memberKey] ?? { totalScore: 0, lastScoredGameweek: 0 };

        const winDelta = m.totalScore - prev.totalScore;
        if (winDelta > 0) {
          for (let i = 0; i < winDelta; i++) {
            leagueEntries.push({
              id: `chain-win-${leagueAddress.slice(0, 12)}-${memberKey.slice(0, 12)}-ts${m.totalScore - i}`,
              leagueAddress,
              actorPubkey: memberKey,
              kind: "win",
              receivedAt: Date.now() - i,
              seen: false, // resolved below
            });
          }
        }

        if (m.lastScoredGameweek > prev.lastScoredGameweek && m.lastScoredGameweek > 0) {
          leagueEntries.push({
            id: `chain-reveal-${leagueAddress.slice(0, 12)}-${memberKey.slice(0, 12)}-gw${m.lastScoredGameweek}`,
            leagueAddress,
            actorPubkey: memberKey,
            kind: "reveal",
            gameweek: m.lastScoredGameweek,
            receivedAt: Date.now(),
            seen: false,
          });
        }
      }

      // Decide silent vs unseen: first sync floods get silenced, otherwise
      // entries surface as new so the user sees league activity the moment
      // they sign in.
      const shouldSilence = isFirstSync && leagueEntries.length > FIRST_SYNC_SILENT_THRESHOLD;
      if (shouldSilence) {
        for (const e of leagueEntries) e.seen = true;
      }
      synthesised.push(...leagueEntries);

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

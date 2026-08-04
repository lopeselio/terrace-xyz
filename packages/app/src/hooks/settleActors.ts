import { deserializeMarketAccount, deserializeParlayAccount } from "@terrace/sdk";
import type { Address } from "@solana/kit";

// ---------------------------------------------------------------------------
// Who settled it (TODO Sprint 12 #1).
//
// `MarketSettled { market, winning_outcome }` and `ParlaySettled { parlay, won }`
// name an account, not a person — so the feed had a market pubkey sitting in the
// actor slot under the label "Terrace". A market resolving and a parlay landing
// are two of the most shareable moments in the app, and both were anonymous.
//
// The person is one hop away: both accounts carry a creator. We read it back
// here rather than adding the pubkey to the event, because that would mean a
// program change, an IDL regen and a devnet redeploy — and every event already
// on chain would still need this path anyway.
//
// Results are cached for the process lifetime: an account's creator never
// changes, so one lookup per market is the most this ever costs. Addresses that
// come back empty are remembered too, so a closed account isn't re-fetched on
// every feed update.
// ---------------------------------------------------------------------------

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

/** The account a settle event points at, and how to decode it. */
export interface SettleSubject {
  kind: "market" | "parlay";
  address: string;
}

const creatorOf = new Map<string, string>();
const unresolvable = new Set<string>();

/** Solana caps getMultipleAccounts at 100 keys per call. */
const BATCH = 100;

function decodeCreator(kind: SettleSubject["kind"], raw: Uint8Array, address: string): string | null {
  try {
    const account =
      kind === "market"
        ? deserializeMarketAccount(raw, address as Address)
        : deserializeParlayAccount(raw, address as Address);
    return (account.creator as string) || null;
  } catch {
    // Account layout we don't recognise — an old market from before a layout
    // change, most likely. Better an unattributed card than a wrong name.
    return null;
  }
}

/**
 * Look up the creator behind each subject. Returns only what resolved; callers
 * leave anything missing as it was.
 */
export async function resolveSettleActors(
  subjects: SettleSubject[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!HELIUS_RPC_URL) return found;

  const pending: SettleSubject[] = [];
  for (const subject of subjects) {
    const cached = creatorOf.get(subject.address);
    if (cached) {
      found.set(subject.address, cached);
      continue;
    }
    if (unresolvable.has(subject.address)) continue;
    if (!pending.some((p) => p.address === subject.address)) pending.push(subject);
  }
  if (pending.length === 0) return found;

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    try {
      const res = await fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "settle-actors",
          method: "getMultipleAccounts",
          params: [chunk.map((c) => c.address), { encoding: "base64" }],
        }),
      });
      const json = await res.json();
      const values: Array<{ data: [string, string] } | null> = json.result?.value ?? [];

      chunk.forEach((subject, idx) => {
        const account = values[idx];
        if (!account) {
          unresolvable.add(subject.address);
          return;
        }
        const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
        const creator = decodeCreator(subject.kind, raw, subject.address);
        if (creator) {
          creatorOf.set(subject.address, creator);
          found.set(subject.address, creator);
        } else {
          unresolvable.add(subject.address);
        }
      });
    } catch {
      // Network blip — leave the batch unresolved and uncached so the next
      // feed update retries it. The card stays on its "Terrace" fallback.
    }
  }

  return found;
}

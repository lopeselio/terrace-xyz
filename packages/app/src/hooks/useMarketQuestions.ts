import { useState, useEffect } from "react";
import { deserializeMarketAccount } from "@terrace/sdk";
import type { Address } from "@solana/kit";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

export interface MarketMeta {
  question: string;
  status: "Open" | "Settled" | "Closed";
  outcome: number | null; // 0=No, 1=Yes
}

// Batch-fetches market account metadata for a list of addresses.
// Returns a stable map; re-fetches whenever the sorted address list changes.
export function useMarketQuestions(
  addresses: string[]
): Record<string, MarketMeta> {
  const [meta, setMeta] = useState<Record<string, MarketMeta>>({});

  // Stable dep key — only refetch when the set of addresses actually changes
  const addrKey = [...new Set(addresses)].sort().join(",");

  useEffect(() => {
    const unique = [...new Set(addresses)].filter(Boolean);
    if (!unique.length || !HELIUS_RPC_URL) return;

    // Only fetch addresses we don't already have
    const missing = unique.filter((a) => !meta[a]);
    if (!missing.length) return;

    let cancelled = false;

    fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [missing, { encoding: "base64" }],
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const updates: Record<string, MarketMeta> = {};
        (json.result?.value ?? []).forEach((acct: any, i: number) => {
          if (!acct) return;
          try {
            const raw = Uint8Array.from(atob(acct.data[0]), (c) => c.charCodeAt(0));
            const m = deserializeMarketAccount(raw, missing[i] as Address);
            updates[missing[i]] = {
              question: m.question ?? "",
              status: m.status as "Open" | "Settled" | "Closed",
              outcome: m.outcome,
            };
          } catch {}
        });
        if (Object.keys(updates).length > 0) {
          setMeta((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey]);

  return meta;
}

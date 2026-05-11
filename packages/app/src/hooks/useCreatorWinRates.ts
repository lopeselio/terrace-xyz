import { useState, useEffect } from "react";
import type { Address } from "@solana/kit";
import { getReputationPda, deserializeReputationAccount, TERRACE_PROGRAM_ID } from "@terrace/sdk";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

/**
 * Batch-fetches Reputation PDAs for a list of creator addresses.
 * Returns a map of creator address → winRateBps (0–10000).
 * Creators with no on-chain reputation account are omitted (caller treats as null).
 */
export function useCreatorWinRates(creators: string[]): Record<string, number> {
  const [rates, setRates] = useState<Record<string, number>>({});

  // Stable dep key — only re-run when the actual set of creators changes
  const creatorKey = [...new Set(creators.filter(Boolean))].sort().join(",");

  useEffect(() => {
    const unique = [...new Set(creators.filter(Boolean))];
    if (!unique.length || !HELIUS_RPC_URL) return;

    let cancelled = false;

    (async () => {
      try {
        // Derive all reputation PDAs in parallel
        const pdaPairs = await Promise.all(
          unique.map(async (creator) => {
            const [pda] = await getReputationPda(creator as Address, TERRACE_PROGRAM_ID);
            return { creator, pda: pda as string };
          })
        );

        const res = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getMultipleAccounts",
            params: [pdaPairs.map((p) => p.pda), { encoding: "base64" }],
          }),
        });

        const json = await res.json();
        if (cancelled) return;

        const result: Record<string, number> = {};
        (json.result?.value ?? []).forEach((acct: any, i: number) => {
          if (!acct?.data?.[0]) return;
          try {
            const raw = Uint8Array.from(atob(acct.data[0]), (c) => c.charCodeAt(0));
            const rep = deserializeReputationAccount(raw, pdaPairs[i].pda as Address);
            result[pdaPairs[i].creator] = rep.winRateBps;
          } catch {}
        });

        setRates(result);
      } catch {}
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorKey]);

  return rates;
}

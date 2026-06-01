import { useEffect, useState } from "react";
import { getProgramDerivedAddress, getAddressEncoder, type Address } from "@solana/kit";
import { USDC_DEVNET_MINT } from "@terrace/sdk";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/**
 * Reads the human-USDC balance held by a market's vault. The market account
 * itself owns an associated-token-account for USDC; its balance is the total
 * stake locked in the market.
 *
 * For private markets the on-chain `total_volume` field is intentionally not
 * updated (privacy), so the vault balance is the only honest signal of pool
 * size visible to outside observers. It leaks total pool, never per-side
 * volumes — both YES and NO contributions get pooled into the same vault.
 *
 * Returns null while loading or on error; the caller decides the fallback
 * (e.g. show "Vol sealed" instead of "$0.00").
 */
export function useMarketVaultBalance(marketAddress: string | null | undefined): number | null {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!marketAddress || !HELIUS_RPC_URL) { setBalance(null); return; }
    let cancelled = false;

    (async () => {
      try {
        const enc = getAddressEncoder();
        const [vaultAddress] = await getProgramDerivedAddress({
          programAddress: ASSOC_TOKEN_PROGRAM_ID,
          seeds: [
            enc.encode(marketAddress as Address),
            enc.encode(TOKEN_PROGRAM_ID),
            enc.encode(USDC_DEVNET_MINT),
          ],
        });

        const res = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountBalance",
            params: [String(vaultAddress), { commitment: "confirmed" }],
          }),
        });
        const json = await res.json();
        // Token account doesn't exist yet (no bets) → uiAmount=null in response,
        // surface as 0 so the UI can render "$0.00 pooled".
        const ui = json?.result?.value?.uiAmount;
        if (!cancelled) setBalance(typeof ui === "number" ? ui : 0);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();

    return () => { cancelled = true; };
  }, [marketAddress]);

  return balance;
}

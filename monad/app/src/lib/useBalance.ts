"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./account";
import { publicClient } from "./chain";
import { ADDR, erc20Abi } from "./contracts";

export type Balances = { usd: bigint; usdc: bigint; gas: bigint };

/** The signed-in fan's balances, refreshed every 15s and after any `terrace-balance` event. */
export function useBalance() {
  const { address } = useAccount();
  const [bal, setBal] = useState<Balances | null>(null);
  const load = useCallback(() => {
    if (!address) return setBal(null);
    Promise.all([
      publicClient.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      publicClient.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      publicClient.getBalance({ address }),
    ])
      .then(([usd, usdc, gas]) => setBal({ usd, usdc, gas }))
      .catch(() => {});
  }, [address]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    window.addEventListener("terrace-balance", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("terrace-balance", load);
    };
  }, [load]);
  return { balance: bal, refresh: load };
}

/** Tell every balance pill to refresh (after a bet, collect or top-up). */
export const balanceChanged = () => window.dispatchEvent(new Event("terrace-balance"));

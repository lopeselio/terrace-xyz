import { useState, useEffect, useCallback } from "react";

const DEVNET_RPC  = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

const USDC_DEVNET  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface WalletBalances {
  mainnetSol:  number | null;
  devnetSol:   number | null;
  mainnetUsdc: number | null;
  devnetUsdc:  number | null;
  loading: boolean;
  refresh: () => void;
}

async function rpcFetch(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

interface NetworkBalances { sol: number; usdc: number }

async function fetchNetworkBalances(
  rpcUrl: string,
  walletPubkey: string,
  usdcMint: string
): Promise<NetworkBalances> {
  const [solResult, usdcResult] = await Promise.all([
    rpcFetch(rpcUrl, "getBalance", [walletPubkey, { commitment: "confirmed" }]),
    rpcFetch(rpcUrl, "getTokenAccountsByOwner", [
      walletPubkey,
      { mint: usdcMint },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]),
  ]);

  const lamports = (solResult as { value: number }).value;
  const sol = lamports / 1e9;

  type TokenAccounts = { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }> };
  const accounts = (usdcResult as TokenAccounts).value;
  const usdc = accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;

  return { sol, usdc };
}

export function useWalletBalances(walletPubkey: string | null): WalletBalances {
  const [mainnetSol,  setMainnetSol]  = useState<number | null>(null);
  const [devnetSol,   setDevnetSol]   = useState<number | null>(null);
  const [mainnetUsdc, setMainnetUsdc] = useState<number | null>(null);
  const [devnetUsdc,  setDevnetUsdc]  = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletPubkey) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [devnet, mainnet] = await Promise.all([
          DEVNET_RPC
            ? fetchNetworkBalances(DEVNET_RPC, walletPubkey, USDC_DEVNET).catch(() => null)
            : Promise.resolve(null),
          fetchNetworkBalances(MAINNET_RPC, walletPubkey, USDC_MAINNET).catch(() => null),
        ]);

        if (cancelled) return;
        setDevnetSol(devnet?.sol ?? null);
        setDevnetUsdc(devnet?.usdc ?? null);
        setMainnetSol(mainnet?.sol ?? null);
        setMainnetUsdc(mainnet?.usdc ?? null);
      } catch {
        // leave balances as null
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [walletPubkey, tick]);

  return { mainnetSol, devnetSol, mainnetUsdc, devnetUsdc, loading, refresh };
}

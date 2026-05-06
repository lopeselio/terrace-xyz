import { useRef, useState, useCallback } from "react";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
// VersionedTransaction from web3.js v1 is required here because the MWA
// -web3js bridge expects it. Jupiter returns v0 txs — @solana/kit has no
// equivalent for MWA tx signing on mobile yet.
import { VersionedTransaction } from "@solana/web3.js";
import { toUint8Array, fromUint8Array } from "js-base64";

// ---------------------------------------------------------------------------
// Privy (optional — only loaded if EXPO_PUBLIC_PRIVY_APP_ID is set)
// ---------------------------------------------------------------------------

// We use a lazy import pattern so the app works without Privy installed
// (during local dev / CI before the package is added). Once @privy-io/expo
// is in package.json the import resolves normally.
let privyModule: typeof import("@privy-io/expo") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  privyModule = require("@privy-io/expo");
} catch {
  // Privy not installed — MWA-only mode
}

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";

const APP_IDENTITY = {
  name: "Terrace",
  uri: "https://terrace.app",
  icon: "/favicon.ico",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletTrack = "mwa" | "privy";

export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  track: WalletTrack | null;
}

export interface UseWalletReturn extends WalletState {
  /** Connect via Solana Mobile Wallet Adapter (Phantom, Solflare, Seeker) */
  connectMWA: () => Promise<void>;
  /**
   * Connect via Privy embedded wallet (email / Google).
   * loginMethod: "email" | "google" — passed to Privy's login flow.
   * No-op if Privy is not configured (EXPO_PUBLIC_PRIVY_APP_ID not set).
   */
  connectPrivy: (loginMethod?: "email" | "google") => Promise<void>;
  /** Legacy alias — connects via MWA for backwards compat */
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Signs a base64 VersionedTransaction; works for both tracks */
  signTransaction: (base64Tx: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    connected: false,
    connecting: false,
    track: null,
  });

  // MWA auth token persists between transact() sessions
  const authToken = useRef<string | null>(null);

  // Privy embedded wallet signer (set after Privy login)
  const privySigner = useRef<{ address: string; signTransaction: (tx: Uint8Array) => Promise<Uint8Array> } | null>(null);

  // ── MWA connect ──────────────────────────────────────────────────────
  const connectMWA = useCallback(async () => {
    setState((s: WalletState) => ({ ...s, connecting: true }));
    try {
      await transact(async (wallet: Web3MobileWallet) => {
        const result = await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });

        if (result.accounts.length === 0) throw new Error("No accounts returned");

        authToken.current = result.auth_token;

        const pubkeyBytes = toUint8Array(result.accounts[0].address);
        setState({
          publicKey: encodeBase58(pubkeyBytes),
          connected: true,
          connecting: false,
          track: "mwa",
        });
      });
    } catch (e) {
      console.error("MWA connect error:", e);
      setState({ publicKey: null, connected: false, connecting: false, track: null });
    }
  }, []);

  // ── Privy connect ─────────────────────────────────────────────────────
  const connectPrivy = useCallback(async (loginMethod: "email" | "google" = "email") => {
    if (!privyModule || !PRIVY_APP_ID) {
      console.warn("Privy not configured — set EXPO_PUBLIC_PRIVY_APP_ID and install @privy-io/expo");
      return;
    }

    setState((s: WalletState) => ({ ...s, connecting: true }));
    try {
      // Privy hooks (usePrivy, useEmbeddedSolanaWallet) must be used at component
      // level; here we use the imperative client path instead.
      // Privy hooks must be called at the component level, not inside callbacks.
      // We expose a helper on the module to trigger login from outside React hooks.
      // The actual Privy hook integration is in PrivyProvider wrapping App root.
      // Here we just call the imperative login method if available.
      const privy = (privyModule as any).getPrivyClient?.();
      if (!privy) {
        console.warn("Privy client not initialised — wrap your app in <PrivyProvider>");
        setState((s: WalletState) => ({ ...s, connecting: false }));
        return;
      }

      if (loginMethod === "google") {
        await privy.login({ loginMethods: ["google"] });
      } else {
        await privy.login({ loginMethods: ["email"] });
      }

      // After login Privy creates an embedded Solana wallet automatically
      const embeddedWallet = privy.user?.linkedAccounts?.find(
        (a: any) => a.type === "wallet" && a.walletClientType === "privy" && a.chainType === "solana"
      );

      if (!embeddedWallet) throw new Error("Privy: no embedded Solana wallet created");

      privySigner.current = {
        address: embeddedWallet.address,
        signTransaction: async (txBytes: Uint8Array) => {
          const signed = await privy.embeddedWallet.signTransaction(Buffer.from(txBytes).toString("base64"));
          return toUint8Array(signed);
        },
      };

      setState({
        publicKey: embeddedWallet.address,
        connected: true,
        connecting: false,
        track: "privy",
      });
    } catch (e) {
      console.error("Privy connect error:", e);
      setState({ publicKey: null, connected: false, connecting: false, track: null });
    }
  }, []);

  // ── signTransaction ───────────────────────────────────────────────────
  const signTransaction = useCallback(async (base64Tx: string): Promise<string> => {
    if (state.track === "privy" && privySigner.current) {
      const txBytes = toUint8Array(base64Tx);
      const signed = await privySigner.current.signTransaction(txBytes);
      return fromUint8Array(signed);
    }

    // Default: MWA path
    return transact(async (wallet: Web3MobileWallet) => {
      if (authToken.current) {
        const reauth = await wallet.reauthorize({
          auth_token: authToken.current,
          identity: APP_IDENTITY,
        });
        authToken.current = reauth.auth_token;
      } else {
        const result = await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });
        if (result.accounts.length === 0) throw new Error("No accounts for signing");
        authToken.current = result.auth_token;
      }

      const txBytes = toUint8Array(base64Tx);
      const tx = VersionedTransaction.deserialize(txBytes);
      const [signed] = await wallet.signTransactions({ transactions: [tx] });
      return fromUint8Array((signed as VersionedTransaction).serialize());
    });
  }, [state.track]);

  const disconnect = useCallback(() => {
    authToken.current = null;
    privySigner.current = null;
    setState({ publicKey: null, connected: false, connecting: false, track: null });
  }, []);

  return {
    ...state,
    connectMWA,
    connectPrivy,
    connect: connectMWA,
    disconnect,
    signTransaction,
  };
}

// ---------------------------------------------------------------------------
// Base58 encoder (minimal, for pubkey display)
// ---------------------------------------------------------------------------

function encodeBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let result = "";
  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

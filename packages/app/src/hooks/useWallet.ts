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
  connectMWA: () => Promise<string | null>;
  /** Legacy alias — connects via MWA for backwards compat */
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Signs a base64 VersionedTransaction; works for MWA and Privy embedded wallet */
  signTransaction: (base64Tx: string) => Promise<string>;
  /**
   * Register the Privy embedded wallet signer. Called from App.tsx once
   * useEmbeddedSolanaWallet() status reaches "connected". Pass null to clear.
   */
  setPrivySigner: (signer: ((tx: Uint8Array) => Promise<Uint8Array>) | null) => void;
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

  // Privy embedded wallet signer — set by App.tsx via setPrivySigner()
  // when useEmbeddedSolanaWallet().status reaches "connected".
  const privySigner = useRef<((tx: Uint8Array) => Promise<Uint8Array>) | null>(null);

  // ── MWA connect ──────────────────────────────────────────────────────
  const connectMWA = useCallback(async (): Promise<string | null> => {
    setState((s: WalletState) => ({ ...s, connecting: true }));
    try {
      let resolvedPubkey: string | null = null;
      await transact(async (wallet: Web3MobileWallet) => {
        const result = await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });

        if (result.accounts.length === 0) throw new Error("No accounts returned");

        authToken.current = result.auth_token;

        // MWA v2 returns addresses as base64 (ends with '=') or base58.
        // Buffer.from handles all base64 variants without throwing.
        const raw = result.accounts[0].address;
        let pubkey: string;
        if (raw.endsWith("=")) {
          const bytes = new Uint8Array(Buffer.from(raw, "base64"));
          pubkey = bytes.length === 32 ? encodeBase58(bytes) : raw;
        } else {
          pubkey = raw;
        }
        resolvedPubkey = pubkey;
        setState({
          publicKey: pubkey,
          connected: true,
          connecting: false,
          track: "mwa",
        });
      });
      return resolvedPubkey;
    } catch (e) {
      console.error("MWA connect error:", e);
      setState({ publicKey: null, connected: false, connecting: false, track: null });
      throw e; // re-throw so caller can handle/display
    }
  }, []);

  // ── Privy signer registration ─────────────────────────────────────────
  // Called from App.tsx once useEmbeddedSolanaWallet().status === "connected".
  // The signer wraps solanaWallet.getProvider().request({ method: 'signTransaction' }).
  const setPrivySigner = useCallback(
    (signer: ((tx: Uint8Array) => Promise<Uint8Array>) | null) => {
      privySigner.current = signer;
    },
    []
  );

  // ── signTransaction ───────────────────────────────────────────────────
  const signTransaction = useCallback(async (base64Tx: string): Promise<string> => {
    // Privy embedded wallet — registered by App.tsx via setPrivySigner()
    if (state.track !== "mwa" && privySigner.current) {
      const txBytes = toUint8Array(base64Tx);
      const signed = await privySigner.current(txBytes);
      return fromUint8Array(signed);
    }

    // MWA path (Phantom / Solflare)
    if (state.track !== "mwa" && !privySigner.current) {
      throw new Error("No wallet connected for signing. Connect Phantom or use email sign-in.");
    }

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
    connect: connectMWA,
    disconnect,
    signTransaction,
    setPrivySigner,
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

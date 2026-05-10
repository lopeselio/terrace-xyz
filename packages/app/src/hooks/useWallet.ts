import { useReducer, useEffect } from "react";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { VersionedTransaction } from "@solana/web3.js";
import { toUint8Array, fromUint8Array } from "js-base64";

const APP_IDENTITY = {
  name: "Terrace",
  uri: "https://terrace.app",
  icon: "/favicon.ico",
} as const;

// ---------------------------------------------------------------------------
// Module-level singleton — one shared state across every useWallet() call site
// ---------------------------------------------------------------------------

export type WalletTrack = "mwa" | "privy";

export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  track: WalletTrack | null;
}

let _state: WalletState = {
  publicKey: null,
  connected: false,
  connecting: false,
  track: null,
};

// MWA auth token — persists between transact() sessions
let _authToken: string | null = null;

// Privy embedded wallet signer — set by App.tsx via setPrivySigner()
let _privySigner: ((tx: Uint8Array) => Promise<Uint8Array>) | null = null;

// All mounted useWallet() subscribers — notified on every state change
const _listeners = new Set<() => void>();

function _setState(update: WalletState | ((prev: WalletState) => WalletState)) {
  _state = typeof update === "function" ? update(_state) : update;
  _listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWalletReturn extends WalletState {
  connectMWA: () => Promise<string | null>;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  signTransaction: (base64Tx: string) => Promise<string>;
  /**
   * Register the Privy embedded wallet signer. Called from App.tsx once
   * useEmbeddedSolanaWallet() status reaches "connected". Pass null to clear.
   * Providing pubkey updates publicKey/connected for all hook instances.
   */
  setPrivySigner: (
    signer: ((tx: Uint8Array) => Promise<Uint8Array>) | null,
    pubkey?: string | null
  ) => void;
}

// ---------------------------------------------------------------------------
// Stable action functions (defined once at module level)
// ---------------------------------------------------------------------------

async function connectMWA(): Promise<string | null> {
  _setState((s) => ({ ...s, connecting: true }));
  try {
    let resolvedPubkey: string | null = null;
    await transact(async (wallet: Web3MobileWallet) => {
      const result = await wallet.authorize({
        cluster: "devnet",
        identity: APP_IDENTITY,
      });
      if (result.accounts.length === 0) throw new Error("No accounts returned");

      _authToken = result.auth_token;

      const raw = result.accounts[0].address;
      let pubkey: string;
      if (raw.endsWith("=")) {
        const bytes = new Uint8Array(Buffer.from(raw, "base64"));
        pubkey = bytes.length === 32 ? encodeBase58(bytes) : raw;
      } else {
        pubkey = raw;
      }
      resolvedPubkey = pubkey;
      _setState({ publicKey: pubkey, connected: true, connecting: false, track: "mwa" });
    });
    return resolvedPubkey;
  } catch (e) {
    console.error("MWA connect error:", e);
    _setState({ publicKey: null, connected: false, connecting: false, track: null });
    throw e;
  }
}

function setPrivySigner(
  signer: ((tx: Uint8Array) => Promise<Uint8Array>) | null,
  pubkey?: string | null
) {
  _privySigner = signer;
  if (signer && pubkey) {
    _setState({ publicKey: pubkey, connected: true, connecting: false, track: "privy" });
  } else if (!signer) {
    _setState((s) =>
      s.track === "privy"
        ? { publicKey: null, connected: false, connecting: false, track: null }
        : s
    );
  }
}

async function signTransaction(base64Tx: string): Promise<string> {
  // Privy path
  if (_state.track !== "mwa" && _privySigner) {
    const txBytes = toUint8Array(base64Tx);
    const signed = await _privySigner(txBytes);
    return fromUint8Array(signed);
  }

  if (_state.track !== "mwa" && !_privySigner) {
    throw new Error("No wallet connected. Connect Phantom or sign in with email.");
  }

  // MWA path (Phantom / Solflare / Seeker Seed Vault)
  try {
    return await transact(async (wallet: Web3MobileWallet) => {
      // Try reauthorize first; fall back to fresh authorize if the stored token
      // was rejected (e.g. wallet was reinstalled or session expired).
      if (_authToken) {
        try {
          const reauth = await wallet.reauthorize({
            auth_token: _authToken,
            identity: APP_IDENTITY,
          });
          _authToken = reauth.auth_token;
        } catch {
          _authToken = null;
          const result = await wallet.authorize({
            cluster: "devnet",
            identity: APP_IDENTITY,
          });
          if (result.accounts.length === 0) throw new Error("No accounts for signing");
          _authToken = result.auth_token;
        }
      } else {
        const result = await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });
        if (result.accounts.length === 0) throw new Error("No accounts for signing");
        _authToken = result.auth_token;
      }

      const txBytes = toUint8Array(base64Tx);
      const tx = VersionedTransaction.deserialize(txBytes);
      const [signed] = await wallet.signTransactions({ transactions: [tx] });
      return fromUint8Array((signed as VersionedTransaction).serialize());
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // CancellationException = wallet activity dismissed or Seed Vault auth interrupted
    if (msg.includes("CancellationException")) {
      throw new Error("Wallet signing was cancelled. Please try again.");
    }
    // Ping timeout = Seed Vault signing took too long and the MWA keepalive expired
    if (msg.includes("Ping reached timeout") || msg.includes("Ping") && msg.includes("timeout")) {
      throw new Error("Wallet timed out while signing. Please try again — it may be faster on the second attempt.");
    }
    // Session closed before signing completed (e.g. wallet was backgrounded)
    if (msg.includes("ERROR_SESSION_CLOSED") || msg.includes("ERROR_SESSION_TIMEOUT")) {
      throw new Error("Wallet session closed. Please try again.");
    }
    // User declined the wallet association chooser
    if (msg.includes("ERROR_ASSOCIATION_CANCELLED")) {
      throw new Error("Wallet connection was cancelled.");
    }
    // User declined signing inside the wallet
    if (msg.includes("ERROR_NOT_SIGNED")) {
      throw new Error("Transaction was rejected in wallet.");
    }
    throw e;
  }
}

function disconnect() {
  _authToken = null;
  _privySigner = null;
  _setState({ publicKey: null, connected: false, connecting: false, track: null });
}

// ---------------------------------------------------------------------------
// Hook — subscribes to the singleton and re-renders on state changes
// ---------------------------------------------------------------------------

export function useWallet(): UseWalletReturn {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    _listeners.add(forceUpdate);
    return () => { _listeners.delete(forceUpdate); };
  }, []);

  return {
    ..._state,
    connectMWA,
    connect: connectMWA,
    disconnect,
    signTransaction,
    setPrivySigner,
  };
}

// ---------------------------------------------------------------------------
// Base58 encoder
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

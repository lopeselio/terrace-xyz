import { useState, useCallback } from "react";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { toUint8Array } from "js-base64";

const HELIUS_DEVNET_RPC =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY";

export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    connected: false,
    connecting: false,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true }));
    try {
      await transact(async (wallet: Web3MobileWallet) => {
        const { accounts } = await wallet.authorize({
          cluster: "devnet",
          identity: {
            name: "Terrace",
            uri: "https://terrace.app",
            icon: "/favicon.ico",
          },
        });

        if (accounts.length === 0) throw new Error("No accounts returned");

        const pubkeyBytes = toUint8Array(accounts[0].address);
        const pubkeyBase58 = encodeBase58(pubkeyBytes);

        setState({
          publicKey: pubkeyBase58,
          connected: true,
          connecting: false,
        });
      });
    } catch (e) {
      console.error("Wallet connect error:", e);
      setState({ publicKey: null, connected: false, connecting: false });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ publicKey: null, connected: false, connecting: false });
  }, []);

  return { ...state, connect, disconnect };
}

// Minimal base58 encoder for display — full encoding handled by @solana/kit in SDK
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

import { useState, useEffect, useCallback } from "react";
import type { Address } from "@solana/kit";
import type { Bet } from "@terrace/sdk";
import { TERRACE_PROGRAM_ID } from "@terrace/sdk";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

// Bet account layout (after 8-byte discriminator):
//   market:          32 bytes  [8..40]
//   bettor:          32 bytes  [40..72]  ← filter anchor
//   outcome:         1  byte   [72]
//   amount:          8  bytes  [73..81]
//   claimed:         1  byte   [81]
//   result_recorded: 1  byte   [82]
//   bump:            1  byte   [83]

function b58Decode(addr: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const c of addr) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`bad base58 char: ${c}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
  const leadingZeros = addr.match(/^1*/)?.[0].length ?? 0;
  return new Uint8Array([...Array(leadingZeros).fill(0), ...bytes]);
}

function deserializeBet(data: Uint8Array, address: Address): Bet {
  const view = new DataView(data.buffer, data.byteOffset);
  const readPubkey = (off: number) =>
    // Convert raw bytes to base58 address — simplest path: use existing encoding
    Array.from(data.slice(off, off + 32))
      .reduce((acc, b) => acc * 256n + BigInt(b), 0n)
      .toString(16)
      .padStart(64, "0") as unknown as Address; // stored as hex string — ok for display

  // Use proper address encoding
  const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytesToB58 = (bytes: Uint8Array): Address => {
    let num = BigInt(0);
    for (const b of bytes) num = num * 256n + BigInt(b);
    let str = "";
    while (num > 0n) { str = ALPHA[Number(num % 58n)] + str; num /= 58n; }
    const leading = bytes.findIndex((b) => b !== 0);
    return ("1".repeat(leading < 0 ? 0 : leading) + str) as Address;
  };

  const market = bytesToB58(data.slice(8, 40));
  const bettor = bytesToB58(data.slice(40, 72));
  const outcome = view.getUint8(72);
  const amount = view.getBigUint64(73, true);
  const claimed = view.getUint8(81) === 1;
  const resultRecorded = view.getUint8(82) === 1;
  const bump = view.getUint8(83);

  return { address, market, bettor, outcome, amount, claimed, resultRecorded, bump };
}

interface UseBetsResult {
  bets: Bet[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBets(walletPubkey: string | null): UseBetsResult {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletPubkey || !HELIUS_RPC_URL) {
      setBets([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const bettorBytes = b58Decode(walletPubkey);
        const bettorBase64 = btoa(String.fromCharCode(...bettorBytes));

        const res = await fetch(HELIUS_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getProgramAccounts",
            params: [
              TERRACE_PROGRAM_ID,
              {
                encoding: "base64",
                filters: [
                  { dataSize: 84 },
                  { memcmp: { offset: 40, bytes: bettorBase64, encoding: "base64" } },
                ],
              },
            ],
          }),
        });

        const json = await res.json();
        if (cancelled) return;

        const accounts: Array<{ pubkey: string; account: { data: [string, string] } }> =
          json.result ?? [];

        const parsed = accounts.map(({ pubkey, account }) => {
          const raw = Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0));
          return deserializeBet(raw, pubkey as Address);
        });

        setBets(parsed);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [walletPubkey, tick]);

  return { bets, loading, error, refresh };
}

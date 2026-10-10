/**
 * Sealed picks and bets.
 *
 * The app encrypts a player's choice to the CRE reveal key, and the contract only ever sees
 * a commitment plus this ciphertext. After close, the reveal workflow opens the ciphertext
 * and reports the plaintext; the contract checks it against the commitment.
 *
 * Format: ephemeral X25519 public key (32) | nonce (24) | XChaCha20-Poly1305 ciphertext.
 * The key is derived as sha256(sharedSecret || ephemeralPub || recipientPub).
 * The app ships an identical copy of this file (app/src/lib/sealed.ts).
 */
import { x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, type Hex } from "viem";

export type SealedBet = { v: 1; side: 1 | 2; salt: Hex };
export type SealedPicks = { v: 1; home: number[]; away: number[]; salt: Hex };

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// Payloads are ASCII JSON; avoid TextEncoder, which the CRE runtime may not provide.
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0x7f);
const unascii = (b: Uint8Array) => String.fromCharCode(...b);

const deriveKey = (shared: Uint8Array, ephemeralPub: Uint8Array, recipientPub: Uint8Array) =>
  sha256(concat(shared, ephemeralPub, recipientPub));

export function revealPublicKey(revealPrivateKey: Hex): Hex {
  return bytesToHex(x25519.getPublicKey(hexToBytes(revealPrivateKey)));
}

/** Encrypt to the reveal key. `randomBytes` must be a CSPRNG (crypto.getRandomValues in the app). */
export function seal(recipientPub: Hex, message: SealedBet | SealedPicks, randomBytes: (n: number) => Uint8Array): Hex {
  const ephemeralPriv = randomBytes(32);
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
  const recipient = hexToBytes(recipientPub);
  const key = deriveKey(x25519.getSharedSecret(ephemeralPriv, recipient), ephemeralPub, recipient);
  const nonce = randomBytes(24);
  const plaintext = ascii(JSON.stringify(message));
  return bytesToHex(concat(ephemeralPub, nonce, xchacha20poly1305(key, nonce).encrypt(plaintext)));
}

/** Decrypt with the reveal key. Returns null for anything malformed, so one bad entry can't stop a batch. */
export function open<T extends SealedBet | SealedPicks>(revealPrivateKey: Hex, sealed: Hex): T | null {
  try {
    const bytes = hexToBytes(sealed);
    if (bytes.length < 32 + 24 + 16) return null;
    const ephemeralPub = bytes.slice(0, 32);
    const nonce = bytes.slice(32, 56);
    const priv = hexToBytes(revealPrivateKey);
    const key = deriveKey(x25519.getSharedSecret(priv, ephemeralPub), ephemeralPub, x25519.getPublicKey(priv));
    const plaintext = xchacha20poly1305(key, nonce).decrypt(bytes.slice(56));
    return JSON.parse(unascii(plaintext)) as T;
  } catch {
    return null;
  }
}

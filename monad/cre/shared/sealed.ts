/**
 * Sealed picks and bets.
 *
 * The app encrypts a player's choice to the CRE reveal key, and the contract only ever sees
 * a commitment plus this ciphertext. After close, the reveal workflow opens the ciphertext
 * and reports the plaintext; the contract checks it against the commitment.
 *
 * Box format: ephemeral X25519 public key (32) | nonce (24) | XChaCha20-Poly1305 ciphertext.
 * The key is derived as sha256(sharedSecret || ephemeralPub || recipientPub).
 *
 * Two-box envelope (sealed league picks): "TSB1" | uint16 length of the CRE box | CRE box | self box.
 * The self box is sealed to the fan's own passkey-derived X25519 key (Mera's terrace/self-box/v1
 * namespace), so the fan can read their sealed picks back on any device before the reveal, while
 * nobody else can. A plain box (no "TSB1" tag) is still read as before.
 * The app imports this same file (via the @shared alias).
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

const TAG = [0x54, 0x53, 0x42, 0x31]; // "TSB1"

/** Pack the CRE box and the fan's own box into one ciphertext. */
export function envelope(creBox: Hex, selfBox: Hex): Hex {
  const cre = hexToBytes(creBox);
  if (cre.length > 0xffff) throw new Error("box too large");
  return bytesToHex(concat(Uint8Array.from(TAG), Uint8Array.from([cre.length >> 8, cre.length & 0xff]), cre, hexToBytes(selfBox)));
}

/** Split an envelope into its boxes. A plain (untagged) box is the CRE box with no self box. */
export function unwrap(sealed: Hex): { cre: Hex; self: Hex | null } {
  try {
    const b = hexToBytes(sealed);
    if (b.length < 6 || TAG.some((t, i) => b[i] !== t)) return { cre: sealed, self: null };
    const n = (b[4] << 8) | b[5];
    if (b.length < 6 + n) return { cre: sealed, self: null };
    const self = b.slice(6 + n);
    return { cre: bytesToHex(b.slice(6, 6 + n)), self: self.length ? bytesToHex(self) : null };
  } catch {
    return { cre: sealed, self: null };
  }
}

/** The fan's own copy of their sealed picks, opened with their passkey-derived self-box key. */
export function openOwn<T extends SealedBet | SealedPicks>(selfBoxPrivateKey: Hex, sealed: Hex): T | null {
  const { self } = unwrap(sealed);
  return self ? openBox<T>(selfBoxPrivateKey, self) : null;
}

/** Decrypt with the reveal key. Returns null for anything malformed, so one bad entry can't stop a batch. */
export function open<T extends SealedBet | SealedPicks>(revealPrivateKey: Hex, sealed: Hex): T | null {
  return openBox<T>(revealPrivateKey, unwrap(sealed).cre);
}

function openBox<T extends SealedBet | SealedPicks>(revealPrivateKey: Hex, sealed: Hex): T | null {
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

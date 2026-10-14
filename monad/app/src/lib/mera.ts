"use client";
/**
 * Mera is Terrace's whole account layer: no seed phrase, no extension, no email code.
 *
 * One passkey ceremony gives one 32-byte PRF output. Everything a fan needs is derived from
 * it with HKDF-SHA256, each in its own namespace, so nothing is ever stored on the device
 * and it all comes back on a fresh phone from the passkey alone:
 *
 *   terrace/account/v1       secp256k1 key behind the player's Monad account (signing session)
 *   terrace/seal/v1          HMAC key for sealed-pick salts, so a sealed bet can be revealed from any device
 *   terrace/self-box/v1      X25519 key for the fan's own encrypted copy of their sealed picks
 *   terrace/agent/v1         secp256k1 key for the fan's AI agent (its own wallet, its own record)
 *   terrace/agent-memory/v1  AES key for the agent's notes, readable by nobody else
 *
 * Signing happens through a Mera signing session (the key lives only in memory), so picks,
 * chat and small bets need no prompt. Bigger stakes ask for the passkey again (see `confirmPresence`).
 */
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";

// The passkey this session signed in with: re-confirming asks for exactly that one, so a phone
// holding several Terrace passkeys can't hand back the wrong account mid-bet.
let activeCredential: PasskeyCredentialMetadata | null = null;
let activeRpId: string | null = null;

/** Where Terrace has lived before: passkeys made there still sign in here (see /.well-known/webauthn). */
export const PREVIOUS_HOMES = ["terrace-monad.vercel.app"];
import { toViemAccount } from "@category-labs/mera/viem";
import { secp256k1 } from "@noble/curves/secp256k1";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, type Hex, type LocalAccount } from "viem";
import { FanError, friendlyError } from "./errors";

const enc = new TextEncoder();
/** PRF salt for Terrace's root secret. Stable forever: changing it would give everyone new accounts. */
const PRF_SALT = sha256(enc.encode("terrace.passkey.prf.v1"));

/** Above this (in dollars), a bet asks for the passkey again instead of signing silently. */
export const PROMPT_FREE_LIMIT = 25;
/** A signing session ends after this long without use; the next action asks for the passkey. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export type Keys = {
  account: LocalAccount;
  agentAccount: LocalAccount;
  sealKey: Uint8Array; // HMAC key for deterministic salts
  selfBoxPrivate: Uint8Array; // X25519
  selfBoxPublic: Hex;
  memoryKey: Uint8Array; // AES-256
};

let session: Secp256k1SigningSession | null = null;
let agentSession: Secp256k1SigningSession | null = null;
let lastUsed = 0;

// Passkeys belong to a site. On terrace.social (and app.terrace.social) they belong to the parent
// domain, so one passkey works on every Terrace address there; elsewhere, to the current host.
const rpId = () => {
  if (process.env.NEXT_PUBLIC_RP_ID) return process.env.NEXT_PUBLIC_RP_ID;
  const host = window.location.hostname;
  return host === "terrace.social" || host.endsWith(".terrace.social") ? "terrace.social" : host;
};

function derive(prf: Uint8Array, info: string, length = 32): Uint8Array {
  return hkdf(sha256, prf, enc.encode("terrace"), enc.encode(info), length);
}

/** A valid secp256k1 private key from 32 derived bytes (re-hash in the ~2^-128 case it's out of range). */
function secpKey(seed: Uint8Array): Uint8Array {
  let k = seed;
  while (!secp256k1.utils.isValidPrivateKey(k)) k = sha256(k);
  return k;
}

function fromPrf(prf: Uint8Array): Keys {
  session?.end();
  agentSession?.end();
  session = createSecp256k1SigningSession({ privateKey: secpKey(derive(prf, "terrace/account/v1")) });
  agentSession = createSecp256k1SigningSession({ privateKey: secpKey(derive(prf, "terrace/agent/v1")) });
  const selfBoxPrivate = derive(prf, "terrace/self-box/v1");
  lastUsed = Date.now();
  return {
    account: toViemAccount(session),
    agentAccount: toViemAccount(agentSession),
    sealKey: derive(prf, "terrace/seal/v1"),
    selfBoxPrivate,
    selfBoxPublic: bytesToHex(x25519.getPublicKey(selfBoxPrivate)),
    memoryKey: derive(prf, "terrace/agent-memory/v1"),
  };
}

/** New fan: one passkey ceremony creates the passkey and the account behind it. */
export async function createAccount(): Promise<Keys> {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const { prfOutput, credentialId, transports } = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Terrace" },
    // A label per passkey so several are easy to tell apart in the phone's picker.
    user: { name: `Terrace ${stamp}`, displayName: "Terrace" },
    prfSalt: PRF_SALT,
  });
  activeCredential = { credentialId, transports };
  activeRpId = rpId();
  return fromPrf(prfOutput);
}

/** Returning fan, any device: the phone offers their Terrace passkey; everything rebuilds from it. */
/** Sign in with a passkey. `home` names an older Terrace address whose passkeys should be used. */
export async function signIn(credential?: PasskeyCredentialMetadata, home?: string): Promise<Keys> {
  const rp = home ?? activeRpId ?? rpId();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: rp, prfSalt: PRF_SALT, credential });
  activeCredential = { credentialId, transports: credential?.transports };
  activeRpId = rp;
  return fromPrf(prfOutput);
}

/**
 * For actions above the prompt-free limit: ask for the passkey again and check it's the same fan.
 * Also renews an idle session.
 */
export async function confirmPresence(expected: Hex): Promise<Keys> {
  const keys = await signIn(activeCredential ?? undefined);
  if (keys.account.address.toLowerCase() !== expected.toLowerCase()) {
    // Wrong passkey picked: say so, but keep the fan signed in to the account they were using.
    throw new FanError("That's a different Terrace passkey. Pick the one you signed in with and try again.");
  }
  return keys;
}

/** True while the in-memory session is fresh enough to sign without a prompt. */
export function sessionLive(): boolean {
  if (!session || Date.now() - lastUsed > SESSION_IDLE_MS) return false;
  lastUsed = Date.now();
  return true;
}

export function signOut() {
  session?.end(); // zeroes the key copy
  agentSession?.end();
  session = agentSession = null;
  activeCredential = null;
  activeRpId = null;
}

/** Deterministic salt for a sealed bet or entry: recoverable from the passkey on any device. */
export function sealSalt(keys: Keys, scope: string): Hex {
  return bytesToHex(hmac(sha256, keys.sealKey, enc.encode(scope)));
}

export function friendlyPasskeyError(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") return "This phone's passkeys can't sign in to Terrace yet. Try Safari on iPhone or Chrome on Android.";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "No passkey was used. Try again when you're ready.";
  }
  return friendlyError(e);
}

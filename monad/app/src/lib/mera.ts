"use client";
/**
 * Mera is Terrace's whole account layer: no seed phrase, no extension, no email code.
 *
 * Everything a fan needs is derived from one 32-byte root with HKDF-SHA256, each in its own
 * namespace, so nothing is ever stored on the device. For a passkey fan the root is the passkey's
 * PRF output, so it all comes back on a fresh phone from the passkey alone:
 *
 *   terrace/account/v1       secp256k1 key behind the player's Monad account (signing session)
 *   terrace/seal/v1          HMAC key for sealed-pick salts, so a sealed bet can be revealed from any device
 *   terrace/self-box/v1      X25519 key for the fan's own encrypted copy of their sealed picks
 *   terrace/agent/v1         secp256k1 key for the fan's AI agent (its own wallet, its own record)
 *   terrace/agent-memory/v1  AES key for the agent's notes, readable by nobody else
 *
 * Another sign-in (an email, or a second passkey) can open the same account: TerraceVault keeps the
 * root encrypted under it on Monad (see vault.ts).
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
import { bytesToHex, type Address, type Hex, type LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FanError, friendlyError } from "./errors";
import { readEntry, unwrapRoot, wrapRoot } from "./vault";

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
// The open account's root, kept in memory only so it can be wrapped for another sign-in.
let root: Uint8Array | null = null;
// How to get the root again for a re-confirm: the same passkey, or the same email sign-in.
let reunlock: (() => Promise<Uint8Array>) | null = null;

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

function fromRoot(r: Uint8Array): Keys {
  session?.end();
  agentSession?.end();
  root = r;
  session = createSecp256k1SigningSession({ privateKey: secpKey(derive(r, "terrace/account/v1")) });
  agentSession = createSecp256k1SigningSession({ privateKey: secpKey(derive(r, "terrace/agent/v1")) });
  const selfBoxPrivate = derive(r, "terrace/self-box/v1");
  lastUsed = Date.now();
  return {
    account: toViemAccount(session),
    agentAccount: toViemAccount(agentSession),
    sealKey: derive(r, "terrace/seal/v1"),
    selfBoxPrivate,
    selfBoxPublic: bytesToHex(x25519.getPublicKey(selfBoxPrivate)),
    memoryKey: derive(r, "terrace/agent-memory/v1"),
  };
}

/** Open an account from its root; `again` fetches the root once more when a big stake needs a re-confirm. */
export function openRoot(r: Uint8Array, again: () => Promise<Uint8Array>): Keys {
  reunlock = again;
  return fromRoot(r);
}

/** A brand-new root, for a fan who starts with email instead of a passkey. */
export const newRoot = () => crypto.getRandomValues(new Uint8Array(32));

/** The open account's root, encrypted for another sign-in (see vault.ts). */
export function wrapOpenRoot(wrapKey: Uint8Array, account: Address): Hex {
  if (!root) throw new FanError("Sign in first.");
  return wrapRoot(root, wrapKey, account);
}

/** A passkey as a vault unlocker: its own signing key and wrap key, both from its PRF. */
function passkeyUnlocker(prf: Uint8Array) {
  return { signer: privateKeyToAccount(bytesToHex(secpKey(derive(prf, "terrace/vault-unlock/v1")))), wrapKey: derive(prf, "terrace/vault-wrap/v1") };
}

/** A passkey's root: its PRF, unless it was added to an account that started elsewhere (then the vault has it). */
async function rootFromPasskey(prf: Uint8Array): Promise<Uint8Array> {
  const { signer, wrapKey } = passkeyUnlocker(prf);
  const entry = await readEntry(signer.address);
  return entry ? unwrapRoot(entry.wrapped, wrapKey, entry.account) : prf;
}

async function passkeyAgain(): Promise<Uint8Array> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: activeRpId ?? rpId(), prfSalt: PRF_SALT, credential: activeCredential ?? undefined });
  return rootFromPasskey(prfOutput);
}

/** Make a passkey for an account that started with email; the caller links it in the vault. */
export async function createPasskeyUnlocker() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const { prfOutput } = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Terrace" },
    user: { name: `Terrace ${stamp}`, displayName: "Terrace" },
    prfSalt: PRF_SALT,
  });
  return passkeyUnlocker(prfOutput);
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
  return openRoot(prfOutput, passkeyAgain);
}

/** Returning fan, any device: the phone offers their Terrace passkey; everything rebuilds from it. */
/** Sign in with a passkey. `home` names an older Terrace address whose passkeys should be used. */
export async function signIn(credential?: PasskeyCredentialMetadata, home?: string): Promise<Keys> {
  const rp = home ?? activeRpId ?? rpId();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: rp, prfSalt: PRF_SALT, credential });
  activeCredential = { credentialId, transports: credential?.transports };
  activeRpId = rp;
  return openRoot(await rootFromPasskey(prfOutput), passkeyAgain);
}

/**
 * For actions above the prompt-free limit: unlock again the way the fan signed in (passkey or email)
 * and check it's the same fan. Also renews an idle session.
 */
export async function confirmPresence(expected: Hex): Promise<Keys> {
  if (!reunlock) throw new FanError("Sign in first.");
  const keys = fromRoot(await reunlock());
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
  root?.fill(0);
  root = null;
  reunlock = null;
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

/**
 * TerraceVault: more ways into one account.
 *
 * Every key a fan has comes from one 32-byte root (see mera.ts). For a passkey fan the root is the
 * passkey's PRF output. To let another sign-in open the same account, we encrypt ("wrap") the root
 * under a key only that sign-in can produce, and store the ciphertext on Monad under the sign-in's
 * address (its "unlocker"):
 *
 *   email (Privy)  unlocker = the embedded wallet; wrap key = HKDF of its signature over WRAP_MESSAGE
 *   extra passkey  unlocker = a key derived from that passkey's PRF; wrap key derived from it too
 *
 * The blob is bound to the account address (AES-GCM associated data), so it can't be passed off as
 * someone else's. The chain only ever sees ciphertext.
 */
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, keccak256, parseAbi, type Address, type Hex } from "viem";
import { publicClient } from "./chain";
import { ADDR } from "./contracts";

export const vaultAbi = parseAbi([
  "function link(address unlocker, bytes wrapped, bytes unlockerSig)",
  "function unlink(address unlocker)",
  "function entryOf(address unlocker) view returns (address account, bytes wrapped)",
  "function nonces(address unlocker) view returns (uint256)",
]);

/** What an email sign-in's wallet signs to make its wrap key. Never changes: a new text means a new key. */
export const WRAP_MESSAGE =
  "Terrace sign-in key\n\nSigning this unlocks your Terrace account. Terrace asks for it each time you sign in with email.\n\nv1";

const VERSION = 1;
const enc = new TextEncoder();

export const vaultReady = () => Boolean(ADDR.vault);

/** The wrap key from an EIP-191 signature. Only r and s count, so a v of 0/1 vs 27/28 can't change it. */
export function wrapKeyFromSignature(signature: Hex): Uint8Array {
  const rs = hexToBytes(signature).slice(0, 64);
  if (rs.length !== 64) throw new Error("unexpected signature length");
  return hkdf(sha256, rs, enc.encode("terrace"), enc.encode("terrace/vault-wrap/v1"), 32);
}

/** version || nonce(12) || AES-256-GCM(root), bound to the account address. */
export function wrapRoot(root: Uint8Array, wrapKey: Uint8Array, account: Address): Hex {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = gcm(wrapKey, nonce, hexToBytes(account)).encrypt(root);
  return bytesToHex(new Uint8Array([VERSION, ...nonce, ...sealed]));
}

export function unwrapRoot(wrapped: Hex, wrapKey: Uint8Array, account: Address): Uint8Array {
  const bytes = hexToBytes(wrapped);
  if (bytes[0] !== VERSION) throw new Error("unknown vault blob version");
  return gcm(wrapKey, bytes.slice(1, 13), hexToBytes(account)).decrypt(bytes.slice(13));
}

export type VaultEntry = { account: Address; wrapped: Hex };

/** The account an unlocker opens, if any. */
export async function readEntry(unlocker: Address): Promise<VaultEntry | null> {
  if (!ADDR.vault) return null;
  const [account, wrapped] = await publicClient.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "entryOf", args: [unlocker] });
  return /^0x0{40}$/i.test(account) ? null : { account, wrapped };
}

/** The EIP-712 Link an unlocker signs so `account` may store `wrapped` under it (TerraceVault.link). */
export function linkMessage(vault: Address, chainId: number, account: Address, wrapped: Hex, nonce: bigint) {
  return {
    domain: { name: "TerraceVault", version: "1", chainId, verifyingContract: vault },
    types: { Link: [{ name: "account", type: "address" }, { name: "wrappedHash", type: "bytes32" }, { name: "nonce", type: "uint256" }] },
    primaryType: "Link" as const,
    // A plain number, not a bigint: Privy sends typed data as JSON, which can't carry bigints.
    message: { account, wrappedHash: keccak256(wrapped), nonce: Number(nonce) },
  };
}

/** linkMessage with the unlocker's current nonce from the deployed vault. */
export async function linkTypedData(unlocker: Address, account: Address, wrapped: Hex) {
  if (!ADDR.vault) throw new Error("vault not deployed");
  const nonce = await publicClient.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "nonces", args: [unlocker] });
  return linkMessage(ADDR.vault, publicClient.chain.id, account, wrapped, nonce);
}

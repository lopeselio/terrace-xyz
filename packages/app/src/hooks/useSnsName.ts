import { useState, useEffect } from "react";
import { getProgramDerivedAddress, address as toAddress, getAddressEncoder } from "@solana/kit";

// AllDomains Name Service (ANS) — on-chain only, no backend
const ANS_PROGRAM       = "ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK" as const;
const TLD_HOUSE_PROGRAM = "TLDHkysf5pCnKsVA4gXpNvmy7psXLPEu4LAdDJthT9S" as const;
const NAME_HOUSE_PROGRAM = "NH3uX6FtVE2fNREAioP7hm5RaozotZxeL6khU1EHx51" as const;
const SNS_PROXY         = "https://sns-sdk-proxy.bonfida.workers.dev";
const MAINNET_RPC       = "https://api.mainnet-beta.solana.com";

// NameRecordHeader layout (Anchor, 8-byte discriminator):
//   0-7:    discriminator
//   8-39:   parentAccount (Pubkey, 32 bytes)
//   40-71:  owner         (Pubkey, 32 bytes)
//   72-103: nftMint       (Pubkey, 32 bytes)
//   104-111: expiresAt    (u64 LE, 8 bytes)
//   112-199: padding
//   200+:   data (for reverse-lookup accounts: domain label UTF-8, null-terminated)
const EXPIRES_AT_OFFSET = 104;
const LABEL_OFFSET      = 200;

// NFT Record layout (Name House program):
//   8:  tag (u8) — must be 1 (ActiveRecord)
//   74: mint (Pubkey, 32 bytes)
const NFT_TAG_OFFSET  = 8;
const NFT_MINT_OFFSET = 74;

// SPL token account: owner at offset 32
const SPL_TOKEN_OWNER_OFFSET = 32;

export interface SnsName {
  name: string | null;
  loading: boolean;
}

// SHA256("ALT Name Service" + name) using native crypto.subtle (Hermes/React Native)
async function ansHash(name: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("ALT Name Service" + name)
  );
  return new Uint8Array(buf);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

async function mainnetRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(MAINNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ── PDA caches ────────────────────────────────────────────────────────────────
let _skrTldHouse:  string | null = null;
let _skrNameHouse: string | null = null;

async function getSkrTldHouse(): Promise<string> {
  if (_skrTldHouse) return _skrTldHouse;
  // seeds: ["tld_house", ".skr"]
  const [tldHouse] = await getProgramDerivedAddress({
    programAddress: toAddress(TLD_HOUSE_PROGRAM),
    seeds: [new TextEncoder().encode("tld_house"), new TextEncoder().encode(".skr")],
  });
  _skrTldHouse = tldHouse as string;
  return _skrTldHouse;
}

async function getSkrNameHouse(tldHouseKey: string): Promise<string> {
  if (_skrNameHouse) return _skrNameHouse;
  const enc = getAddressEncoder();
  // seeds: ["name_house", tldHouseAccount]
  const [nameHouse] = await getProgramDerivedAddress({
    programAddress: toAddress(NAME_HOUSE_PROGRAM),
    seeds: [new TextEncoder().encode("name_house"), enc.encode(toAddress(tldHouseKey))],
  });
  _skrNameHouse = nameHouse as string;
  return _skrNameHouse;
}

// ── Reverse lookup helper ─────────────────────────────────────────────────────
// For each forward-domain account found, derive its reverse-lookup key and read
// the label (stored after the 200-byte header in the reverse-lookup account).
async function fetchLabel(
  nameAccountKey: string,
  tldHouseKey: string
): Promise<string | null> {
  const enc = getAddressEncoder();
  const zero32 = new Uint8Array(32);
  // reverse-lookup seeds: [SHA256("ALT Name Service" + nameAccountKey), tldHouseKey, zero32]
  const [reverseLookupKey] = await getProgramDerivedAddress({
    programAddress: toAddress(ANS_PROGRAM),
    seeds: [
      await ansHash(nameAccountKey),
      enc.encode(toAddress(tldHouseKey)),
      zero32,
    ],
  });

  type InfoResult = { value: { data: [string, string] } | null };
  const info = await mainnetRpc("getAccountInfo", [
    reverseLookupKey as string,
    { encoding: "base64" },
  ]) as InfoResult;

  if (!info?.value?.data) return null;
  const raw = base64ToBytes(info.value.data[0]);
  if (raw.length <= LABEL_OFFSET) return null;

  const payload = raw.slice(LABEL_OFFSET);
  const nullIdx = payload.indexOf(0);
  const label = new TextDecoder().decode(
    nullIdx >= 0 ? payload.slice(0, nullIdx) : payload
  ).trim();

  return label || null;
}

// ── NFT-wrapped resolution ────────────────────────────────────────────────────
// When the name-record owner is the Name House PDA (NFT-wrapped domain),
// check if the wallet holds the associated NFT.
async function isNftHeldByWallet(
  nameAccountKey: string,
  nameHouseKey: string,
  walletPubkey: string
): Promise<boolean> {
  const enc = getAddressEncoder();
  // NFT record PDA: seeds ["nft_record", nameHouse, nameAccount]
  const [nftRecordKey] = await getProgramDerivedAddress({
    programAddress: toAddress(NAME_HOUSE_PROGRAM),
    seeds: [
      new TextEncoder().encode("nft_record"),
      enc.encode(toAddress(nameHouseKey)),
      enc.encode(toAddress(nameAccountKey)),
    ],
  });

  type InfoResult = { value: { data: [string, string] } | null };
  const info = await mainnetRpc("getAccountInfo", [
    nftRecordKey as string,
    { encoding: "base64" },
  ]) as InfoResult;

  if (!info?.value?.data) return false;
  const raw = base64ToBytes(info.value.data[0]);

  // Tag byte must be 1 (ActiveRecord)
  if (raw.length <= NFT_MINT_OFFSET + 32) return false;
  if (raw[NFT_TAG_OFFSET] !== 1) return false;

  // Read NFT mint (32 bytes at NFT_MINT_OFFSET) and convert to base58 address
  const mintBytes = raw.slice(NFT_MINT_OFFSET, NFT_MINT_OFFSET + 32);
  const mintAddress = bytesToAddress(mintBytes);

  // Find the current holder via getTokenLargestAccounts
  type LargestAccountsResult = { value: Array<{ address: string; amount: string }> };
  const largest = await mainnetRpc("getTokenLargestAccounts", [mintAddress]).catch(() => null) as LargestAccountsResult | null;
  if (!largest?.value?.length) return false;

  const holderTokenAccount = largest.value[0].address;
  type TokenInfoResult = { value: { data: [string, string] } | null };
  const tokenInfo = await mainnetRpc("getAccountInfo", [
    holderTokenAccount,
    { encoding: "base64" },
  ]) as TokenInfoResult;

  if (!tokenInfo?.value?.data) return false;
  const tokenRaw = base64ToBytes(tokenInfo.value.data[0]);
  if (tokenRaw.length < SPL_TOKEN_OWNER_OFFSET + 32) return false;

  const holderOwner = bytesToAddress(tokenRaw.slice(SPL_TOKEN_OWNER_OFFSET, SPL_TOKEN_OWNER_OFFSET + 32));
  return holderOwner === walletPubkey;
}

// Convert raw 32 bytes → base58 address string
function bytesToAddress(bytes: Uint8Array): string {
  const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let str = "";
  while (num > 0n) { str = ALPHA[Number(num % 58n)] + str; num /= 58n; }
  const leading = bytes.findIndex((b) => b !== 0);
  return "1".repeat(leading < 0 ? 0 : leading) + str;
}

// ── Main resolution ───────────────────────────────────────────────────────────
async function resolveSkrDomain(walletPubkey: string): Promise<string | null> {
  const tldHouse = await getSkrTldHouse();
  const nowSecs = Math.floor(Date.now() / 1000);
  type AccountResult = { pubkey: string; account: { data: [string, string] } };

  // Pass 1: forward accounts directly owned by wallet
  const direct = await mainnetRpc("getProgramAccounts", [
    ANS_PROGRAM,
    {
      encoding: "base64",
      dataSlice: { offset: 0, length: 112 },
      filters: [{ memcmp: { offset: 40, bytes: walletPubkey } }],
    },
  ]) as AccountResult[];

  for (const { pubkey: nameAccountKey, account } of direct) {
    const raw = base64ToBytes(account.data[0]);
    if (raw.length >= EXPIRES_AT_OFFSET + 8) {
      const expiresAt = readU64LE(raw, EXPIRES_AT_OFFSET);
      if (expiresAt !== 0n && Number(expiresAt) < nowSecs) continue;
    }
    const label = await fetchLabel(nameAccountKey, tldHouse);
    if (label) return `${label}.skr`;
  }

  // Pass 2: NFT-wrapped — Name House is the on-record owner
  const nameHouse = await getSkrNameHouse(tldHouse);

  const nftWrapped = await mainnetRpc("getProgramAccounts", [
    ANS_PROGRAM,
    {
      encoding: "base64",
      dataSlice: { offset: 0, length: 112 },
      filters: [{ memcmp: { offset: 40, bytes: nameHouse } }],
    },
  ]) as AccountResult[];

  for (const { pubkey: nameAccountKey, account } of nftWrapped) {
    const raw = base64ToBytes(account.data[0]);
    if (raw.length >= EXPIRES_AT_OFFSET + 8) {
      const expiresAt = readU64LE(raw, EXPIRES_AT_OFFSET);
      if (expiresAt !== 0n && Number(expiresAt) < nowSecs) continue;
    }
    const label = await fetchLabel(nameAccountKey, tldHouse);
    if (!label) continue;
    const held = await isNftHeldByWallet(nameAccountKey, nameHouse, walletPubkey);
    if (held) return `${label}.skr`;
  }

  return null;
}

export function useSnsName(walletPubkey: string | null): SnsName {
  const [name, setName]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletPubkey) { setName(null); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1. On-chain ANS reverse lookup for .skr (mainnet-beta)
        const skr = await resolveSkrDomain(walletPubkey);
        if (!cancelled && skr) { setName(skr); return; }

        // 2. Bonfida SNS reverse lookup for .sol
        const res = await fetch(`${SNS_PROXY}/reverse-lookup/${walletPubkey}`).catch(() => null);
        if (!cancelled && res?.ok) {
          const json = await res.json().catch(() => null);
          // Bonfida proxy returns { s: "ok", result: "domain" } on success
          if (json?.s === "ok" && typeof json?.result === "string" && json.result && !cancelled) {
            setName(`${json.result}.sol`);
          }
        }
      } catch {
        // no domain found — not an error
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [walletPubkey]);

  return { name, loading };
}

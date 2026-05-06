import {
  Address,
  getProgramDerivedAddress,
  getAddressEncoder,
} from "@solana/kit";

export const TERRACE_PROGRAM_ID =
  (process.env.TERRACE_PROGRAM_ID ??
    "8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF") as Address;

function u64LeBytes(n: bigint): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, n, true);
  return new Uint8Array(buf);
}

export async function getMarketPda(
  creator: Address,
  nonce: bigint,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("market"),
      enc.encode(creator),
      u64LeBytes(nonce),
    ],
  });
}

export async function getBetPda(
  market: Address,
  bettor: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("bet"),
      enc.encode(market),
      enc.encode(bettor),
    ],
  });
}

export async function getReputationPda(
  owner: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("reputation"),
      enc.encode(owner),
    ],
  });
}

export async function getMatchupPda(
  challenger: Address,
  market: Address,
  nonce: bigint,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("matchup"),
      enc.encode(challenger),
      enc.encode(market),
      u64LeBytes(nonce),
    ],
  });
}

export async function getParlayPda(
  creator: Address,
  nonce: bigint,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("parlay"),
      enc.encode(creator),
      u64LeBytes(nonce),
    ],
  });
}

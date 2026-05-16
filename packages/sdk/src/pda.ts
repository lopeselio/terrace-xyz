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
): Promise<readonly [Address, number]> {
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
): Promise<readonly [Address, number]> {
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
): Promise<readonly [Address, number]> {
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
): Promise<readonly [Address, number]> {
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
): Promise<readonly [Address, number]> {
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

// ── Private market PDAs ───────────────────────────────────────────────────────

export async function getPrivateStatePda(
  market: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<readonly [Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [new TextEncoder().encode("private-state"), enc.encode(market)],
  });
}

export async function getPrivateBetRecordPda(
  market: Address,
  bettor: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<readonly [Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      new TextEncoder().encode("private-bet"),
      enc.encode(market),
      enc.encode(bettor),
    ],
  });
}

// ── Arcium PDAs ───────────────────────────────────────────────────────────────

export const ARCIUM_PROGRAM_ID =
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ" as Address;

const ADDRESS_LOOKUP_TABLE_PROGRAM_ID =
  "AddressLookupTab1e1111111111111111111111111" as Address;

// sha256(circuit_name)[0..4] LE — computed at Rust compile time via comp_def_offset().
export const COMP_DEF_OFFSET_INIT_PRIVATE_MARKET_STATE = 3039685700;
export const COMP_DEF_OFFSET_PLACE_PRIVATE_BET = 886724798;
export const COMP_DEF_OFFSET_REVEAL_PRIVATE_MARKET = 2928281020;

function u32LeBytes(n: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, n, true);
  return new Uint8Array(buf);
}

function u64LeBytesBI(n: bigint): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, n, true);
  return new Uint8Array(buf);
}

/** PDA of the MXE account for our program, stored under the Arcium program. */
export async function getArciumMxePda(
  mxeProgram: Address = TERRACE_PROGRAM_ID
): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("MXEAccount"), enc.encode(mxeProgram)],
  });
  return addr;
}

/** Sign PDA — derived from our own program, not the Arcium program. */
export async function getArciumSignPda(
  mxeProgram: Address = TERRACE_PROGRAM_ID
): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: mxeProgram,
    seeds: [new TextEncoder().encode("ArciumSignerAccount")],
  });
  return addr;
}

export async function getArciumCompDefPda(
  compDefOffset: number,
  mxeProgram: Address = TERRACE_PROGRAM_ID
): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("ComputationDefinitionAccount"),
      enc.encode(mxeProgram),
      u32LeBytes(compDefOffset),
    ],
  });
  return addr;
}

export async function getArciumMempoolPda(clusterOffset: number): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("Mempool"), u32LeBytes(clusterOffset)],
  });
  return addr;
}

export async function getArciumExecpoolPda(clusterOffset: number): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("Execpool"), u32LeBytes(clusterOffset)],
  });
  return addr;
}

export async function getArciumComputationPda(
  clusterOffset: number,
  computationOffset: bigint
): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("ComputationAccount"),
      u32LeBytes(clusterOffset),
      u64LeBytesBI(computationOffset),
    ],
  });
  return addr;
}

export async function getArciumClusterPda(clusterOffset: number): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("Cluster"), u32LeBytes(clusterOffset)],
  });
  return addr;
}

export async function getArciumFeePoolPda(): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("FeePool")],
  });
  return addr;
}

export async function getArciumClockPda(): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ARCIUM_PROGRAM_ID,
    seeds: [new TextEncoder().encode("ClockAccount")],
  });
  return addr;
}

// ── League PDAs ───────────────────────────────────────────────────────────────

export async function getLeaguePda(
  creator: Address,
  nonce: bigint,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<readonly [Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [new TextEncoder().encode("league"), enc.encode(creator), u64LeBytes(nonce)],
  });
}

export async function getLeagueMemberPda(
  league: Address,
  member: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<readonly [Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [new TextEncoder().encode("league_member"), enc.encode(league), enc.encode(member)],
  });
}

export async function getLeagueScoreRecordPda(
  league: Address,
  bet: Address,
  programId: Address = TERRACE_PROGRAM_ID
): Promise<readonly [Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [new TextEncoder().encode("league_score"), enc.encode(league), enc.encode(bet)],
  });
}

/**
 * LUT address for an MXE account — needed by init_*_comp_def instructions.
 * `lutOffsetSlot` comes from `MXEAccount.lut_offset_slot` on-chain.
 */
export async function getArciumLutPda(
  mxePda: Address,
  lutOffsetSlot: bigint
): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
    seeds: [enc.encode(mxePda), u64LeBytesBI(lutOffsetSlot)],
  });
  return addr;
}

import { Buffer } from "buffer";
import {
  Address,
  IInstruction,
  AccountRole,
  getAddressEncoder,
} from "@solana/kit";

// Instruction discriminators: sha256("global:<ix_name>")[0..8]
// Regenerate from IDL after `anchor build` if the program is redeployed.
const IX_CREATE_MARKET          = Buffer.from([162, 93, 19, 147, 76, 203, 184, 147]);
const IX_PLACE_BET             = Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]);
const IX_SETTLE_MARKET         = Buffer.from([130, 125, 241, 173, 147, 184, 200, 93]);
const IX_SETTLE_MARKET_ORACLE  = Buffer.from([48, 254, 79, 182, 3, 109, 22, 4]); // sha256("global:settle_market_oracle")[0..8]
const IX_CLAIM_WINNINGS        = Buffer.from([149, 95, 181, 242, 27, 205, 138, 50]);
const IX_RECORD_LOSS           = Buffer.from([88, 12, 193, 242, 198, 165, 0, 195]);
const IX_CREATE_PARLAY         = Buffer.from([127, 36, 125, 173, 162, 128, 246, 207]);
const IX_SETTLE_PARLAY         = Buffer.from([51, 60, 177, 79, 214, 52, 6, 22]);
const IX_CLAIM_PARLAY          = Buffer.from([47, 40, 30, 204, 201, 172, 97, 250]);
// Matchup discriminators — update from IDL after anchor build
const IX_CREATE_MATCHUP        = Buffer.from([218, 134, 88, 206, 163, 134, 99, 95]);
const IX_ACCEPT_MATCHUP        = Buffer.from([12, 118, 57, 228, 167, 193, 46, 70]);
const IX_SETTLE_MATCHUP        = Buffer.from([194, 55, 3, 119, 38, 144, 197, 246]);
const IX_DECLINE_MATCHUP       = Buffer.from([107, 211, 250, 207, 189, 226, 3, 230]);

const TOKEN_PROGRAM_ID       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS" as Address;
const SYSTEM_PROGRAM_ID      = "11111111111111111111111111111111" as Address;

function encodeString(s: string): Buffer {
  const bytes = new TextEncoder().encode(s);
  const buf = Buffer.alloc(4 + bytes.length);
  buf.writeUInt32LE(bytes.length, 0);
  buf.set(bytes, 4);
  return buf;
}

function encodeOptionPubkey(pubkey: Address | null | undefined): Buffer {
  if (!pubkey) {
    return Buffer.from([0]); // None
  }
  const enc = getAddressEncoder();
  const buf = Buffer.alloc(33);
  buf[0] = 1; // Some
  buf.set(enc.encode(pubkey), 1);
  return buf;
}

function encodeU16LE(n: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n, 0);
  return buf;
}

function encodeU64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

function encodeI64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n, 0);
  return buf;
}

export async function buildCreateMarketInstruction(params: {
  question: string;
  expiry: bigint;
  creatorFeeBps: number;
  nonce: bigint;
  oracle?: Address | null;
  isPrivate?: boolean;
  isFlash?: boolean;
  usdcMint: Address;
  marketAddress: Address;
  creator: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { question, expiry, creatorFeeBps, nonce, oracle, isPrivate, isFlash, usdcMint, marketAddress, creator, programId } = params;
  const vaultAddress = await deriveAta(usdcMint, marketAddress);

  const data = Buffer.concat([
    IX_CREATE_MARKET,
    encodeString(question),
    encodeI64LE(expiry),
    encodeU16LE(creatorFeeBps),
    encodeU64LE(nonce),
    encodeOptionPubkey(oracle),
    Buffer.from([isPrivate ? 1 : 0]),
    Buffer.from([isFlash ? 1 : 0]),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: marketAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

export async function buildPlaceBetInstruction(params: {
  market: Address;
  outcome: 0 | 1;
  amount: bigint;
  usdcMint: Address;
  betAddress: Address;
  bettor: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { market, outcome, amount, usdcMint, betAddress, bettor, programId } = params;
  const vaultAddress = await deriveAta(usdcMint, market);
  const bettorAta = await deriveAta(usdcMint, bettor);

  const data = Buffer.concat([
    IX_PLACE_BET,
    Buffer.from([outcome]),
    encodeU64LE(amount),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.WRITABLE },
      { address: betAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.WRITABLE },
      { address: bettorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: bettor, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

export function buildSettleMarketInstruction(params: {
  market: Address;
  winningOutcome: 0 | 1;
  creator: Address;
  programId: Address;
}): IInstruction {
  const { market, winningOutcome, creator, programId } = params;

  const data = Buffer.concat([
    IX_SETTLE_MARKET,
    Buffer.from([winningOutcome]),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.WRITABLE },
      { address: creator, role: AccountRole.READONLY_SIGNER },
    ],
    data: new Uint8Array(data),
  };
}

/** Called by the Switchboard Function oracle to settle a market trustlessly. */
export function buildSettleMarketOracleInstruction(params: {
  market: Address;
  winningOutcome: 0 | 1;
  oracle: Address;
  programId: Address;
}): IInstruction {
  const { market, winningOutcome, oracle, programId } = params;

  const data = Buffer.concat([
    IX_SETTLE_MARKET_ORACLE,
    Buffer.from([winningOutcome]),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.WRITABLE },
      { address: oracle, role: AccountRole.READONLY_SIGNER },
    ],
    data: new Uint8Array(data),
  };
}

export async function buildClaimWinningsInstruction(params: {
  market: Address;
  marketCreator: Address;
  betAddress: Address;
  reputationAddress: Address;
  usdcMint: Address;
  bettor: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { market, marketCreator, betAddress, reputationAddress, usdcMint, bettor, programId } = params;
  const vaultAddress = await deriveAta(usdcMint, market);
  const bettorAta = await deriveAta(usdcMint, bettor);
  const creatorAta = await deriveAta(usdcMint, marketCreator);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.READONLY },
      { address: betAddress, role: AccountRole.WRITABLE },
      { address: reputationAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.WRITABLE },
      { address: bettorAta, role: AccountRole.WRITABLE },
      { address: marketCreator, role: AccountRole.READONLY },
      { address: creatorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: bettor, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_CLAIM_WINNINGS),
  };
}

export function buildRecordLossInstruction(params: {
  market: Address;
  betAddress: Address;
  reputationAddress: Address;
  bettor: Address;
  programId: Address;
}): IInstruction {
  const { market, betAddress, reputationAddress, bettor, programId } = params;

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.READONLY },
      { address: betAddress, role: AccountRole.WRITABLE },
      { address: reputationAddress, role: AccountRole.WRITABLE },
      { address: bettor, role: AccountRole.WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_RECORD_LOSS),
  };
}

export async function buildCreateParlayInstruction(params: {
  legs: Array<{ market: Address; outcome: 0 | 1 }>;
  stakeUsdc: bigint;
  nonce: bigint;
  usdcMint: Address;
  parlayAddress: Address;
  parlayVaultAddress: Address;
  creator: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { legs, stakeUsdc, nonce, usdcMint, parlayAddress, parlayVaultAddress, creator, programId } = params;
  const creatorAta = await deriveAta(usdcMint, creator);

  // Encode Vec<ParlayLeg>: u32 LE length + (32-byte pubkey + u8 outcome) per leg
  const enc = getAddressEncoder();
  const legsLen = Buffer.alloc(4);
  legsLen.writeUInt32LE(legs.length, 0);
  const legBytes = legs.map(l => {
    const b = Buffer.alloc(33);
    b.set(enc.encode(l.market), 0);
    b[32] = l.outcome;
    return b;
  });

  const data = Buffer.concat([
    IX_CREATE_PARLAY,
    legsLen,
    ...legBytes,
    encodeU64LE(stakeUsdc),
    encodeU64LE(nonce),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: parlayAddress, role: AccountRole.WRITABLE },
      { address: parlayVaultAddress, role: AccountRole.WRITABLE },
      { address: creatorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

export function buildSettleParlayInstruction(params: {
  parlayAddress: Address;
  /** Market accounts in the same order as parlay.legs (passed as remaining_accounts). */
  marketAccounts: Address[];
  programId: Address;
}): IInstruction {
  const { parlayAddress, marketAccounts, programId } = params;

  return {
    programAddress: programId,
    accounts: [
      { address: parlayAddress, role: AccountRole.WRITABLE },
      // Leg markets as remaining_accounts — append after named accounts
      ...marketAccounts.map(addr => ({ address: addr, role: AccountRole.READONLY })),
    ],
    data: new Uint8Array(IX_SETTLE_PARLAY),
  };
}

export async function buildClaimParlayInstruction(params: {
  parlayAddress: Address;
  parlayCreator: Address;
  parlayNonce: bigint;
  usdcMint: Address;
  creator: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { parlayAddress, usdcMint, creator, programId } = params;
  const parlayVaultAddress = await deriveAta(usdcMint, parlayAddress);
  const creatorAta = await deriveAta(usdcMint, creator);

  return {
    programAddress: programId,
    accounts: [
      { address: parlayAddress, role: AccountRole.WRITABLE },
      { address: parlayVaultAddress, role: AccountRole.WRITABLE },
      { address: creatorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_CLAIM_PARLAY),
  };
}

export async function buildCreateMatchupInstruction(params: {
  market: Address;
  opponent: Address;
  challengerOutcome: 0 | 1;
  stakeUsdc: bigint;
  nonce: bigint;
  usdcMint: Address;
  matchupAddress: Address;
  challenger: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { market, opponent, challengerOutcome, stakeUsdc, nonce, usdcMint, matchupAddress, challenger, programId } = params;
  const challengerAta = await deriveAta(usdcMint, challenger);
  const matchupVault = await deriveAta(usdcMint, matchupAddress);
  const enc = getAddressEncoder();

  const data = Buffer.concat([
    IX_CREATE_MATCHUP,
    Buffer.from(enc.encode(opponent)),      // opponent: Pubkey
    Buffer.from([challengerOutcome]),        // challenger_outcome: u8
    encodeU64LE(stakeUsdc),                 // stake_usdc: u64
    encodeU64LE(nonce),                     // nonce: u64
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: matchupAddress, role: AccountRole.WRITABLE },
      { address: matchupVault, role: AccountRole.WRITABLE },
      { address: challengerAta, role: AccountRole.WRITABLE },
      { address: market, role: AccountRole.READONLY },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: challenger, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

export async function buildAcceptMatchupInstruction(params: {
  matchupAddress: Address;
  challenger: Address;
  market: Address;
  nonce: bigint;
  usdcMint: Address;
  opponent: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { matchupAddress, usdcMint, opponent, programId } = params;
  const matchupVault = await deriveAta(usdcMint, matchupAddress);
  const opponentAta = await deriveAta(usdcMint, opponent);

  return {
    programAddress: programId,
    accounts: [
      { address: matchupAddress, role: AccountRole.WRITABLE },
      { address: matchupVault, role: AccountRole.WRITABLE },
      { address: opponentAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: opponent, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_ACCEPT_MATCHUP),
  };
}

export async function buildSettleMatchupInstruction(params: {
  matchupAddress: Address;
  market: Address;
  challenger: Address;
  opponent: Address;
  usdcMint: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { matchupAddress, market, challenger, opponent, usdcMint, programId } = params;
  const matchupVault = await deriveAta(usdcMint, matchupAddress);
  const challengerAta = await deriveAta(usdcMint, challenger);
  const opponentAta = await deriveAta(usdcMint, opponent);

  return {
    programAddress: programId,
    accounts: [
      { address: matchupAddress, role: AccountRole.WRITABLE },
      { address: market, role: AccountRole.READONLY },
      { address: matchupVault, role: AccountRole.WRITABLE },
      { address: challengerAta, role: AccountRole.WRITABLE },
      { address: opponentAta, role: AccountRole.WRITABLE },
      { address: challenger, role: AccountRole.READONLY },
      { address: opponent, role: AccountRole.READONLY },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_SETTLE_MATCHUP),
  };
}

export async function buildDeclineMatchupInstruction(params: {
  matchupAddress: Address;
  challenger: Address;
  signer: Address;
  usdcMint: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { matchupAddress, challenger, signer, usdcMint, programId } = params;
  const matchupVault = await deriveAta(usdcMint, matchupAddress);
  const challengerAta = await deriveAta(usdcMint, challenger);

  return {
    programAddress: programId,
    accounts: [
      { address: matchupAddress, role: AccountRole.WRITABLE },
      { address: matchupVault, role: AccountRole.WRITABLE },
      { address: challengerAta, role: AccountRole.WRITABLE },
      { address: challenger, role: AccountRole.READONLY },
      { address: signer, role: AccountRole.WRITABLE_SIGNER },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_DECLINE_MATCHUP),
  };
}

// ── Private market discriminators (from IDL) ─────────────────────────────────
const IX_INIT_PRIVATE_MKT_STATE_COMP_DEF  = Buffer.from([47, 75, 30, 151, 239, 113, 97, 109]);
const IX_INIT_PLACE_PRIVATE_BET_COMP_DEF  = Buffer.from([169, 187, 202, 154, 108, 57, 212, 111]);
const IX_INIT_REVEAL_PRIVATE_MKT_COMP_DEF = Buffer.from([167, 238, 158, 68, 19, 210, 75, 132]);
const IX_INIT_PRIVATE_MARKET_STATE        = Buffer.from([207, 45, 109, 215, 67, 105, 201, 202]);
const IX_PLACE_PRIVATE_BET                = Buffer.from([125, 166, 81, 218, 164, 175, 87, 180]);
const IX_REVEAL_PRIVATE_MARKET            = Buffer.from([234, 7, 105, 16, 4, 40, 145, 25]);
const IX_CLAIM_PRIVATE_WINNINGS           = Buffer.from([52, 22, 36, 153, 253, 239, 248, 160]);

const ARCIUM_PROGRAM_ID = "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ" as Address;
const LUT_PROGRAM_ID    = "AddressLookupTab1e1111111111111111111111111" as Address;

function encodeU128LE(n: bigint): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(n & 0xFFFFFFFFFFFFFFFFn, 0);
  buf.writeBigUInt64LE(n >> 64n, 8);
  return buf;
}

/** One-time setup: registers the init_private_market_state computation definition with Arcium. */
export function buildInitPrivateMarketStateCompDefInstruction(params: {
  creator: Address;
  mxeAccount: Address;
  compDefAccount: Address;
  addressLookupTable: Address;
  arciumProgram?: Address;
  programId: Address;
}): IInstruction {
  const { creator, mxeAccount, compDefAccount, addressLookupTable, programId } = params;
  return {
    programAddress: programId,
    accounts: [
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.WRITABLE },
      { address: addressLookupTable, role: AccountRole.WRITABLE },
      { address: LUT_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_INIT_PRIVATE_MKT_STATE_COMP_DEF),
  };
}

/** One-time setup: registers the place_private_bet computation definition with Arcium. */
export function buildInitPlacePrivateBetCompDefInstruction(params: {
  payer: Address;
  mxeAccount: Address;
  compDefAccount: Address;
  addressLookupTable: Address;
  arciumProgram?: Address;
  programId: Address;
}): IInstruction {
  const { payer, mxeAccount, compDefAccount, addressLookupTable, programId } = params;
  return {
    programAddress: programId,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.WRITABLE },
      { address: addressLookupTable, role: AccountRole.WRITABLE },
      { address: LUT_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_INIT_PLACE_PRIVATE_BET_COMP_DEF),
  };
}

/** One-time setup: registers the reveal_private_market computation definition with Arcium. */
export function buildInitRevealPrivateMarketCompDefInstruction(params: {
  creator: Address;
  mxeAccount: Address;
  compDefAccount: Address;
  addressLookupTable: Address;
  arciumProgram?: Address;
  programId: Address;
}): IInstruction {
  const { creator, mxeAccount, compDefAccount, addressLookupTable, programId } = params;
  return {
    programAddress: programId,
    accounts: [
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.WRITABLE },
      { address: addressLookupTable, role: AccountRole.WRITABLE },
      { address: LUT_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(IX_INIT_REVEAL_PRIVATE_MKT_COMP_DEF),
  };
}

/**
 * Queues the init_private_market_state MPC computation.
 * Must be called once per private market to initialise the encrypted totals account.
 */
export function buildInitPrivateMarketStateInstruction(params: {
  computationOffset: bigint;
  nonce: bigint;
  creator: Address;
  mxeAccount: Address;
  signPdaAccount: Address;
  mempoolAccount: Address;
  executingPool: Address;
  computationAccount: Address;
  compDefAccount: Address;
  clusterAccount: Address;
  poolAccount: Address;
  clockAccount: Address;
  market: Address;
  privateState: Address;
  arciumProgram?: Address;
  programId: Address;
}): IInstruction {
  const {
    computationOffset, nonce, creator, mxeAccount, signPdaAccount,
    mempoolAccount, executingPool, computationAccount, compDefAccount,
    clusterAccount, poolAccount, clockAccount, market, privateState, programId,
  } = params;

  const data = Buffer.concat([
    IX_INIT_PRIVATE_MARKET_STATE,
    encodeU64LE(computationOffset),
    encodeU128LE(nonce),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.READONLY },
      { address: signPdaAccount, role: AccountRole.READONLY },
      { address: mempoolAccount, role: AccountRole.WRITABLE },
      { address: executingPool, role: AccountRole.WRITABLE },
      { address: computationAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.READONLY },
      { address: clusterAccount, role: AccountRole.WRITABLE },
      { address: poolAccount, role: AccountRole.WRITABLE },
      { address: clockAccount, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: market, role: AccountRole.READONLY },
      { address: privateState, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array(data),
  };
}

/**
 * Queues an encrypted bet for MPC processing.
 *
 * `outcomeCt` and `amountCt` are 32-byte ciphertexts produced by X25519 ECDH encryption
 * against the MXE node's public key. See usePrivateMarket.ts for the client-side helper.
 * `outcomeCommitment` = blake3(outcome_byte || secret_32_bytes) — store secret for claim.
 */
export async function buildPlacePrivateBetInstruction(params: {
  computationOffset: bigint;
  outcomeCt: Uint8Array;
  amountCt: Uint8Array;
  encryptionPubkey: Uint8Array;
  betNonce: bigint;
  amount: bigint;
  outcomeCommitment: Uint8Array;
  bettor: Address;
  mxeAccount: Address;
  signPdaAccount: Address;
  mempoolAccount: Address;
  executingPool: Address;
  computationAccount: Address;
  compDefAccount: Address;
  clusterAccount: Address;
  poolAccount: Address;
  clockAccount: Address;
  market: Address;
  privateState: Address;
  privateBetRecord: Address;
  usdcMint: Address;
  arciumProgram?: Address;
  programId: Address;
}): Promise<IInstruction> {
  const {
    computationOffset, outcomeCt, amountCt, encryptionPubkey, betNonce,
    amount, outcomeCommitment, bettor, mxeAccount, signPdaAccount,
    mempoolAccount, executingPool, computationAccount, compDefAccount,
    clusterAccount, poolAccount, clockAccount, market, privateState,
    privateBetRecord, usdcMint, programId,
  } = params;

  const vault = await deriveAta(usdcMint, market);
  const bettorAta = await deriveAta(usdcMint, bettor);

  const data = Buffer.concat([
    IX_PLACE_PRIVATE_BET,
    encodeU64LE(computationOffset),
    Buffer.from(outcomeCt.slice(0, 32)),
    Buffer.from(amountCt.slice(0, 32)),
    Buffer.from(encryptionPubkey.slice(0, 32)),
    encodeU128LE(betNonce),
    encodeU64LE(amount),
    Buffer.from(outcomeCommitment.slice(0, 32)),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: bettor, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.READONLY },
      { address: signPdaAccount, role: AccountRole.READONLY },
      { address: mempoolAccount, role: AccountRole.WRITABLE },
      { address: executingPool, role: AccountRole.WRITABLE },
      { address: computationAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.READONLY },
      { address: clusterAccount, role: AccountRole.WRITABLE },
      { address: poolAccount, role: AccountRole.WRITABLE },
      { address: clockAccount, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: market, role: AccountRole.READONLY },
      { address: privateState, role: AccountRole.WRITABLE },
      { address: privateBetRecord, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: bettorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

/** Queues the MPC computation that reveals yes/no totals and settles the market. */
export function buildRevealPrivateMarketInstruction(params: {
  computationOffset: bigint;
  creator: Address;
  mxeAccount: Address;
  signPdaAccount: Address;
  mempoolAccount: Address;
  executingPool: Address;
  computationAccount: Address;
  compDefAccount: Address;
  clusterAccount: Address;
  poolAccount: Address;
  clockAccount: Address;
  market: Address;
  privateState: Address;
  arciumProgram?: Address;
  programId: Address;
}): IInstruction {
  const {
    computationOffset, creator, mxeAccount, signPdaAccount,
    mempoolAccount, executingPool, computationAccount, compDefAccount,
    clusterAccount, poolAccount, clockAccount, market, privateState, programId,
  } = params;

  const data = Buffer.concat([
    IX_REVEAL_PRIVATE_MARKET,
    encodeU64LE(computationOffset),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: creator, role: AccountRole.WRITABLE_SIGNER },
      { address: mxeAccount, role: AccountRole.READONLY },
      { address: signPdaAccount, role: AccountRole.READONLY },
      { address: mempoolAccount, role: AccountRole.WRITABLE },
      { address: executingPool, role: AccountRole.WRITABLE },
      { address: computationAccount, role: AccountRole.WRITABLE },
      { address: compDefAccount, role: AccountRole.READONLY },
      { address: clusterAccount, role: AccountRole.WRITABLE },
      { address: poolAccount, role: AccountRole.WRITABLE },
      { address: clockAccount, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: params.arciumProgram ?? ARCIUM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: market, role: AccountRole.WRITABLE },
      { address: privateState, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array(data),
  };
}

/**
 * Claims winnings from a settled private market.
 * Bettor reveals their `outcome` and `secret` to prove their commitment.
 */
export async function buildClaimPrivateWinningsInstruction(params: {
  outcome: 0 | 1;
  secret: Uint8Array;
  market: Address;
  privateState: Address;
  privateBetRecord: Address;
  creator: Address;
  usdcMint: Address;
  bettor: Address;
  programId: Address;
}): Promise<IInstruction> {
  const {
    outcome, secret, market, privateState, privateBetRecord,
    creator, usdcMint, bettor, programId,
  } = params;

  const vault = await deriveAta(usdcMint, market);
  const bettorAta = await deriveAta(usdcMint, bettor);
  const creatorAta = await deriveAta(usdcMint, creator);

  const data = Buffer.concat([
    IX_CLAIM_PRIVATE_WINNINGS,
    Buffer.from([outcome]),
    Buffer.from(secret.slice(0, 32)),
  ]);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.READONLY },
      { address: privateState, role: AccountRole.READONLY },
      { address: privateBetRecord, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: bettorAta, role: AccountRole.WRITABLE },
      { address: creator, role: AccountRole.READONLY },
      { address: creatorAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: bettor, role: AccountRole.WRITABLE_SIGNER },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: ASSOC_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

// Derives the Associated Token Address for (owner, mint) off-chain.
async function deriveAta(mint: Address, owner: Address): Promise<Address> {
  const { getProgramDerivedAddress, getAddressEncoder } = await import("@solana/kit");
  const enc = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOC_TOKEN_PROGRAM_ID,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM_ID), enc.encode(mint)],
  });
  return ata;
}

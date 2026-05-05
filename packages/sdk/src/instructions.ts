import { Buffer } from "buffer";
import {
  Address,
  IInstruction,
  AccountRole,
  getAddressEncoder,
} from "@solana/kit";

// Instruction discriminators: sha256("global:<ix_name>")[0..8]
// Regenerate from IDL after `anchor build` if the program is redeployed.
const IX_CREATE_MARKET   = Buffer.from([162, 93, 19, 147, 76, 203, 184, 147]);
const IX_PLACE_BET       = Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]);
const IX_SETTLE_MARKET   = Buffer.from([130, 125, 241, 173, 147, 184, 200, 93]);
const IX_CLAIM_WINNINGS  = Buffer.from([149, 95, 181, 242, 27, 205, 138, 50]);
const IX_RECORD_LOSS     = Buffer.from([88, 12, 193, 242, 198, 165, 0, 195]);

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
  nonce: bigint;
  usdcMint: Address;
  marketAddress: Address;
  creator: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { question, expiry, nonce, usdcMint, marketAddress, creator, programId } = params;
  const vaultAddress = await deriveAta(usdcMint, marketAddress);

  const data = Buffer.concat([
    IX_CREATE_MARKET,
    encodeString(question),
    encodeI64LE(expiry),
    encodeU64LE(nonce),
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

export async function buildClaimWinningsInstruction(params: {
  market: Address;
  marketCreator: Address;
  betAddress: Address;
  reputationAddress: Address;
  usdcMint: Address;
  bettor: Address;
  programId: Address;
}): Promise<IInstruction> {
  const { market, betAddress, reputationAddress, usdcMint, bettor, programId } = params;
  const vaultAddress = await deriveAta(usdcMint, market);
  const bettorAta = await deriveAta(usdcMint, bettor);

  return {
    programAddress: programId,
    accounts: [
      { address: market, role: AccountRole.READONLY },
      { address: betAddress, role: AccountRole.WRITABLE },
      { address: reputationAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.WRITABLE },
      { address: bettorAta, role: AccountRole.WRITABLE },
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

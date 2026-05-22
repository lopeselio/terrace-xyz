import { Buffer } from "buffer";
import {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
  FullySignedTransaction,
  TransactionWithBlockhashLifetime,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from "@solana/kit";
import type {
  CreateMarketParams,
  PlaceBetParams,
  SettleMarketParams,
  SettleMarketOracleParams,
  ClaimWinningsParams,
  RecordLossParams,
  CreateParlayParams,
  SettleParlayParams,
  ClaimParlayParams,
  CreateMatchupParams,
  AcceptMatchupParams,
  SettleMatchupParams,
  DeclineMatchupParams,
  Market,
  Reputation,
  Parlay,
  Matchup,
  ParlayLeg,
  ParlayStatus,
  MatchupStatus,
  BadgeTier,
  MarketStatus,
  League,
  LeagueMember,
  LeagueStatus,
} from "./types";
import { getMarketPda, getBetPda, getReputationPda, getParlayPda, getMatchupPda, TERRACE_PROGRAM_ID } from "./pda";
import {
  buildCreateMarketInstruction,
  buildPlaceBetInstruction,
  buildSettleMarketInstruction,
  buildSettleMarketOracleInstruction,
  buildClaimWinningsInstruction,
  buildRecordLossInstruction,
  buildCreateParlayInstruction,
  buildSettleParlayInstruction,
  buildClaimParlayInstruction,
  buildCreateMatchupInstruction,
  buildAcceptMatchupInstruction,
  buildSettleMatchupInstruction,
  buildDeclineMatchupInstruction,
} from "./instructions";

// Minimal base58 encoder — keeps the deserializers dependency-free.
function pubkeyBytesToAddress(bytes: Uint8Array): Address {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s as Address;
}

/**
 * Deserialises a raw Market account buffer (Anchor borsh layout) into a typed Market.
 *
 * Layout (after 8-byte discriminator):
 *   question     — u32 LE length prefix + UTF-8 bytes
 *   expiry       — i64 LE
 *   creator      — 32-byte Pubkey
 *   outcome      — u8 tag (0=None, 1=Some) + u8 value if Some
 *   total_volume — u64 LE
 *   yes_volume   — u64 LE
 *   no_volume    — u64 LE
 *   vault        — 32-byte Pubkey
 *   status       — u8 enum (0=Open, 1=Closed, 2=Settled)
 *   nonce        — u64 LE
 *   bump         — u8
 */
export function deserializeMarketAccount(data: Uint8Array, address: Address): Market {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip discriminator

  const qLen = view.getUint32(o, true);
  o += 4;
  const question = new TextDecoder().decode(data.slice(o, o + qLen));
  o += qLen;

  const expiry = view.getBigInt64(o, true);
  o += 8;

  const creator = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const hasOutcome = view.getUint8(o) === 1;
  o += 1;
  let outcome: number | null = null;
  if (hasOutcome) {
    outcome = view.getUint8(o);
    o += 1;
  }

  const totalVolume = view.getBigUint64(o, true);
  o += 8;

  const yesVolume = view.getBigUint64(o, true);
  o += 8;

  const noVolume = view.getBigUint64(o, true);
  o += 8;

  const vault = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const statusByte = view.getUint8(o);
  o += 1;
  const STATUS_MAP: MarketStatus[] = ["Open", "Closed", "Settled"];
  const status: MarketStatus = STATUS_MAP[statusByte] ?? "Open";

  const creatorFeeBps = view.getUint16(o, true);
  o += 2;

  const hasOracle = view.getUint8(o) === 1;
  o += 1;
  let oracle: Address | null = null;
  if (hasOracle) {
    oracle = pubkeyBytesToAddress(data.slice(o, o + 32));
    o += 32;
  }

  const isPrivate = view.getUint8(o) === 1;
  o += 1;

  const isFlash = view.getUint8(o) === 1;
  o += 1;

  const nonce = view.getBigUint64(o, true);
  o += 8;

  const bump = view.getUint8(o);

  return {
    address,
    question,
    expiry,
    creator,
    outcome,
    totalVolume,
    yesVolume,
    noVolume,
    vault,
    status,
    creatorFeeBps,
    oracle,
    isPrivate,
    isFlash,
    nonce,
    bump,
  };
}

const PARLAY_STATUS_MAP: ParlayStatus[] = ["Open", "Won", "Lost", "Claimed", "Cancelled"];

/**
 * Deserialises a raw Parlay account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   creator    — 32-byte Pubkey
 *   legs       — u32 LE count + (32-byte Pubkey + u8 outcome) × count
 *   stake_usdc — u64 LE
 *   status     — u8 enum (0=Open, 1=Won, 2=Lost, 3=Claimed, 4=Cancelled)
 *   nonce      — u64 LE
 *   bump       — u8
 */
export function deserializeParlayAccount(data: Uint8Array, address: Address): Parlay {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip discriminator

  const creator = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const legCount = view.getUint32(o, true);
  o += 4;
  const legs: ParlayLeg[] = [];
  for (let i = 0; i < legCount; i++) {
    const market = pubkeyBytesToAddress(data.slice(o, o + 32));
    o += 32;
    const outcome = view.getUint8(o) as 0 | 1;
    o += 1;
    legs.push({ market, outcome });
  }

  const stakeUsdc = view.getBigUint64(o, true);
  o += 8;

  const statusByte = view.getUint8(o);
  o += 1;
  const status: ParlayStatus = PARLAY_STATUS_MAP[statusByte] ?? "Open";

  const nonce = view.getBigUint64(o, true);
  o += 8;

  const bump = view.getUint8(o);

  return { address, creator, legs, stakeUsdc, status, nonce, bump };
}

const BADGE_MAP: BadgeTier[] = ["Casual", "Sharp", "Legend"];

/**
 * Deserialises a raw Reputation account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   owner          — 32-byte Pubkey
 *   total_bets     — u32 LE
 *   winning_bets   — u32 LE
 *   win_rate_bps   — u16 LE
 *   current_streak — i16 LE
 *   badge_tier     — u8 enum (0=Casual, 1=Sharp, 2=Legend)
 *   bump           — u8
 */
export function deserializeReputationAccount(
  data: Uint8Array,
  address: Address
): Reputation {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;

  const owner = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const totalBets = view.getUint32(o, true);
  o += 4;

  const winningBets = view.getUint32(o, true);
  o += 4;

  const winRateBps = view.getUint16(o, true);
  o += 2;

  const currentStreak = view.getInt16(o, true);
  o += 2;

  const badgeByte = view.getUint8(o);
  o += 1;
  const badgeTier: BadgeTier = BADGE_MAP[badgeByte] ?? "Casual";

  const bump = view.getUint8(o);

  return { address, owner, totalBets, winningBets, winRateBps, currentStreak, badgeTier, bump };
}

const MATCHUP_STATUS_MAP: MatchupStatus[] = ["Pending", "Accepted", "Settled", "Declined"];

/**
 * Deserialises a raw Matchup account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   challenger         — 32-byte Pubkey
 *   opponent           — 32-byte Pubkey
 *   market             — 32-byte Pubkey
 *   challenger_outcome — u8
 *   stake_usdc         — u64 LE
 *   status             — u8 enum
 *   nonce              — u64 LE
 *   bump               — u8
 */
export function deserializeMatchupAccount(data: Uint8Array, address: Address): Matchup {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;

  const challenger = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const opponent = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const market = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const challengerOutcome = view.getUint8(o) as 0 | 1;
  o += 1;
  const stakeUsdc = view.getBigUint64(o, true);
  o += 8;
  const statusByte = view.getUint8(o);
  o += 1;
  const status: MatchupStatus = MATCHUP_STATUS_MAP[statusByte] ?? "Pending";
  const nonce = view.getBigUint64(o, true);
  o += 8;
  const bump = view.getUint8(o);

  return { address, challenger, opponent, market, challengerOutcome, stakeUsdc, status, nonce, bump };
}

/**
 * Deserialises a raw PrivateMarketState account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   market             — 32-byte Pubkey
 *   encrypted_totals   — 2 × [u8; 32]  (yes_total_ct, no_total_ct)
 *   nonce              — u128 LE
 *   is_revealed        — u8 bool
 *   no_volume_revealed — u64 LE
 *   yes_volume_revealed— u64 LE
 *   bump               — u8
 */
export function deserializePrivateMarketStateAccount(
  data: Uint8Array,
  address: Address
): {
  address: Address;
  market: Address;
  encryptedTotals: [Uint8Array, Uint8Array];
  nonce: bigint;
  isRevealed: boolean;
  noVolumeRevealed: bigint;
  yesVolumeRevealed: bigint;
  bump: number;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip discriminator

  const market = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const ct0 = data.slice(o, o + 32);
  o += 32;
  const ct1 = data.slice(o, o + 32);
  o += 32;

  // u128 LE — read as two u64s
  const nonceLo = view.getBigUint64(o, true);
  o += 8;
  const nonceHi = view.getBigUint64(o, true);
  o += 8;
  const nonce = nonceLo | (nonceHi << 64n);

  const isRevealed = view.getUint8(o) !== 0;
  o += 1;
  const noVolumeRevealed = view.getBigUint64(o, true);
  o += 8;
  const yesVolumeRevealed = view.getBigUint64(o, true);
  o += 8;
  const bump = view.getUint8(o);

  return {
    address,
    market,
    encryptedTotals: [ct0, ct1],
    nonce,
    isRevealed,
    noVolumeRevealed,
    yesVolumeRevealed,
    bump,
  };
}

/**
 * Deserialises a raw PrivateBetRecord account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   market             — 32-byte Pubkey
 *   bettor             — 32-byte Pubkey
 *   amount             — u64 LE
 *   outcome_commitment — [u8; 32]
 *   claimed            — u8 bool
 *   bump               — u8
 */
export function deserializePrivateBetRecordAccount(
  data: Uint8Array,
  address: Address
): {
  address: Address;
  market: Address;
  bettor: Address;
  amount: bigint;
  outcomeCommitment: Uint8Array;
  claimed: boolean;
  bump: number;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;

  const market = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const bettor = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const amount = view.getBigUint64(o, true);
  o += 8;
  const outcomeCommitment = data.slice(o, o + 32);
  o += 32;
  const claimed = view.getUint8(o) !== 0;
  o += 1;
  const bump = view.getUint8(o);

  return { address, market, bettor, amount, outcomeCommitment, claimed, bump };
}

/**
 * Deserialises a raw League account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   creator          — 32 Pubkey
 *   name             — 4 (len) + up to 50 bytes String
 *   season           — u16 LE
 *   gameweek         — u8
 *   member_count     — u8
 *   max_members      — u8
 *   is_private       — u8 bool
 *   entry_fee_usdc   — u64 LE
 *   prize_pool       — u64 LE
 *   vault            — 32 Pubkey
 *   status           — u8 (0=Active, 1=Ended)
 *   nonce            — u64 LE
 *   bump             — u8
 */
export function deserializeLeagueAccount(data: Uint8Array, address: Address): League {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip discriminator

  const creator = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const nameLen = view.getUint32(o, true);
  o += 4;
  const name = new TextDecoder().decode(data.slice(o, o + nameLen));
  o += nameLen;

  const season = view.getUint16(o, true);
  o += 2;
  const gameweek = view.getUint8(o);
  o += 1;
  const memberCount = view.getUint8(o);
  o += 1;
  const maxMembers = view.getUint8(o);
  o += 1;
  const isPrivate = view.getUint8(o) !== 0;
  o += 1;
  const entryFeeUsdc = view.getBigUint64(o, true);
  o += 8;
  const prizePool = view.getBigUint64(o, true);
  o += 8;
  const vault = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const statusByte = view.getUint8(o);
  o += 1;
  const status: LeagueStatus = statusByte === 1 ? "Ended" : "Active";
  const nonce = view.getBigUint64(o, true);
  o += 8;
  const bump = view.getUint8(o);

  return { address, creator, name, season, gameweek, memberCount, maxMembers, isPrivate, entryFeeUsdc, prizePool, vault, status, nonce, bump };
}

/**
 * Deserialises a raw LeagueMember account buffer.
 *
 * Layout (after 8-byte discriminator):
 *   league                — 32 Pubkey
 *   member                — 32 Pubkey
 *   member_slot           — u8       (join order, 0-based)
 *   gameweek_score        — u32 LE
 *   total_score           — u32 LE
 *   last_scored_gameweek  — u8
 *   bump                  — u8
 */
export function deserializeLeagueMemberAccount(data: Uint8Array, address: Address): LeagueMember {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;

  const league = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const member = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;
  const memberSlot = view.getUint8(o);
  o += 1;
  const gameweekScore = view.getUint32(o, true);
  o += 4;
  const totalScore = view.getUint32(o, true);
  o += 4;
  const lastScoredGameweek = view.getUint8(o);
  o += 1;
  const bump = view.getUint8(o);

  return { address, league, member, memberSlot, gameweekScore, totalScore, lastScoredGameweek, bump };
}

export class TerraceSdk {
  constructor(
    private readonly rpc: Rpc<SolanaRpcApi>,
    private readonly signer: TransactionSigner,
    private readonly programId: Address = TERRACE_PROGRAM_ID
  ) {}

  async createMarket(params: CreateMarketParams): Promise<string> {
    const [marketAddress] = await getMarketPda(
      this.signer.address,
      params.nonce,
      this.programId
    );

    const ix = await buildCreateMarketInstruction({
      ...params,
      creatorFeeBps: params.creatorFeeBps ?? 0,
      oracle: params.oracle ?? null,
      isPrivate: params.isPrivate ?? false,
      isFlash: params.isFlash ?? false,
      marketAddress,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async placeBet(params: PlaceBetParams): Promise<string> {
    const [betAddress] = await getBetPda(
      params.market,
      this.signer.address,
      this.programId
    );

    const ix = await buildPlaceBetInstruction({
      ...params,
      betAddress,
      bettor: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async settleMarket(params: SettleMarketParams): Promise<string> {
    const ix = buildSettleMarketInstruction({
      ...params,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  /** Oracle-driven settlement — signer must be the oracle keypair stored in market.oracle. */
  async settleMarketOracle(params: SettleMarketOracleParams): Promise<string> {
    const ix = buildSettleMarketOracleInstruction({
      market: params.market,
      winningOutcome: params.winningOutcome,
      oracle: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async claimWinnings(params: ClaimWinningsParams): Promise<string> {
    const bettor = this.signer.address;
    const [betAddress] = await getBetPda(params.market, bettor, this.programId);
    const [reputationAddress] = await getReputationPda(bettor, this.programId);

    // We need the market creator to derive market PDA for the vault authority check.
    const market = await this.fetchMarket(params.market);

    const ix = await buildClaimWinningsInstruction({
      market: params.market,
      marketCreator: market.creator,
      betAddress,
      reputationAddress,
      usdcMint: params.usdcMint,
      bettor,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async recordLoss(params: RecordLossParams): Promise<string> {
    const bettor = this.signer.address;
    const [betAddress] = await getBetPda(params.market, bettor, this.programId);
    const [reputationAddress] = await getReputationPda(bettor, this.programId);

    const ix = buildRecordLossInstruction({
      market: params.market,
      betAddress,
      reputationAddress,
      bettor,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async createParlay(params: CreateParlayParams): Promise<string> {
    const [parlayAddress] = await getParlayPda(
      this.signer.address,
      params.nonce,
      this.programId
    );

    const { getProgramDerivedAddress, getAddressEncoder } = await import("@solana/kit");
    const enc = getAddressEncoder();
    const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
    const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
    const [parlayVaultAddress] = await getProgramDerivedAddress({
      programAddress: ASSOC_TOKEN_PROGRAM_ID,
      seeds: [enc.encode(parlayAddress), enc.encode(TOKEN_PROGRAM_ID), enc.encode(params.usdcMint)],
    });

    const ix = await buildCreateParlayInstruction({
      legs: params.legs,
      stakeUsdc: params.stakeUsdc,
      nonce: params.nonce,
      usdcMint: params.usdcMint,
      parlayAddress,
      parlayVaultAddress,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async settleParlay(params: SettleParlayParams): Promise<string> {
    const ix = buildSettleParlayInstruction({
      parlayAddress: params.parlay,
      marketAccounts: params.marketAccounts,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async claimParlay(params: ClaimParlayParams): Promise<string> {
    const parlay = await this.fetchParlay(params.parlay);

    const ix = await buildClaimParlayInstruction({
      parlayAddress: params.parlay,
      parlayCreator: parlay.creator,
      parlayNonce: parlay.nonce,
      usdcMint: params.usdcMint,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async fetchParlay(address: Address): Promise<Parlay> {
    const accountInfo = await this.rpc
      .getAccountInfo(address, { encoding: "base64" })
      .send();

    if (!accountInfo.value) throw new Error(`Parlay not found: ${address}`);

    const [b64] = accountInfo.value.data as [string, string];
    const raw = new Uint8Array(Buffer.from(b64, "base64"));
    return deserializeParlayAccount(raw, address);
  }

  async fetchMarket(address: Address): Promise<Market> {
    const accountInfo = await this.rpc
      .getAccountInfo(address, { encoding: "base64" })
      .send();

    if (!accountInfo.value) throw new Error(`Market not found: ${address}`);

    const [b64] = accountInfo.value.data as [string, string];
    const raw = new Uint8Array(Buffer.from(b64, "base64"));
    return deserializeMarketAccount(raw, address);
  }

  async createMatchup(params: CreateMatchupParams): Promise<string> {
    const [matchupAddress] = await getMatchupPda(
      this.signer.address,
      params.market,
      params.nonce,
      this.programId
    );

    const ix = await buildCreateMatchupInstruction({
      market: params.market,
      opponent: params.opponent,
      challengerOutcome: params.challengerOutcome,
      stakeUsdc: params.stakeUsdc,
      nonce: params.nonce,
      usdcMint: params.usdcMint,
      matchupAddress,
      challenger: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async acceptMatchup(params: AcceptMatchupParams): Promise<string> {
    const matchup = await this.fetchMatchup(params.matchup);

    const ix = await buildAcceptMatchupInstruction({
      matchupAddress: params.matchup,
      challenger: matchup.challenger,
      market: matchup.market,
      nonce: matchup.nonce,
      usdcMint: params.usdcMint,
      opponent: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async settleMatchup(params: SettleMatchupParams): Promise<string> {
    const ix = await buildSettleMatchupInstruction({
      matchupAddress: params.matchup,
      market: params.market,
      challenger: params.challenger,
      opponent: params.opponent,
      usdcMint: params.usdcMint,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async declineMatchup(params: DeclineMatchupParams): Promise<string> {
    const ix = await buildDeclineMatchupInstruction({
      matchupAddress: params.matchup,
      challenger: params.challenger,
      signer: this.signer.address,
      usdcMint: params.usdcMint,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async fetchMatchup(address: Address): Promise<Matchup> {
    const accountInfo = await this.rpc
      .getAccountInfo(address, { encoding: "base64" })
      .send();

    if (!accountInfo.value) throw new Error(`Matchup not found: ${address}`);

    const [b64] = accountInfo.value.data as [string, string];
    const raw = new Uint8Array(Buffer.from(b64, "base64"));
    return deserializeMatchupAccount(raw, address);
  }

  async fetchReputation(owner: Address): Promise<Reputation | null> {
    const [repAddress] = await getReputationPda(owner, this.programId);
    const accountInfo = await this.rpc
      .getAccountInfo(repAddress, { encoding: "base64" })
      .send();

    if (!accountInfo.value) return null;

    const [b64] = accountInfo.value.data as [string, string];
    const raw = new Uint8Array(Buffer.from(b64, "base64"));
    return deserializeReputationAccount(raw, repAddress);
  }

  private async _sendTx(instructions: any[]): Promise<string> {
    const { value: latestBlockhash } = await this.rpc
      .getLatestBlockhash()
      .send();

    const tx = await pipe(
      createTransactionMessage({ version: 0 }),
      (msg: any) => setTransactionMessageFeePayerSigner(this.signer, msg),
      (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
      (msg: any) => appendTransactionMessageInstructions(instructions, msg),
      (msg: any) => signTransactionMessageWithSigners(msg)
    );

    const signedTx = tx as FullySignedTransaction & TransactionWithBlockhashLifetime;
    const signature = getSignatureFromTransaction(signedTx);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc: this.rpc, rpcSubscriptions: undefined as any });
    await sendAndConfirm(signedTx, { commitment: "confirmed" });
    return signature;
  }
}

/**
 * Full end-to-end smoke test for private league encrypted score flow.
 * Steps:
 *  1. create_league (private)
 *  2. join_league
 *  3. init_member_score  → wait for Arcium callback (encrypted 0)
 *  4. create_market
 *  5. place_bet (outcome=1, 1000 lamport-USDC)
 *  6. settle_market (outcome=1, bet wins)
 *  7. record_private_league_win → wait for Arcium callback (encrypted 1)
 *  8. advance_gameweek
 *  9. reveal_member_score → wait for Arcium callback (plaintext score applied)
 * 10. assert LeagueMember.total_score == 1 and MemberScore.is_revealed == true
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const ARCIUM               = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE              = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");
const USDC_MINT            = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM        = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// sha256_le(circuit_name) — verified: init = 1481970775
const COMP_DEF_OFFSET_INIT    = 1481970775;  // init_member_score_v2
const COMP_DEF_OFFSET_SCORE   = 635120120;   // increment_member_score_v2
const COMP_DEF_OFFSET_REVEAL  = 3852259505;  // reveal_member_score_v2

// PrivateMemberScore account layout offsets (after 8-byte disc)
// disc(8)+league(32)+member(32) = 72 → encrypted_score[72:104]
// nonce(16) → [104:120]
// scores_gameweek(1) → [120]
// is_revealed(1) → [121]
const SCORE_ENCRYPTED_START = 72;
const SCORE_ENCRYPTED_END   = 104;
const SCORE_GW_OFFSET       = 120;
const SCORE_REVEALED_OFFSET = 121;

// LeagueMember layout offsets (after 8-byte disc)
const LM_TOTAL_SCORE_OFFSET = 77;  // disc(8)+league(32)+member(32)+slot(1)+gw_score(4) = 77

function u8Le(n: number): Buffer  { return Buffer.from([n & 0xff]); }
function u16Le(n: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32Le(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64Le(n: bigint): Buffer  { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
function i64Le(n: bigint): Buffer  { const b = Buffer.alloc(8); b.writeBigInt64LE(n, 0); return b; }
function u128Le(n: bigint): Buffer {
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(n & 0xffffffffffffffffn, 0);
  b.writeBigUInt64LE(n >> 64n, 8);
  return b;
}

function pdaOf(seeds: Buffer[], prog: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, prog)[0];
}

const mxePda      = () => pdaOf([Buffer.from("MXEAccount"), TERRACE.toBuffer()], ARCIUM);
const signPda     = () => pdaOf([Buffer.from("ArciumSignerAccount")], TERRACE);
const compDefPda  = (off: number) => pdaOf([Buffer.from("ComputationDefinitionAccount"), TERRACE.toBuffer(), u32Le(off)], ARCIUM);
const mempoolPda  = (co: number) => pdaOf([Buffer.from("Mempool"), u32Le(co)], ARCIUM);
const execpoolPda = (co: number) => pdaOf([Buffer.from("Execpool"), u32Le(co)], ARCIUM);
const compPda     = (co: number, coff: bigint) => pdaOf([Buffer.from("ComputationAccount"), u32Le(co), u64Le(coff)], ARCIUM);
const clusterPda  = (co: number) => pdaOf([Buffer.from("Cluster"), u32Le(co)], ARCIUM);
const feePoolPda  = () => pdaOf([Buffer.from("FeePool")], ARCIUM);
const clockPda    = () => pdaOf([Buffer.from("ClockAccount")], ARCIUM);
const lutPda      = (mxe: PublicKey, slot: bigint) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(slot, 0);
  return pdaOf([mxe.toBuffer(), b], new PublicKey("AddressLookupTab1e1111111111111111111111111"));
};

const leaguePda      = (c: PublicKey, n: bigint) => pdaOf([Buffer.from("league"), c.toBuffer(), u64Le(n)], TERRACE);
const lmPda          = (l: PublicKey, m: PublicKey) => pdaOf([Buffer.from("league_member"), l.toBuffer(), m.toBuffer()], TERRACE);
const scorePda       = (l: PublicKey, m: PublicKey) => pdaOf([Buffer.from("member-score"), l.toBuffer(), m.toBuffer()], TERRACE);
const marketPda      = (c: PublicKey, n: bigint) => pdaOf([Buffer.from("market"), c.toBuffer(), u64Le(n)], TERRACE);
const betPda         = (m: PublicKey, b: PublicKey) => pdaOf([Buffer.from("bet"), m.toBuffer(), b.toBuffer()], TERRACE);
const scoreRecordPda = (l: PublicKey, bet: PublicKey) => pdaOf([Buffer.from("league_score"), l.toBuffer(), bet.toBuffer()], TERRACE);

function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  return pdaOf([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROG);
}

async function readMxe(conn: web3.Connection): Promise<{ clusterOffset: number; lutOffsetSlot: bigint }> {
  const info = await conn.getAccountInfo(mxePda());
  if (!info) throw new Error("MXE not found");
  const d = info.data;
  let off = 8;
  const hasCluster = d[off] === 1; off++;
  const clusterOffset = hasCluster ? d.readUInt32LE(off) : 0;
  if (hasCluster) off += 4;
  off += 8 + 8 + 32;
  const hasAuth = d[off] === 1; off += 1 + (hasAuth ? 32 : 0);
  const setTag = d[off]; off += 1 + 160;
  if (setTag !== 0) { const vl = d.readUInt32LE(off); off += 4 + vl; }
  return { clusterOffset, lutOffsetSlot: d.readBigUInt64LE(off) };
}

function disc(idl: any, name: string): Buffer {
  const ix = (idl.instructions as any[]).find((i: any) => i.name === name);
  if (!ix) throw new Error(`No instruction '${name}'`);
  return Buffer.from(ix.discriminator as number[]);
}

async function send(
  provider: AnchorProvider,
  label: string,
  ix: web3.TransactionInstruction,
): Promise<string> {
  const tx  = new web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  console.log(`  ✓ ${label}`);
  console.log(`    https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

async function pollUntil(
  label: string,
  conn: web3.Connection,
  address: PublicKey,
  check: (data: Buffer) => boolean,
  timeoutMs = 120_000,
  pollMs = 4_000,
): Promise<Buffer> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const info = await conn.getAccountInfo(address, "confirmed");
    if (info && check(info.data as Buffer)) {
      console.log(`\n  ✅ ${label} — elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return info.data as Buffer;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, pollMs));
  }
  console.log();
  throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
}

describe("private-league-full-e2e", () => {
  it("full flow: init → increment → reveal", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;
    const conn   = provider.connection;
    const idl    = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"),
    );

    console.log("\nWallet:", wallet.toBase58());
    const { clusterOffset, lutOffsetSlot } = await readMxe(conn);
    console.log(`MXE cluster_offset=${clusterOffset}  lut_offset_slot=${lutOffsetSlot}`);

    const mxe = mxePda();
    const lut = lutPda(mxe, lutOffsetSlot);

    // ── 1. create_league ──────────────────────────────────────────────────────
    const leagueNonce = BigInt(Date.now());
    const league      = leaguePda(wallet, leagueNonce);
    const vault       = ata(league, USDC_MINT);
    console.log("\n[1] create_league  PDA:", league.toBase58());

    const nameBytes  = Buffer.from("Full E2E League");
    const createData = Buffer.concat([
      disc(idl, "create_league"),
      u32Le(nameBytes.length), nameBytes,
      u16Le(1),               // season
      Buffer.from([1]),        // is_private
      u64Le(0n),               // entry_fee_usdc
      Buffer.from([10]),       // max_members
      u64Le(leagueNonce),
    ]);
    await send(provider, "create_league", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: league,                  isSigner: false, isWritable: true  },
        { pubkey: vault,                   isSigner: false, isWritable: true  },
        { pubkey: USDC_MINT,               isSigner: false, isWritable: false },
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROG,   isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: createData,
    }));

    // ── 2. join_league ────────────────────────────────────────────────────────
    const lm        = lmPda(league, wallet);
    const memberAta = ata(wallet, USDC_MINT);
    console.log("\n[2] join_league  LM:", lm.toBase58());
    await send(provider, "join_league", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: league,                  isSigner: false, isWritable: true  },
        { pubkey: lm,                      isSigner: false, isWritable: true  },
        { pubkey: memberAta,               isSigner: false, isWritable: true  },
        { pubkey: vault,                   isSigner: false, isWritable: true  },
        { pubkey: USDC_MINT,               isSigner: false, isWritable: false },
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROG,   isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: disc(idl, "join_league"),
    }));

    // ── 3. init_member_score ─────────────────────────────────────────────────
    const score = scorePda(league, wallet);
    console.log("\n[3] init_member_score  Score PDA:", score.toBase58());
    const initCompOff  = BigInt(Date.now());
    const initNonce    = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

    await send(provider, "init_member_score", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: wallet,                           isSigner: true,  isWritable: true  },
        { pubkey: mxe,                              isSigner: false, isWritable: false },
        { pubkey: signPda(),                        isSigner: false, isWritable: false },
        { pubkey: mempoolPda(clusterOffset),        isSigner: false, isWritable: true  },
        { pubkey: execpoolPda(clusterOffset),       isSigner: false, isWritable: true  },
        { pubkey: compPda(clusterOffset, initCompOff), isSigner: false, isWritable: true },
        { pubkey: compDefPda(COMP_DEF_OFFSET_INIT), isSigner: false, isWritable: false },
        { pubkey: clusterPda(clusterOffset),        isSigner: false, isWritable: true  },
        { pubkey: feePoolPda(),                     isSigner: false, isWritable: true  },
        { pubkey: clockPda(),                       isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId,          isSigner: false, isWritable: false },
        { pubkey: ARCIUM,                           isSigner: false, isWritable: false },
        { pubkey: league,                           isSigner: false, isWritable: false },
        { pubkey: lm,                               isSigner: false, isWritable: false },
        { pubkey: score,                            isSigner: false, isWritable: true  },
      ],
      data: Buffer.concat([disc(idl, "init_member_score"), u64Le(initCompOff), u128Le(initNonce)]),
    }));

    console.log("\n  Waiting for init_member_score callback…");
    const scoreDataInit = await pollUntil(
      "init callback",
      conn, score,
      (d) => d.length >= SCORE_ENCRYPTED_END && d.slice(SCORE_ENCRYPTED_START, SCORE_ENCRYPTED_END).some((b) => b !== 0),
    );
    const cipherInit = Buffer.from(scoreDataInit.slice(SCORE_ENCRYPTED_START, SCORE_ENCRYPTED_END));
    console.log("     Ciphertext (init):", cipherInit.toString("hex"));

    // ── 4. create_market ─────────────────────────────────────────────────────
    const marketNonce = BigInt(Date.now());
    const market      = marketPda(wallet, marketNonce);
    const marketVault = ata(market, USDC_MINT);
    console.log("\n[4] create_market  PDA:", market.toBase58());

    const question    = Buffer.from("Will team A win?");
    const expiry      = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1h from now
    const createMktData = Buffer.concat([
      disc(idl, "create_market"),
      u32Le(question.length), question,
      i64Le(expiry),
      u16Le(0),        // creator_fee_bps
      u64Le(marketNonce),
      Buffer.from([0]), // oracle: None
      Buffer.from([0]), // is_private: false
      Buffer.from([0]), // is_flash: false
    ]);
    await send(provider, "create_market", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: market,                  isSigner: false, isWritable: true  },
        { pubkey: marketVault,             isSigner: false, isWritable: true  },
        { pubkey: USDC_MINT,               isSigner: false, isWritable: false },
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROG,   isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: createMktData,
    }));

    // ── 5. place_bet ─────────────────────────────────────────────────────────
    const bet      = betPda(market, wallet);
    const betAmount = 100_000n; // 0.1 USDC (6 decimals) — minimum allowed
    console.log("\n[5] place_bet (outcome=1, amount=1000)  Bet PDA:", bet.toBase58());
    const betData = Buffer.concat([
      disc(idl, "place_bet"),
      u8Le(1),           // outcome: Yes
      u64Le(betAmount),
    ]);
    await send(provider, "place_bet", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: market,                  isSigner: false, isWritable: true  },
        { pubkey: bet,                     isSigner: false, isWritable: true  },
        { pubkey: marketVault,             isSigner: false, isWritable: true  },
        { pubkey: memberAta,               isSigner: false, isWritable: true  },
        { pubkey: USDC_MINT,               isSigner: false, isWritable: false },
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROG,   isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: betData,
    }));

    // ── 6. settle_market ─────────────────────────────────────────────────────
    console.log("\n[6] settle_market (outcome=1, bet wins)");
    await send(provider, "settle_market", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: market,  isSigner: false, isWritable: true },
        { pubkey: wallet,  isSigner: true,  isWritable: false },
      ],
      data: Buffer.concat([disc(idl, "settle_market"), u8Le(1)]),
    }));

    // ── 7. record_private_league_win ─────────────────────────────────────────
    const scoreRecord   = scoreRecordPda(league, bet);
    const incrCompOff   = BigInt(Date.now());
    console.log("\n[7] record_private_league_win  ScoreRecord:", scoreRecord.toBase58());

    await send(provider, "record_private_league_win", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: wallet,                             isSigner: true,  isWritable: true  },
        { pubkey: mxe,                                isSigner: false, isWritable: false },
        { pubkey: signPda(),                          isSigner: false, isWritable: false },
        { pubkey: mempoolPda(clusterOffset),          isSigner: false, isWritable: true  },
        { pubkey: execpoolPda(clusterOffset),         isSigner: false, isWritable: true  },
        { pubkey: compPda(clusterOffset, incrCompOff), isSigner: false, isWritable: true },
        { pubkey: compDefPda(COMP_DEF_OFFSET_SCORE),  isSigner: false, isWritable: false },
        { pubkey: clusterPda(clusterOffset),          isSigner: false, isWritable: true  },
        { pubkey: feePoolPda(),                       isSigner: false, isWritable: true  },
        { pubkey: clockPda(),                         isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId,            isSigner: false, isWritable: false },
        { pubkey: ARCIUM,                             isSigner: false, isWritable: false },
        { pubkey: league,                             isSigner: false, isWritable: false },
        { pubkey: lm,                                 isSigner: false, isWritable: false },
        { pubkey: score,                              isSigner: false, isWritable: true  },
        { pubkey: market,                             isSigner: false, isWritable: false },
        { pubkey: bet,                                isSigner: false, isWritable: false },
        { pubkey: scoreRecord,                        isSigner: false, isWritable: true  },
      ],
      data: Buffer.concat([disc(idl, "record_private_league_win"), u64Le(incrCompOff)]),
    }));

    console.log("\n  Waiting for increment_member_score callback…");
    const scoreDataIncr = await pollUntil(
      "increment callback",
      conn, score,
      (d) => {
        if (d.length < SCORE_ENCRYPTED_END) return false;
        const cur = Buffer.from(d.slice(SCORE_ENCRYPTED_START, SCORE_ENCRYPTED_END));
        return !cur.equals(cipherInit);
      },
    );
    const cipherIncr = Buffer.from(scoreDataIncr.slice(SCORE_ENCRYPTED_START, SCORE_ENCRYPTED_END));
    console.log("     Ciphertext (after increment):", cipherIncr.toString("hex"));

    // ── 8. advance_gameweek ───────────────────────────────────────────────────
    console.log("\n[8] advance_gameweek");
    await send(provider, "advance_gameweek", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: league, isSigner: false, isWritable: true  },
        { pubkey: wallet, isSigner: true,  isWritable: false },
      ],
      data: disc(idl, "advance_gameweek"),
    }));

    // ── 9. reveal_member_score ────────────────────────────────────────────────
    const revealCompOff = BigInt(Date.now());
    console.log("\n[9] reveal_member_score");

    await send(provider, "reveal_member_score", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: wallet,                              isSigner: true,  isWritable: true  },
        { pubkey: mxe,                                 isSigner: false, isWritable: false },
        { pubkey: signPda(),                           isSigner: false, isWritable: false },
        { pubkey: mempoolPda(clusterOffset),           isSigner: false, isWritable: true  },
        { pubkey: execpoolPda(clusterOffset),          isSigner: false, isWritable: true  },
        { pubkey: compPda(clusterOffset, revealCompOff), isSigner: false, isWritable: true },
        { pubkey: compDefPda(COMP_DEF_OFFSET_REVEAL),  isSigner: false, isWritable: false },
        { pubkey: clusterPda(clusterOffset),           isSigner: false, isWritable: true  },
        { pubkey: feePoolPda(),                        isSigner: false, isWritable: true  },
        { pubkey: clockPda(),                          isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId,             isSigner: false, isWritable: false },
        { pubkey: ARCIUM,                              isSigner: false, isWritable: false },
        { pubkey: league,                              isSigner: false, isWritable: false },
        { pubkey: lm,                                  isSigner: false, isWritable: true  },
        { pubkey: score,                               isSigner: false, isWritable: true  },
      ],
      data: Buffer.concat([disc(idl, "reveal_member_score"), u64Le(revealCompOff)]),
    }));

    console.log("\n  Waiting for reveal_member_score callback…");
    const scoreDataReveal = await pollUntil(
      "reveal callback",
      conn, score,
      (d) => d.length > SCORE_REVEALED_OFFSET && d[SCORE_REVEALED_OFFSET] === 1,
    );

    // ── 10. Assertions ────────────────────────────────────────────────────────
    const isRevealed = scoreDataReveal[SCORE_REVEALED_OFFSET] === 1;
    const lmInfo     = await conn.getAccountInfo(lm, "confirmed");
    assert.ok(lmInfo, "LeagueMember account not found");
    const totalScore = (lmInfo.data as Buffer).readUInt32LE(LM_TOTAL_SCORE_OFFSET);

    console.log("\n── Final state ─────────────────────────────────────────────────────────");
    console.log("League:         ", league.toBase58());
    console.log("LeagueMember:   ", lm.toBase58());
    console.log("MemberScore:    ", score.toBase58());
    console.log("Market:         ", market.toBase58());
    console.log("Bet:            ", bet.toBase58());
    console.log(`is_revealed:     ${isRevealed}`);
    console.log(`total_score:     ${totalScore}`);
    console.log("Explorer:", `https://explorer.solana.com/address/${league.toBase58()}?cluster=devnet`);

    assert.ok(isRevealed, "MemberScore.is_revealed should be true after reveal callback");
    assert.strictEqual(totalScore, 1, "LeagueMember.total_score should be 1");
  });
});

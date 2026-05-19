/**
 * End-to-end smoke test for private leagues.
 * Creates a private league, joins, inits encrypted member score,
 * then polls until the Arcium callback populates the ciphertext.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const ARCIUM                 = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE                = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");
const USDC_MINT              = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM          = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROG  = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const COMP_DEF_OFFSET_INIT   = 1481970775;  // init_member_score_v2

function u32Le(n: number): Buffer  { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64Le(n: bigint): Buffer  { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
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
const leaguePda   = (c: PublicKey, n: bigint) => pdaOf([Buffer.from("league"), c.toBuffer(), u64Le(n)], TERRACE);
const lmPda       = (l: PublicKey, m: PublicKey) => pdaOf([Buffer.from("league_member"), l.toBuffer(), m.toBuffer()], TERRACE);
const scorePda    = (l: PublicKey, m: PublicKey) => pdaOf([Buffer.from("member-score"), l.toBuffer(), m.toBuffer()], TERRACE);
const lutPda      = (mxe: PublicKey, slot: bigint) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(slot, 0);
  return pdaOf([mxe.toBuffer(), b], new PublicKey("AddressLookupTab1e1111111111111111111111111"));
};
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

async function send(provider: AnchorProvider, label: string, ix: web3.TransactionInstruction): Promise<string> {
  const tx  = new web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  console.log(`  ✓ ${label}`);
  console.log(`    https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

describe("private-league-e2e", () => {
  it("creates private league → joins → inits encrypted score → waits for Arcium callback", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;
    const conn   = provider.connection;
    const idl    = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"));

    console.log("\nWallet:", wallet.toBase58());

    // ── 1. create_league ────────────────────────────────────────────────────
    const nonce  = BigInt(Date.now());
    const league = leaguePda(wallet, nonce);
    const vault  = ata(league, USDC_MINT);
    console.log("\n[1] Creating private league…  PDA:", league.toBase58());

    const nameBytes  = Buffer.from("E2E Private League");
    const createData = Buffer.concat([
      disc(idl, "create_league"),
      u32Le(nameBytes.length), nameBytes,  // name: String
      Buffer.from([1, 0]),                  // season: u16 = 1
      Buffer.from([1]),                     // is_private: true
      u64Le(0n),                            // entry_fee_usdc: 0
      Buffer.from([10]),                    // max_members: 10
      u64Le(nonce),                         // nonce
    ]);

    // IDL order: league, vault, usdc_mint, creator, token_program, atp, system
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

    // ── 2. join_league ───────────────────────────────────────────────────────
    const lm         = lmPda(league, wallet);
    const memberAta  = ata(wallet, USDC_MINT);
    console.log("\n[2] Joining league…  LeagueMember:", lm.toBase58());

    // IDL order: league, league_member, member_ata, league_vault, usdc_mint, member, token_prog, atp, system
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
    console.log("\n[3] Initializing encrypted member score via Arcium…");
    const { clusterOffset, lutOffsetSlot } = await readMxe(conn);
    console.log("    cluster_offset:", clusterOffset, " lut_offset_slot:", lutOffsetSlot.toString());

    const compOff  = BigInt(Date.now());
    const nonceMem = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const score    = scorePda(league, wallet);
    const mxe      = mxePda();
    const lut      = lutPda(mxe, lutOffsetSlot);
    console.log("    MemberScore PDA:", score.toBase58());

    // IDL order: member, mxe_account, sign_pda_account, mempool_account, executing_pool,
    //            computation_account, comp_def_account, cluster_account, pool_account,
    //            clock_account, system_program, arcium_program, league, league_member, member_score
    await send(provider, "init_member_score", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: wallet,                      isSigner: true,  isWritable: true  },
        { pubkey: mxe,                         isSigner: false, isWritable: false },
        { pubkey: signPda(),                   isSigner: false, isWritable: false },
        { pubkey: mempoolPda(clusterOffset),   isSigner: false, isWritable: true  },
        { pubkey: execpoolPda(clusterOffset),  isSigner: false, isWritable: true  },
        { pubkey: compPda(clusterOffset, compOff), isSigner: false, isWritable: true },
        { pubkey: compDefPda(COMP_DEF_OFFSET_INIT), isSigner: false, isWritable: false },
        { pubkey: clusterPda(clusterOffset),   isSigner: false, isWritable: true  },
        { pubkey: feePoolPda(),                isSigner: false, isWritable: true  },
        { pubkey: clockPda(),                  isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
        { pubkey: ARCIUM,                      isSigner: false, isWritable: false },
        { pubkey: league,                      isSigner: false, isWritable: false },
        { pubkey: lm,                          isSigner: false, isWritable: false },
        { pubkey: score,                       isSigner: false, isWritable: true  },
      ],
      data: Buffer.concat([disc(idl, "init_member_score"), u64Le(compOff), u128Le(nonceMem)]),
    }));

    // ── 4. Poll for Arcium callback ───────────────────────────────────────────
    // encrypted_score (32 bytes) starts at offset 72 in PrivateMemberScore account.
    // All-zero = callback not yet landed.
    console.log("\n[4] Waiting for Arcium callback (up to 90s)…");
    const TIMEOUT = 90_000;
    const POLL    = 4_000;
    const t0      = Date.now();
    let   ready   = false;

    while (Date.now() - t0 < TIMEOUT) {
      const info = await conn.getAccountInfo(score, "confirmed");
      if (info && info.data.length >= 104) {
        const cipher = info.data.slice(72, 104);
        if (cipher.some((b: number) => b !== 0)) {
          console.log("\n  ✅ Arcium callback landed!");
          console.log("     Elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
          console.log("     Ciphertext (hex):", Buffer.from(cipher).toString("hex"));
          console.log("     scores_gameweek:", info.data[120], "  is_revealed:", info.data[121] === 1);
          ready = true;
          break;
        }
      }
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, POLL));
    }
    console.log();

    console.log("\n── Accounts ─────────────────────────────────────────────────────────────");
    console.log("League:      ", league.toBase58());
    console.log("LeagueMember:", lm.toBase58());
    console.log("MemberScore: ", score.toBase58());
    console.log("Explorer:     https://explorer.solana.com/address/" + league.toBase58() + "?cluster=devnet");

    if (!ready) {
      console.warn("\n⏳ Arcium callback not yet landed — check MemberScore account in ~30s");
      console.log("   https://explorer.solana.com/address/" + score.toBase58() + "?cluster=devnet");
    }

    assert.ok(ready, "Arcium init_member_score callback did not land within 90s");
  });
});

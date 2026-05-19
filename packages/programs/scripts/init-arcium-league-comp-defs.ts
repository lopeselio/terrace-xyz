/**
 * One-time setup: registers the three private-league MPC computation
 * definitions (init_member_score, increment_member_score, reveal_member_score)
 * with Arcium.  Run once after deploying the updated program.
 *
 * Usage:
 *   cd packages/programs
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-mocha -p tsconfig.scripts.json -t 120000 \
 *     scripts/init-arcium-league-comp-defs.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AddressLookupTableProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ARCIUM_PROGRAM_ID  = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE_PROGRAM_ID = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

// sha256(circuit_name)[0..4] as LE u32  — _v2 circuits
const COMP_DEF_OFFSET_INIT_MEMBER_SCORE      = 1481970775;  // init_member_score_v2
const COMP_DEF_OFFSET_INCREMENT_MEMBER_SCORE = 635120120;   // increment_member_score_v2
const COMP_DEF_OFFSET_REVEAL_MEMBER_SCORE    = 3852259505;  // reveal_member_score_v2

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
function u32Le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function mxePda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MXEAccount"), TERRACE_PROGRAM_ID.toBuffer()],
    ARCIUM_PROGRAM_ID
  );
  return pda;
}

function compDefPda(offset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), TERRACE_PROGRAM_ID.toBuffer(), u32Le(offset)],
    ARCIUM_PROGRAM_ID
  );
  return pda;
}

function lutPda(mxe: PublicKey, lutOffsetSlot: bigint): PublicKey {
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64LE(lutOffsetSlot, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [mxe.toBuffer(), slotBuf],
    AddressLookupTableProgram.programId
  );
  return pda;
}

// ---------------------------------------------------------------------------
// Read lut_offset_slot from the on-chain MXEAccount
// MXEAccount Borsh layout (after 8-byte discriminator):
//   cluster:                  Option<u32>        → 5 bytes (1 tag + 4)
//   keygen_offset:            u64                → 8 bytes
//   key_recovery_init_offset: u64                → 8 bytes
//   mxe_program_id:           pubkey             → 32 bytes
//   authority:                Option<pubkey>     → 33 bytes (1 tag + 32)
//   utility_pubkeys:          SetUnset<UtilityPubkeys>
//     Set  variant (tag=0): 1 + 160 bytes
//     Unset variant (tag=1): 1 + 160 + 4 + N bytes
//   lut_offset_slot:          u64                → 8 bytes
// ---------------------------------------------------------------------------
async function readLutOffsetSlot(
  connection: anchor.web3.Connection,
  mxe: PublicKey
): Promise<bigint> {
  const info = await connection.getAccountInfo(mxe);
  if (!info) throw new Error(`MXE account ${mxe} not found on-chain`);

  const data = info.data;
  let offset = 8; // skip discriminator

  // cluster: Option<u32>
  const hasCluster = data[offset] === 1;
  offset += 1 + (hasCluster ? 4 : 0);

  // keygen_offset + key_recovery_init_offset
  offset += 8 + 8;

  // mxe_program_id
  offset += 32;

  // authority: Option<pubkey>
  const hasAuthority = data[offset] === 1;
  offset += 1 + (hasAuthority ? 32 : 0);

  // utility_pubkeys: SetUnset<UtilityPubkeys> (160 bytes of keys)
  const setUnsetTag = data[offset];
  offset += 1;
  if (setUnsetTag === 0) {
    offset += 160;
  } else {
    offset += 160;
    const vecLen = data.readUInt32LE(offset);
    offset += 4 + vecLen;
  }

  // lut_offset_slot: u64
  const lutOffsetSlot = data.readBigUInt64LE(offset);
  console.log(`  lut_offset_slot = ${lutOffsetSlot} (byte offset ${offset})`);
  return lutOffsetSlot;
}

// ---------------------------------------------------------------------------
// Send a single instruction and confirm (idempotent — skips if already init)
// ---------------------------------------------------------------------------
async function sendIx(
  provider: AnchorProvider,
  label: string,
  ix: anchor.web3.TransactionInstruction
): Promise<void> {
  const tx = new anchor.web3.Transaction().add(ix);
  try {
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    console.log(`  ✓ ${label}`);
    console.log(`    https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (err: any) {
    if (
      err?.logs?.some((l: string) =>
        l.includes("already in use") || l.includes("account already exists")
      )
    ) {
      console.log(`  ⚡ ${label} — already initialized, skipping`);
    } else {
      console.error(`  ✗ ${label} failed:`, err?.message ?? err);
      if (err?.logs) console.error("  Logs:", err.logs.slice(-6).join("\n  "));
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Build init_*_comp_def instruction
// ---------------------------------------------------------------------------
function buildCompDefIx(
  discriminatorBytes: number[],
  payer: PublicKey,
  mxe: PublicKey,
  compDef: PublicKey,
  lut: PublicKey,
  terraceProgram: PublicKey
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    programId: terraceProgram,
    keys: [
      { pubkey: payer,                              isSigner: true,  isWritable: true  },
      { pubkey: mxe,                                isSigner: false, isWritable: true  },
      { pubkey: compDef,                            isSigner: false, isWritable: true  },
      { pubkey: lut,                                isSigner: false, isWritable: true  },
      { pubkey: AddressLookupTableProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ARCIUM_PROGRAM_ID,                  isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,            isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminatorBytes),
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
describe("init-arcium-league-comp-defs", () => {
  it("registers all three league score computation definitions", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);

    const idlPath = path.join(__dirname, "../target/idl/terrace.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

    const payer = (provider.wallet as anchor.Wallet).publicKey;
    const mxe   = mxePda();

    console.log("\nTerrace program :", TERRACE_PROGRAM_ID.toBase58());
    console.log("MXE account     :", mxe.toBase58());
    console.log("Payer           :", payer.toBase58());

    console.log("\nReading MXE account to get lut_offset_slot...");
    const lutOffsetSlot = await readLutOffsetSlot(provider.connection, mxe);

    const lut = lutPda(mxe, lutOffsetSlot);
    console.log("LUT address     :", lut.toBase58());

    const compDefInit      = compDefPda(COMP_DEF_OFFSET_INIT_MEMBER_SCORE);
    const compDefIncrement = compDefPda(COMP_DEF_OFFSET_INCREMENT_MEMBER_SCORE);
    const compDefReveal    = compDefPda(COMP_DEF_OFFSET_REVEAL_MEMBER_SCORE);

    console.log("\nCompDef INIT_MEMBER_SCORE      :", compDefInit.toBase58());
    console.log("CompDef INCREMENT_MEMBER_SCORE :", compDefIncrement.toBase58());
    console.log("CompDef REVEAL_MEMBER_SCORE    :", compDefReveal.toBase58());

    function disc(name: string): number[] {
      const ix = (idl.instructions as any[]).find((i) => i.name === name);
      if (!ix) throw new Error(`instruction ${name} not found in IDL`);
      return ix.discriminator as number[];
    }

    console.log("\nInitializing league score computation definitions...");

    await sendIx(provider, "init_init_member_score_comp_def",
      buildCompDefIx(disc("init_init_member_score_comp_def"),
        payer, mxe, compDefInit, lut, TERRACE_PROGRAM_ID));

    await sendIx(provider, "init_increment_member_score_comp_def",
      buildCompDefIx(disc("init_increment_member_score_comp_def"),
        payer, mxe, compDefIncrement, lut, TERRACE_PROGRAM_ID));

    await sendIx(provider, "init_reveal_member_score_comp_def",
      buildCompDefIx(disc("init_reveal_member_score_comp_def"),
        payer, mxe, compDefReveal, lut, TERRACE_PROGRAM_ID));

    console.log("\n✅ All league score computation definitions initialized.");
    console.log("Private leagues are ready to accept encrypted scores.");
  });
});

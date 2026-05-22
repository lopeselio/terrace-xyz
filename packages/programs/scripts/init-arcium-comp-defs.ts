/**
 * One-time setup: registers the three private-market MPC computation
 * definitions with Arcium.  Run once after `arcium deploy --skip-deploy`.
 *
 * Usage:
 *   cd packages/programs
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-mocha -p tsconfig.scripts.json -t 120000 scripts/init-arcium-comp-defs.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { AddressLookupTableProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE_PROGRAM_ID = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

const COMP_DEF_OFFSET_INIT   = 3039685700;
const COMP_DEF_OFFSET_BET    = 886724798;
const COMP_DEF_OFFSET_REVEAL = 2928281020;

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
  connection: Connection,
  mxe: PublicKey
): Promise<bigint> {
  const info = await connection.getAccountInfo(mxe);
  if (!info) throw new Error(`MXE account ${mxe} not found on-chain`);

  const data = info.data;
  let offset = 8; // skip discriminator

  // cluster: Option<u32> — 1 byte tag + 4 if Some
  const hasCluster = data[offset] === 1;
  offset += 1 + (hasCluster ? 4 : 0);

  // keygen_offset + key_recovery_init_offset: two u64s
  offset += 8 + 8;

  // mxe_program_id: pubkey (32 bytes)
  offset += 32;

  // authority: Option<pubkey>
  const hasAuthority = data[offset] === 1;
  offset += 1 + (hasAuthority ? 32 : 0);

  // utility_pubkeys: SetUnset<UtilityPubkeys>
  // UtilityPubkeys = x25519(32) + ed25519(32) + elgamal(32) + proof(64) = 160 bytes
  const setUnsetTag = data[offset];
  offset += 1;
  if (setUnsetTag === 0) {
    // Set(T): just T
    offset += 160;
  } else {
    // Unset(T, Vec<bool>): T + 4-byte vec length + N bools
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
// Send a single instruction and confirm
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
    // Already initialized is fine — idempotent
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
// Build init_*_comp_def instruction manually (matches IDL discriminators)
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
      { pubkey: payer,            isSigner: true,  isWritable: true  },
      { pubkey: mxe,              isSigner: false, isWritable: true  },
      { pubkey: compDef,          isSigner: false, isWritable: true  },
      { pubkey: lut,              isSigner: false, isWritable: true  },
      { pubkey: AddressLookupTableProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ARCIUM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminatorBytes),
  });
}

// ---------------------------------------------------------------------------
// Main — wrapped in mocha so ts-mocha can execute it
// ---------------------------------------------------------------------------
describe("init-arcium-comp-defs", () => {
  it("registers all three computation definitions", async () => {
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

    const compDefInit   = compDefPda(COMP_DEF_OFFSET_INIT);
    const compDefBet    = compDefPda(COMP_DEF_OFFSET_BET);
    const compDefReveal = compDefPda(COMP_DEF_OFFSET_REVEAL);

    console.log("\nCompDef INIT   :", compDefInit.toBase58());
    console.log("CompDef BET    :", compDefBet.toBase58());
    console.log("CompDef REVEAL :", compDefReveal.toBase58());

    function disc(name: string): number[] {
      const ix = (idl.instructions as any[]).find((i) => i.name === name);
      if (!ix) throw new Error(`instruction ${name} not found in IDL`);
      return ix.discriminator as number[];
    }

    console.log("\nInitializing computation definitions...");

    await sendIx(provider, "init_init_private_market_state_comp_def",
      buildCompDefIx(disc("init_init_private_market_state_comp_def"),
        payer, mxe, compDefInit, lut, TERRACE_PROGRAM_ID));

    await sendIx(provider, "init_place_private_bet_comp_def",
      buildCompDefIx(disc("init_place_private_bet_comp_def"),
        payer, mxe, compDefBet, lut, TERRACE_PROGRAM_ID));

    await sendIx(provider, "init_reveal_private_market_comp_def",
      buildCompDefIx(disc("init_reveal_private_market_comp_def"),
        payer, mxe, compDefReveal, lut, TERRACE_PROGRAM_ID));

    console.log("\n✅ All computation definitions initialized.");
    console.log("Private markets are ready to use.");
  });
});

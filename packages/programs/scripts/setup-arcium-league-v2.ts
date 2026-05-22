/**
 * Full setup for _v2 league score MPC computation definitions.
 * Runs 4 steps in sequence:
 *   1. init_computation_definition (via Terrace program instructions)
 *   2. init_raw_circuit_acc (direct to Arcium program)
 *   3. upload_circuit chunks (direct to Arcium program)
 *   4. finalize_computation_definition (direct to Arcium program)
 *
 * Usage:
 *   cd packages/programs
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-mocha -p tsconfig.scripts.json -t 1800000 \
 *     scripts/setup-arcium-league-v2.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AddressLookupTableProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ARCIUM_PROGRAM_ID  = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE_PROGRAM_ID = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

// sha256("init_member_score_v2")[0..4] LE u32
const COMP_DEF_OFFSET_INIT      = 1481970775;
// sha256("increment_member_score_v2")[0..4] LE u32
const COMP_DEF_OFFSET_INCREMENT = 635120120;
// sha256("reveal_member_score_v2")[0..4] LE u32
const COMP_DEF_OFFSET_REVEAL    = 3852259505;
// sha256("record_private_league_win_v8")[0..4] LE u32
// DIAGNOSTIC: v7 has same signature as v6 but ignores inputs and always +1.
// Used to determine whether the basic Enc<Mxe, u64> chain works for non-zero
// values (would reveal score = 1) or is fully broken (would still reveal 0).
const COMP_DEF_OFFSET_PRIVATE_WIN = 3891244117;

const DISC_INIT_RAW_CIRCUIT_ACC = Buffer.from([16, 228, 193, 228, 93, 231, 58, 4]);
const DISC_UPLOAD_CIRCUIT       = Buffer.from([86, 238, 214, 111, 30, 23, 168, 100]);
const DISC_FINALIZE_COMP_DEF    = Buffer.from([174, 66, 159, 51, 199, 243, 219, 38]);

const CHUNK_SIZE = 814;

const CIRCUITS = [
  { name: "init_member_score_v2",           offset: COMP_DEF_OFFSET_INIT,        file: "build/init_member_score_v2.arcis",           initFnName: "init_init_member_score_comp_def" },
  { name: "increment_member_score_v2",      offset: COMP_DEF_OFFSET_INCREMENT,   file: "build/increment_member_score_v2.arcis",      initFnName: "init_increment_member_score_comp_def" },
  { name: "reveal_member_score_v2",         offset: COMP_DEF_OFFSET_REVEAL,      file: "build/reveal_member_score_v2.arcis",         initFnName: "init_reveal_member_score_comp_def" },
  { name: "record_private_league_win_v8",   offset: COMP_DEF_OFFSET_PRIVATE_WIN, file: "build/record_private_league_win_v8.arcis",   initFnName: "init_record_private_league_win_v2_comp_def" },
];

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

function rawCircuitPda(compDefAcc: PublicKey, chunkIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefAcc.toBuffer(), Buffer.from([chunkIndex])],
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

async function readLutOffsetSlot(
  connection: anchor.web3.Connection,
  mxe: PublicKey
): Promise<bigint> {
  const info = await connection.getAccountInfo(mxe);
  if (!info) throw new Error(`MXE account ${mxe} not found on-chain`);
  const data = info.data;
  let offset = 8;
  const hasCluster = data[offset] === 1;
  offset += 1 + (hasCluster ? 4 : 0);
  offset += 8 + 8 + 32;
  const hasAuthority = data[offset] === 1;
  offset += 1 + (hasAuthority ? 32 : 0);
  const setUnsetTag = data[offset];
  offset += 1;
  if (setUnsetTag === 0) {
    offset += 160;
  } else {
    offset += 160;
    const vecLen = data.readUInt32LE(offset);
    offset += 4 + vecLen;
  }
  const lutOffsetSlot = data.readBigUInt64LE(offset);
  console.log(`  lut_offset_slot = ${lutOffsetSlot}`);
  return lutOffsetSlot;
}

// ---------------------------------------------------------------------------
// TX helpers
// ---------------------------------------------------------------------------
async function sendIx(
  provider: AnchorProvider,
  label: string,
  ix: web3.TransactionInstruction
): Promise<void> {
  const tx = new web3.Transaction().add(ix);
  try {
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    console.log(`  ✓ ${label}`);
    console.log(`    https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (err: any) {
    const logs: string[] = err?.logs ?? [];
    if (
      logs.some((l: string) =>
        l.includes("already in use") || l.includes("account already exists") ||
        l.includes("already initialized") || l.includes("AlreadyInUse")
      )
    ) {
      console.log(`  ⚡ ${label} — already done, skipping`);
    } else {
      console.error(`  ✗ ${label} failed:`, err?.message ?? err);
      if (logs.length) console.error("  Logs:", logs.slice(-8).join("\n  "));
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1 — init comp def via Terrace instruction
// ---------------------------------------------------------------------------
async function initCompDef(
  provider: AnchorProvider,
  idl: any,
  payer: PublicKey,
  mxe: PublicKey,
  lut: PublicKey,
  circuit: typeof CIRCUITS[0]
): Promise<void> {
  const disc = (idl.instructions as any[]).find((i: any) => i.name === circuit.initFnName);
  if (!disc) throw new Error(`Instruction ${circuit.initFnName} not found in IDL`);
  const compDef = compDefPda(circuit.offset);

  const ix = new web3.TransactionInstruction({
    programId: TERRACE_PROGRAM_ID,
    keys: [
      { pubkey: payer,                              isSigner: true,  isWritable: true  },
      { pubkey: mxe,                                isSigner: false, isWritable: true  },
      { pubkey: compDef,                            isSigner: false, isWritable: true  },
      { pubkey: lut,                                isSigner: false, isWritable: true  },
      { pubkey: AddressLookupTableProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ARCIUM_PROGRAM_ID,                  isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,            isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc.discriminator as number[]),
  });

  await sendIx(provider, `${circuit.initFnName} [${circuit.name}]`, ix);
}

// ---------------------------------------------------------------------------
// Step 2 — init_raw_circuit_acc
// ---------------------------------------------------------------------------
async function initRawCircuit(
  provider: AnchorProvider,
  signer: PublicKey,
  circuit: typeof CIRCUITS[0]
): Promise<void> {
  const compDef    = compDefPda(circuit.offset);
  const compDefRaw = rawCircuitPda(compDef, 0);

  const args = Buffer.concat([
    u32Le(circuit.offset),
    TERRACE_PROGRAM_ID.toBuffer(),
    Buffer.from([0]),
  ]);

  const ix = new web3.TransactionInstruction({
    programId: ARCIUM_PROGRAM_ID,
    keys: [
      { pubkey: signer,                  isSigner: true,  isWritable: true  },
      { pubkey: compDef,                 isSigner: false, isWritable: false },
      { pubkey: compDefRaw,              isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC_INIT_RAW_CIRCUIT_ACC, args]),
  });

  await sendIx(provider, `init_raw_circuit_acc [${circuit.name}]`, ix);
}

// ---------------------------------------------------------------------------
// Step 3 — upload_circuit chunks
// ---------------------------------------------------------------------------
async function uploadCircuit(
  provider: AnchorProvider,
  wallet: PublicKey,
  circuit: typeof CIRCUITS[0],
  data: Buffer
): Promise<void> {
  const compDef    = compDefPda(circuit.offset);
  const compDefRaw = rawCircuitPda(compDef, 0);
  const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

  console.log(`  Uploading ${data.length} bytes in ${totalChunks} chunks`);
  console.log(`  CompDefRaw: ${compDefRaw.toBase58()}`);

  for (let i = 0; i < totalChunks; i++) {
    const start  = i * CHUNK_SIZE;
    const slice  = data.slice(start, Math.min(start + CHUNK_SIZE, data.length));
    const padded = Buffer.alloc(CHUNK_SIZE, 0);
    slice.copy(padded, 0);

    const args = Buffer.concat([
      u32Le(circuit.offset),
      TERRACE_PROGRAM_ID.toBuffer(),
      Buffer.from([0]),
      padded,
      u32Le(start),
    ]);

    const ix = new web3.TransactionInstruction({
      programId: ARCIUM_PROGRAM_ID,
      keys: [
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: compDef,                 isSigner: false, isWritable: false },
        { pubkey: compDefRaw,              isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([DISC_UPLOAD_CIRCUIT, args]),
    });

    // Retry each chunk up to 5 times to ride out RPC blockhash expiries / 429s.
    let lastErr: any;
    let landed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = new web3.Transaction().add(ix);
      try {
        await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
        landed = true;
        break;
      } catch (err: any) {
        const logs: string[] = err?.logs ?? [];
        if (logs.some((l: string) => l.includes("ComputationDefinitionAlreadyCompleted"))) {
          console.log(`  ⚡ upload_circuit [${circuit.name}] — already finalized, skipping all chunks`);
          return;
        }
        lastErr = err;
        // Backoff before retry (RPC rate limit / blockhash expiry recovery)
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (!landed) {
      const logs: string[] = lastErr?.logs ?? [];
      console.error(`\n  ✗ upload chunk ${i + 1}/${totalChunks} failed after 5 retries:`, lastErr?.message ?? lastErr);
      if (logs.length) console.error("  Logs:", logs.slice(-6).join("\n  "));
      throw lastErr;
    }

    if (i % 25 === 0 || i === totalChunks - 1) {
      process.stdout.write(`    chunk ${i + 1}/${totalChunks} ✓\n`);
    } else {
      process.stdout.write(".");
    }
    // Light pacing to stay under Helius free-tier rate limits.
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Step 4 — finalize_computation_definition
// ---------------------------------------------------------------------------
async function finalizeCompDef(
  provider: AnchorProvider,
  signer: PublicKey,
  circuit: typeof CIRCUITS[0]
): Promise<void> {
  const compDef    = compDefPda(circuit.offset);
  const compDefRaw = rawCircuitPda(compDef, 0);

  const args = Buffer.concat([
    u32Le(circuit.offset),
    TERRACE_PROGRAM_ID.toBuffer(),
  ]);

  const ix = new web3.TransactionInstruction({
    programId: ARCIUM_PROGRAM_ID,
    keys: [
      { pubkey: signer,     isSigner: true,  isWritable: true  },
      { pubkey: compDef,    isSigner: false, isWritable: true  },
      { pubkey: compDefRaw, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC_FINALIZE_COMP_DEF, args]),
  });

  await sendIx(provider, `finalize_computation_definition [${circuit.name}]`, ix);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
describe("setup-arcium-league-v2", () => {
  it("initialises, uploads, and finalises all 3 _v2 league comp defs", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;

    const idlPath = path.join(__dirname, "../target/idl/terrace.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

    const mxe = mxePda();
    console.log("\nWallet         :", wallet.toBase58());
    console.log("MXE account    :", mxe.toBase58());

    const lutOffsetSlot = await readLutOffsetSlot(provider.connection, mxe);
    const lut = lutPda(mxe, lutOffsetSlot);
    console.log("LUT address    :", lut.toBase58());

    for (const circuit of CIRCUITS) {
      const circuitPath = path.join(__dirname, "..", circuit.file);
      if (!fs.existsSync(circuitPath)) {
        throw new Error(`Circuit file not found: ${circuitPath}\nRun 'arcium build' first.`);
      }
      const data = fs.readFileSync(circuitPath);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Circuit: ${circuit.name}  (${data.length} bytes)`);
      console.log(`CompDef: ${compDefPda(circuit.offset).toBase58()}`);
      console.log(`${"=".repeat(60)}`);

      console.log("\n── Step 1: init_computation_definition ──────────────────────");
      await initCompDef(provider, idl, wallet, mxe, lut, circuit);

      console.log("\n── Step 2: init_raw_circuit_acc ─────────────────────────────");
      await initRawCircuit(provider, wallet, circuit);

      console.log("\n── Step 3: upload_circuit ───────────────────────────────────");
      await uploadCircuit(provider, wallet, circuit, data);

      console.log("\n── Step 4: finalize_computation_definition ──────────────────");
      await finalizeCompDef(provider, wallet, circuit);

      console.log(`\n✅ ${circuit.name} — setup complete`);
    }

    console.log("\n✅ All 4 league comp defs are registered, uploaded, and finalized.");
    console.log("   ARX nodes can now execute encrypted league score computations,");
    console.log("   including private-bet-aware scoring (record_private_league_win_v8).");
  });
});

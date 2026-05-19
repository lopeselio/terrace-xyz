/**
 * One-time fix: creates the raw circuit accounts and finalizes
 * the three league comp defs that were registered but not completed.
 *
 * Usage:
 *   cd packages/programs
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-mocha -p tsconfig.scripts.json -t 120000 \
 *     scripts/finalize-arcium-league-comp-defs.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const ARCIUM   = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE  = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

const COMP_DEF_OFFSET_INIT      = 283752962;
const COMP_DEF_OFFSET_INCREMENT = 4002611357;
const COMP_DEF_OFFSET_REVEAL    = 2652114814;

// Discriminators from Arcium IDL
const DISC_INIT_RAW_CIRCUIT_ACC = Buffer.from([16, 228, 193, 228, 93, 231, 58, 4]);
const DISC_FINALIZE_COMP_DEF    = Buffer.from([174, 66, 159, 51, 199, 243, 219, 38]);

function u32Le(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b;
}

function compDefPda(offset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), TERRACE.toBuffer(), u32Le(offset)],
    ARCIUM
  );
  return pda;
}

function rawCircuitPda(compDefAcc: PublicKey, chunkIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefAcc.toBuffer(), Buffer.from([chunkIndex])],
    ARCIUM
  );
  return pda;
}

// Encode init_raw_circuit_acc args: comp_offset (u32) + mxe_program (pubkey) + raw_circuit_index (u8)
function buildInitRawCircuitIx(
  signer: PublicKey,
  compDefOffset: number
): web3.TransactionInstruction {
  const compDef = compDefPda(compDefOffset);
  const compDefRaw = rawCircuitPda(compDef, 0);

  // Args: comp_offset: u32, mxe_program: pubkey, raw_circuit_index: u8
  const args = Buffer.concat([
    u32Le(compDefOffset),           // comp_offset
    TERRACE.toBuffer(),             // mxe_program
    Buffer.from([0]),               // raw_circuit_index = 0
  ]);

  return new web3.TransactionInstruction({
    programId: ARCIUM,
    keys: [
      { pubkey: signer,              isSigner: true,  isWritable: true  },
      { pubkey: compDef,             isSigner: false, isWritable: false },
      { pubkey: compDefRaw,          isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC_INIT_RAW_CIRCUIT_ACC, args]),
  });
}

// Encode finalize_computation_definition args: comp_offset (u32) + mxe_program (pubkey)
function buildFinalizeCompDefIx(
  signer: PublicKey,
  compDefOffset: number
): web3.TransactionInstruction {
  const compDef = compDefPda(compDefOffset);
  const compDefRaw = rawCircuitPda(compDef, 0);

  const args = Buffer.concat([
    u32Le(compDefOffset),
    TERRACE.toBuffer(),
  ]);

  return new web3.TransactionInstruction({
    programId: ARCIUM,
    keys: [
      { pubkey: signer,     isSigner: true,  isWritable: true  },
      { pubkey: compDef,    isSigner: false, isWritable: true  },
      { pubkey: compDefRaw, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC_FINALIZE_COMP_DEF, args]),
  });
}

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
    if (logs.some((l: string) => l.includes("already in use") || l.includes("already exists") || l.includes("already finalized"))) {
      console.log(`  ⚡ ${label} — already done, skipping`);
    } else {
      console.error(`  ✗ ${label} failed:`, err?.message ?? err);
      if (logs.length) console.error("  Logs:", logs.slice(-8).join("\n  "));
      throw err;
    }
  }
}

describe("finalize-arcium-league-comp-defs", () => {
  it("creates raw circuit accounts and finalizes all 3 league comp defs", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;

    console.log("\nWallet:", wallet.toBase58());
    console.log("\nComp def PDAs:");
    console.log("  init_member_score      :", compDefPda(COMP_DEF_OFFSET_INIT).toBase58());
    console.log("  increment_member_score :", compDefPda(COMP_DEF_OFFSET_INCREMENT).toBase58());
    console.log("  reveal_member_score    :", compDefPda(COMP_DEF_OFFSET_REVEAL).toBase58());

    const offsets = [
      { name: "init_member_score",      offset: COMP_DEF_OFFSET_INIT },
      { name: "increment_member_score", offset: COMP_DEF_OFFSET_INCREMENT },
      { name: "reveal_member_score",    offset: COMP_DEF_OFFSET_REVEAL },
    ];

    console.log("\n── Step 1: init_raw_circuit_acc (chunk 0) for each comp def ──────────────");
    for (const { name, offset } of offsets) {
      await sendIx(provider, `init_raw_circuit_acc [${name}]`, buildInitRawCircuitIx(wallet, offset));
    }

    console.log("\n── Step 2: finalize_computation_definition for each comp def ─────────────");
    for (const { name, offset } of offsets) {
      await sendIx(provider, `finalize_computation_definition [${name}]`, buildFinalizeCompDefIx(wallet, offset));
    }

    console.log("\n✅ All 3 league comp defs finalized. Ready for init_member_score.");
  });
});

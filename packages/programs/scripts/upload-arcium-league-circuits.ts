/**
 * Uploads real .arcis circuit bytes to the 3 league comp def raw circuit accounts.
 * The comp defs were previously finalized with empty content; this populates them
 * with the actual compiled circuit so Arcium ARX nodes can execute computations.
 *
 * Usage:
 *   cd packages/programs
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-mocha -p tsconfig.scripts.json -t 600000 \
 *     scripts/upload-arcium-league-circuits.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const ARCIUM  = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

const DISC_UPLOAD_CIRCUIT = Buffer.from([86, 238, 214, 111, 30, 23, 168, 100]);

const CHUNK_SIZE = 814;

const CIRCUITS = [
  { name: "init_member_score",      offset: 283752962,  file: "build/init_member_score.arcis" },
  { name: "increment_member_score", offset: 4002611357, file: "build/increment_member_score.arcis" },
  { name: "reveal_member_score",    offset: 2652114814, file: "build/reveal_member_score.arcis" },
];

function u32Le(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b;
}

function compDefPda(offset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), TERRACE.toBuffer(), u32Le(offset)], ARCIUM
  );
  return pda;
}

function rawCircuitPda(compDefAcc: PublicKey, chunkIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefAcc.toBuffer(), Buffer.from([chunkIndex])], ARCIUM
  );
  return pda;
}

async function uploadCircuit(
  provider: AnchorProvider,
  wallet: PublicKey,
  circuitName: string,
  compDefOffset: number,
  data: Buffer
): Promise<void> {
  const compDef    = compDefPda(compDefOffset);
  const compDefRaw = rawCircuitPda(compDef, 0);
  const chunks     = Math.ceil(data.length / CHUNK_SIZE);

  console.log(`  Uploading ${data.length} bytes in ${chunks} chunks to ${compDefRaw.toBase58()}`);

  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const slice = data.slice(start, Math.min(start + CHUNK_SIZE, data.length));

    const uploadData = Buffer.alloc(CHUNK_SIZE, 0);
    slice.copy(uploadData, 0);

    const args = Buffer.concat([
      u32Le(compDefOffset),
      TERRACE.toBuffer(),
      Buffer.from([0]),   // raw_circuit_index = 0
      uploadData,         // [u8; 814]
      u32Le(start),       // offset: u32
    ]);

    const ix = new web3.TransactionInstruction({
      programId: ARCIUM,
      keys: [
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: compDef,                 isSigner: false, isWritable: false },
        { pubkey: compDefRaw,              isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([DISC_UPLOAD_CIRCUIT, args]),
    });

    try {
      const tx  = new web3.Transaction().add(ix);
      await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
      if (i % 20 === 0 || i === chunks - 1) {
        process.stdout.write(`    chunk ${i + 1}/${chunks} ✓\n`);
      } else {
        process.stdout.write(".");
      }
    } catch (err: any) {
      console.error(`\n  ✗ chunk ${i + 1}/${chunks} at offset ${start} failed:`, err?.message ?? err);
      const logs: string[] = err?.logs ?? [];
      if (logs.length) console.error("  Logs:", logs.slice(-6).join("\n  "));
      throw err;
    }
  }
  console.log();
}

describe("upload-arcium-league-circuits", () => {
  it("uploads .arcis bytes to all 3 league comp def raw circuit accounts", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;

    console.log("\nWallet:", wallet.toBase58());

    for (const circuit of CIRCUITS) {
      const circuitPath = path.join(__dirname, "..", circuit.file);
      if (!fs.existsSync(circuitPath)) {
        throw new Error(`Circuit file not found: ${circuitPath}`);
      }

      const data = fs.readFileSync(circuitPath);
      console.log(`\n[${circuit.name}]`);
      console.log(`  File size : ${data.length} bytes`);
      console.log(`  CompDef   : ${compDefPda(circuit.offset).toBase58()}`);

      await uploadCircuit(provider, wallet, circuit.name, circuit.offset, data);
      console.log(`  ✅ ${circuit.name} uploaded`);
    }

    console.log("\n✅ All 3 league circuits uploaded. ARX nodes can now execute computations.");
  });
});

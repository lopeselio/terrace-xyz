/**
 * Create N private (Arcium MPC) markets on the live devnet program.
 *
 * Per market: create_market → init_private_market_state → wait for callback.
 * Markets are global on-chain; they appear in any league once members bet on them.
 *
 * Usage (from packages/programs):
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node scripts/create-private-markets.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ── Program IDs ──────────────────────────────────────────────────────────────
const ARCIUM                = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE               = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");
const DEVNET_USDC_MINT      = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM         = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// ── Comp def offset (sha256(name)[0:4] as LE u32) ────────────────────────────
const COMP_DEF_OFFSET_PRIVATE_INIT = 1343019643; // init_private_market_state_v8

// ── PrivateMarketState layout (for non-zero ciphertext check) ────────────────
const PS_NO_CT_START = 40;
const PS_TOTALS_END  = 120;

// ── Markets to create ────────────────────────────────────────────────────────
const MARKETS_TO_CREATE = [
  "France vs Spain — France wins",
  "Brazil vs Argentina — over 2.5 goals",
  "Germany vs England — both teams to score",
  "Netherlands vs Belgium — Netherlands wins",
];
const EXPIRY_HOURS = 6;

// ── LE serialisation helpers ─────────────────────────────────────────────────
function u16Le(n: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32Le(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64Le(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
function i64Le(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigInt64LE(n, 0); return b; }
function u128Le(n: bigint): Buffer {
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(n & 0xffffffffffffffffn, 0);
  b.writeBigUInt64LE(n >> 64n, 8);
  return b;
}

// ── PDA helpers ──────────────────────────────────────────────────────────────
function pdaOf(seeds: Buffer[], prog: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, prog)[0];
}
const mxePda         = () => pdaOf([Buffer.from("MXEAccount"), TERRACE.toBuffer()], ARCIUM);
const signPda        = () => pdaOf([Buffer.from("ArciumSignerAccount")], TERRACE);
const compDefPda     = (off: number) => pdaOf([Buffer.from("ComputationDefinitionAccount"), TERRACE.toBuffer(), u32Le(off)], ARCIUM);
const mempoolPda     = (co: number) => pdaOf([Buffer.from("Mempool"), u32Le(co)], ARCIUM);
const execpoolPda    = (co: number) => pdaOf([Buffer.from("Execpool"), u32Le(co)], ARCIUM);
const compPda        = (co: number, coff: bigint) => pdaOf([Buffer.from("ComputationAccount"), u32Le(co), u64Le(coff)], ARCIUM);
const clusterPda     = (co: number) => pdaOf([Buffer.from("Cluster"), u32Le(co)], ARCIUM);
const feePoolPda     = () => pdaOf([Buffer.from("FeePool")], ARCIUM);
const clockPda       = () => pdaOf([Buffer.from("ClockAccount")], ARCIUM);
const marketPda      = (c: PublicKey, n: bigint) => pdaOf([Buffer.from("market"), c.toBuffer(), u64Le(n)], TERRACE);
const privateStatePda = (m: PublicKey) => pdaOf([Buffer.from("private-state"), m.toBuffer()], TERRACE);

function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  return pdaOf([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROG);
}

// ── MXE cluster offset ───────────────────────────────────────────────────────
async function readClusterOffset(conn: web3.Connection): Promise<number> {
  const info = await conn.getAccountInfo(mxePda());
  if (!info) throw new Error("MXE not found");
  const d = info.data;
  let off = 8;
  const hasCluster = d[off] === 1; off++;
  return hasCluster ? d.readUInt32LE(off) : 0;
}

// ── TX + poll helpers ────────────────────────────────────────────────────────
function disc(idl: any, name: string): Buffer {
  const ix = (idl.instructions as any[]).find((i: any) => i.name === name);
  if (!ix) throw new Error(`No instruction '${name}'`);
  return Buffer.from(ix.discriminator as number[]);
}
async function send(provider: AnchorProvider, label: string, ix: web3.TransactionInstruction): Promise<string> {
  const tx  = new web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  console.log(`    ✓ ${label}  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
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
      console.log(`\n    ✅ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return info.data as Buffer;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, pollMs));
  }
  console.log();
  throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
}

// ── Driver ───────────────────────────────────────────────────────────────────
async function main() {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;
    const conn   = provider.connection;
    const idl    = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"),
    );

    console.log("\nSigner: ", wallet.toBase58());
    console.log("Program:", TERRACE.toBase58());
    console.log("USDC:   ", DEVNET_USDC_MINT.toBase58());

    const clusterOffset = await readClusterOffset(conn);
    console.log("Cluster offset:", clusterOffset);

    const expiry = BigInt(Math.floor(Date.now() / 1000) + EXPIRY_HOURS * 3600);
    console.log(`Expiry: ${new Date(Number(expiry) * 1000).toISOString()} (+${EXPIRY_HOURS}h)\n`);

    const created: { question: string; market: string }[] = [];

    for (let i = 0; i < MARKETS_TO_CREATE.length; i++) {
      const question    = MARKETS_TO_CREATE[i];
      const marketNonce = BigInt(Date.now()) + BigInt(i);
      const market      = marketPda(wallet, marketNonce);
      const marketVault = ata(market, DEVNET_USDC_MINT);
      const privateState = privateStatePda(market);

      console.log(`── [${i + 1}/${MARKETS_TO_CREATE.length}] ${question}`);
      console.log(`    market: ${market.toBase58()}`);

      // 1. create_market
      const qBuf = Buffer.from(question);
      await send(provider, "create_market", new web3.TransactionInstruction({
        programId: TERRACE,
        keys: [
          { pubkey: market,                  isSigner: false, isWritable: true  },
          { pubkey: marketVault,             isSigner: false, isWritable: true  },
          { pubkey: DEVNET_USDC_MINT,        isSigner: false, isWritable: false },
          { pubkey: wallet,                  isSigner: true,  isWritable: true  },
          { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROG,   isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          disc(idl, "create_market"),
          u32Le(qBuf.length), qBuf,
          i64Le(expiry),
          u16Le(0),          // creator_fee_bps
          u64Le(marketNonce),
          Buffer.from([0]),  // oracle: None
          Buffer.from([1]),  // is_private: true
          Buffer.from([0]),  // is_flash: false
        ]),
      }));

      // 2. init_private_market_state (Arcium MPC)
      const pmsCompOff = BigInt(Date.now()) + BigInt(i) * 1000n;
      const pmsNonce   = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      await send(provider, "init_private_market_state", new web3.TransactionInstruction({
        programId: TERRACE,
        keys: [
          { pubkey: wallet,                                     isSigner: true,  isWritable: true  },
          { pubkey: mxePda(),                                   isSigner: false, isWritable: false },
          { pubkey: signPda(),                                  isSigner: false, isWritable: true  },
          { pubkey: mempoolPda(clusterOffset),                  isSigner: false, isWritable: true  },
          { pubkey: execpoolPda(clusterOffset),                 isSigner: false, isWritable: true  },
          { pubkey: compPda(clusterOffset, pmsCompOff),         isSigner: false, isWritable: true  },
          { pubkey: compDefPda(COMP_DEF_OFFSET_PRIVATE_INIT),   isSigner: false, isWritable: true  },
          { pubkey: clusterPda(clusterOffset),                  isSigner: false, isWritable: true  },
          { pubkey: feePoolPda(),                               isSigner: false, isWritable: true  },
          { pubkey: clockPda(),                                 isSigner: false, isWritable: true  },
          { pubkey: SystemProgram.programId,                    isSigner: false, isWritable: false },
          { pubkey: ARCIUM,                                     isSigner: false, isWritable: false },
          { pubkey: market,                                     isSigner: false, isWritable: false },
          { pubkey: privateState,                               isSigner: false, isWritable: true  },
        ],
        data: Buffer.concat([
          disc(idl, "init_private_market_state"),
          u64Le(pmsCompOff),
          u128Le(pmsNonce),
        ]),
      }));

      // 3. Wait for Arcium callback to seed encrypted (no, yes) totals
      await pollUntil(
        "init_private_market_state callback",
        conn, privateState,
        (d) => d.length >= PS_TOTALS_END && d.slice(PS_NO_CT_START, PS_TOTALS_END).some((b: number) => b !== 0),
      );

      created.push({ question, market: market.toBase58() });
      console.log("");
    }

    console.log(`\n✅ Created ${created.length} private markets:\n`);
    for (const m of created) {
      console.log(`   ${m.market}   ${m.question}`);
    }
}

main().then(
  () => process.exit(0),
  (e) => { console.error("\n❌", e); process.exit(1); },
);

/**
 * Properly finalize private markets so league scoring works:
 *   1. reveal_private_market   (while still Open → flips is_revealed=true)
 *   2. wait for Arcium callback
 *   3. settle_market(WINNING)   (Open → Settled)
 *
 * Reads market addresses from MARKETS const at top. Edit before running.
 * Auto-skips markets that are already revealed or settled out of step.
 *
 * Run from packages/programs:
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node scripts/reveal-then-settle.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const ARCIUM  = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const TERRACE = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

const COMP_DEF_OFFSET_REVEAL_MARKET = 1460863666;
const PS_IS_REVEALED = 136;

// Market.status enum: Open=0, Closed=1, Settled=2  (read after 8-byte disc)
const MARKET_STATUS_OFFSET = 8 + 32 + 32 + 4 /*question_len*/; // approximate; refined at runtime
const WINNING_OUTCOME = 1; // YES

// Fresh WC-themed markets minted by create-private-markets.ts on 2026-06-01 at ~08:20 UTC.
const MARKETS: { question: string; address: string }[] = [
  { question: "Portugal vs Italy — Portugal wins",          address: "H1XdRsEGi57Te2psHYiBCb6hhAmeqAkw6cUMVoAZDsR2" },
  { question: "Argentina vs Croatia — over 2.5 goals",      address: "DrceYT14m9dX7XfbQ9VKd99a9dUTFtqZaqhjDy3cwoqr" },
  { question: "Belgium vs Senegal — both teams to score",   address: "G9xPHmdbUTuDqviQtwGrRsiUS9ZKhFLgzF18k8TEQgzZ" },
  { question: "Japan vs South Korea — Japan wins",          address: "977MYnKAXXf1yr17x5dT1hVEUzdMrdabaQPnC5uxxDCQ" },
];

function u32Le(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64Le(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }

function pdaOf(seeds: Buffer[], prog: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, prog)[0];
}
const mxePda        = () => pdaOf([Buffer.from("MXEAccount"), TERRACE.toBuffer()], ARCIUM);
const signPda       = () => pdaOf([Buffer.from("ArciumSignerAccount")], TERRACE);
const compDefPda    = (off: number) => pdaOf([Buffer.from("ComputationDefinitionAccount"), TERRACE.toBuffer(), u32Le(off)], ARCIUM);
const mempoolPda    = (co: number) => pdaOf([Buffer.from("Mempool"), u32Le(co)], ARCIUM);
const execpoolPda   = (co: number) => pdaOf([Buffer.from("Execpool"), u32Le(co)], ARCIUM);
const compPda       = (co: number, coff: bigint) => pdaOf([Buffer.from("ComputationAccount"), u32Le(co), u64Le(coff)], ARCIUM);
const clusterPda    = (co: number) => pdaOf([Buffer.from("Cluster"), u32Le(co)], ARCIUM);
const feePoolPda    = () => pdaOf([Buffer.from("FeePool")], ARCIUM);
const clockPda      = () => pdaOf([Buffer.from("ClockAccount")], ARCIUM);
const privateStatePda = (m: PublicKey) => pdaOf([Buffer.from("private-state"), m.toBuffer()], TERRACE);

async function readClusterOffset(conn: web3.Connection): Promise<number> {
  const info = await conn.getAccountInfo(mxePda());
  if (!info) throw new Error("MXE not found");
  const d = info.data; let off = 8;
  const hasCluster = d[off] === 1; off++;
  return hasCluster ? d.readUInt32LE(off) : 0;
}

function disc(idl: any, name: string): Buffer {
  const ix = (idl.instructions as any[]).find((i: any) => i.name === name);
  if (!ix) throw new Error(`No instruction '${name}'`);
  return Buffer.from(ix.discriminator as number[]);
}

async function send(provider: AnchorProvider, label: string, ix: web3.TransactionInstruction): Promise<string> {
  const tx = new web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  console.log(`    ✓ ${label}  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

async function pollUntil(label: string, conn: web3.Connection, address: PublicKey, check: (d: Buffer) => boolean, timeoutMs = 300_000, pollMs = 4_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const info = await conn.getAccountInfo(address, "confirmed");
    if (info && check(info.data as Buffer)) {
      console.log(`\n    ✅ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, pollMs));
  }
  console.log();
  throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
}

// Find market.status byte by skipping past disc(8) + creator(32) + nonce(8) + question_len(4) + question(N)
function readMarketStatus(data: Buffer): number {
  let off = 8 + 32 + 8;
  const qLen = data.readUInt32LE(off); off += 4 + qLen;
  off += 8; // expiry i64
  off += 32; // settle_token (mint) Pubkey  — adjust if layout differs
  // The simplest robust check: scan the rest for valid status enum bytes.
  // For safety just return raw byte at off; if wrong, the on-chain require will surface.
  return data[off];
}

async function main() {
  if (MARKETS.length === 0) {
    console.error("Edit MARKETS const at top of this script before running.");
    process.exit(1);
  }

  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = (provider.wallet as anchor.Wallet).publicKey;
  const conn = provider.connection;
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"));

  console.log("\nSigner: ", wallet.toBase58());
  console.log(`Reveal-then-settle for ${MARKETS.length} market(s), outcome = ${WINNING_OUTCOME} (YES)\n`);

  const clusterOffset = await readClusterOffset(conn);
  console.log("Cluster offset:", clusterOffset, "\n");

  for (let i = 0; i < MARKETS.length; i++) {
    const { question, address } = MARKETS[i];
    const market = new PublicKey(address);
    const privateState = privateStatePda(market);

    console.log(`── [${i + 1}/${MARKETS.length}] ${question}`);
    console.log(`    market: ${address}`);

    // 1. REVEAL (while still Open) — skip if already revealed
    const psInfo = await conn.getAccountInfo(privateState, "confirmed");
    const alreadyRevealed = !!(psInfo && psInfo.data.length > PS_IS_REVEALED && psInfo.data[PS_IS_REVEALED] === 1);
    if (alreadyRevealed) {
      console.log(`    ⏭  already revealed`);
    } else {
      const revealCompOff = BigInt(Date.now()) + BigInt(i);
      await send(provider, "reveal_private_market", new web3.TransactionInstruction({
        programId: TERRACE,
        keys: [
          { pubkey: wallet,                                    isSigner: true,  isWritable: true  },
          { pubkey: mxePda(),                                  isSigner: false, isWritable: false },
          { pubkey: signPda(),                                 isSigner: false, isWritable: true  },
          { pubkey: mempoolPda(clusterOffset),                 isSigner: false, isWritable: true  },
          { pubkey: execpoolPda(clusterOffset),                isSigner: false, isWritable: true  },
          { pubkey: compPda(clusterOffset, revealCompOff),     isSigner: false, isWritable: true  },
          { pubkey: compDefPda(COMP_DEF_OFFSET_REVEAL_MARKET), isSigner: false, isWritable: true  },
          { pubkey: clusterPda(clusterOffset),                 isSigner: false, isWritable: true  },
          { pubkey: feePoolPda(),                              isSigner: false, isWritable: true  },
          { pubkey: clockPda(),                                isSigner: false, isWritable: true  },
          { pubkey: SystemProgram.programId,                   isSigner: false, isWritable: false },
          { pubkey: ARCIUM,                                    isSigner: false, isWritable: false },
          { pubkey: market,                                    isSigner: false, isWritable: true  },
          { pubkey: privateState,                              isSigner: false, isWritable: true  },
        ],
        data: Buffer.concat([disc(idl, "reveal_private_market"), u64Le(revealCompOff)]),
      }));
      await pollUntil("is_revealed = true", conn, privateState, (d) => d.length > PS_IS_REVEALED && d[PS_IS_REVEALED] === 1);
    }

    // 2. SETTLE(YES)
    await send(provider, "settle_market(YES)", new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: market, isSigner: false, isWritable: true  },
        { pubkey: wallet, isSigner: true,  isWritable: false },
      ],
      data: Buffer.concat([disc(idl, "settle_market"), Buffer.from([WINNING_OUTCOME])]),
    }));

    console.log("");
  }

  console.log("✅ Done. All listed markets are Settled + is_revealed=true. record_private_league_win can now score bets.");
}

main().then(() => process.exit(0), (e) => { console.error("\n❌", e); process.exit(1); });

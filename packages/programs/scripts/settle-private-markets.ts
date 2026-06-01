/**
 * Settle the 3 private markets created by create-private-markets.ts.
 * Outcome = 1 (YES) for all. Creator-signed.
 *
 * Run from packages/programs:
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node scripts/settle-private-markets.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const TERRACE = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

// WC-themed markets created by create-private-markets.ts on 2026-06-01 at ~08:20 UTC.
const MARKETS: { question: string; address: string }[] = [
  { question: "France vs Spain — France wins",            address: "9YNEefdpirHFwQMfT4z77xDZkBjh4Fb4bReo1Hgok1hw" },
  { question: "Brazil vs Argentina — over 2.5 goals",     address: "4XHVnHnRJn5zMVZK61Dffz2e2FoxyhC7sMV5BeYg2PyY" },
  { question: "Germany vs England — both teams to score", address: "Fwnv9rmeLBb6C118RPjVJgN72itTPiWEZ3N4xZpZ6TT8" },
  { question: "Netherlands vs Belgium — Netherlands wins",address: "5sqUVHGHCDofSkEE1JpPx2jRrkEW8bSyPN1BmziSwCZ2" },
];
const WINNING_OUTCOME = 1; // YES

function disc(idl: any, name: string): Buffer {
  const ix = (idl.instructions as any[]).find((i: any) => i.name === name);
  if (!ix) throw new Error(`No instruction '${name}'`);
  return Buffer.from(ix.discriminator as number[]);
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = (provider.wallet as anchor.Wallet).publicKey;
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"),
  );

  console.log("\nSigner: ", wallet.toBase58());
  console.log(`Settling ${MARKETS.length} markets with outcome=${WINNING_OUTCOME} (YES)\n`);

  for (let i = 0; i < MARKETS.length; i++) {
    const { question, address } = MARKETS[i];
    const market = new PublicKey(address);
    console.log(`── [${i + 1}/${MARKETS.length}] ${question}`);
    console.log(`    market: ${address}`);

    const ix = new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: market, isSigner: false, isWritable: true  },
        { pubkey: wallet, isSigner: true,  isWritable: false },
      ],
      data: Buffer.concat([disc(idl, "settle_market"), Buffer.from([WINNING_OUTCOME])]),
    });

    try {
      const sig = await provider.sendAndConfirm(new web3.Transaction().add(ix), [], { commitment: "confirmed" });
      console.log(`    ✓ settled YES  https://explorer.solana.com/tx/${sig}?cluster=devnet\n`);
    } catch (e: any) {
      console.log(`    ✗ failed: ${e.message ?? e}\n`);
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error("\n❌", e); process.exit(1); },
);

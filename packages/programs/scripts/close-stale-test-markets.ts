/**
 * Discover + settle all stale "Who wins the private league matchup?" test
 * markets owned by the runner's wallet. Each match gets settle_market(YES).
 *
 * Run from packages/programs:
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<key> \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node scripts/close-stale-test-markets.ts
 *
 * Safe to re-run: skips anything not in Open status.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const TERRACE = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");
const MARKET_ACCOUNT_SIZE = 359;
// Case-insensitive substring match — catches variations like
// "Will Team A win?", "will team a win", etc.
const TARGET_QUESTION_SUBSTR = "team a win";
const WINNING_OUTCOME = 1; // YES

interface DiscoveredMarket {
  address: PublicKey;
  question: string;
  status: "Open" | "Closed" | "Settled";
  isPrivate: boolean;
}

function decodeMarket(data: Buffer): { question: string; creator: PublicKey; status: number; isPrivate: boolean } | null {
  if (data.length !== MARKET_ACCOUNT_SIZE) return null;
  let o = 8;
  const qLen = data.readUInt32LE(o); o += 4;
  if (qLen > 200) return null;
  const question = data.subarray(o, o + qLen).toString("utf8"); o += qLen;
  o += 8; // expiry
  const creator = new PublicKey(data.subarray(o, o + 32)); o += 32;
  // outcome (1 byte tag + maybe 1 byte value)
  const hasOutcome = data.readUInt8(o); o += 1;
  if (hasOutcome === 1) o += 1;
  o += 8 + 8 + 8; // volumes
  o += 32; // vault
  const status = data.readUInt8(o); o += 1;
  o += 2; // creator_fee_bps
  const hasOracle = data.readUInt8(o); o += 1;
  if (hasOracle === 1) o += 32;
  const isPrivate = data.readUInt8(o) === 1;
  return { question, creator, status, isPrivate };
}

function disc(idl: any, name: string): Buffer {
  const ix = (idl.instructions as any[]).find((i: any) => i.name === name);
  if (!ix) throw new Error(`No instruction '${name}'`);
  return Buffer.from(ix.discriminator as number[]);
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = (provider.wallet as anchor.Wallet).publicKey;
  const conn = provider.connection;
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/terrace.json"), "utf8"),
  );

  console.log("\nSigner: ", wallet.toBase58());
  console.log("Querying Terrace program for Market accounts…");

  const accounts = await conn.getProgramAccounts(TERRACE, {
    filters: [{ dataSize: MARKET_ACCOUNT_SIZE }],
  });
  console.log(`Got ${accounts.length} market accounts.\n`);

  const matches: DiscoveredMarket[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodeMarket(account.data as Buffer);
    if (!decoded) continue;
    if (!decoded.creator.equals(wallet)) continue;
    if (!decoded.question.toLowerCase().includes(TARGET_QUESTION_SUBSTR.toLowerCase())) continue;
    const statusStr = (["Open", "Closed", "Settled"] as const)[decoded.status] ?? "Open";
    matches.push({
      address: pubkey,
      question: decoded.question,
      status: statusStr,
      isPrivate: decoded.isPrivate,
    });
  }

  console.log(`Found ${matches.length} market(s) you created containing '${TARGET_QUESTION_SUBSTR}':\n`);
  for (const m of matches) {
    console.log(`  ${m.address.toBase58()}  [${m.status}]  ${m.isPrivate ? "PRIVATE" : "public"}  ${m.question}`);
  }
  console.log("");

  const toSettle = matches.filter((m) => m.status === "Open");
  if (toSettle.length === 0) {
    console.log("Nothing to settle (none are Open). Done.");
    return;
  }

  console.log(`Settling ${toSettle.length} markets with outcome=${WINNING_OUTCOME} (YES)…\n`);
  for (let i = 0; i < toSettle.length; i++) {
    const m = toSettle[i];
    console.log(`── [${i + 1}/${toSettle.length}] ${m.address.toBase58()}`);
    try {
      const ix = new web3.TransactionInstruction({
        programId: TERRACE,
        keys: [
          { pubkey: m.address, isSigner: false, isWritable: true  },
          { pubkey: wallet,    isSigner: true,  isWritable: false },
        ],
        data: Buffer.concat([disc(idl, "settle_market"), Buffer.from([WINNING_OUTCOME])]),
      });
      const sig = await provider.sendAndConfirm(new web3.Transaction().add(ix), [], { commitment: "confirmed" });
      console.log(`    ✓ settled YES  https://explorer.solana.com/tx/${sig}?cluster=devnet\n`);
    } catch (e: any) {
      // Private markets that haven't had reveal_private_market run will fail
      // here. We surface but don't throw — the rest still settle.
      console.log(`    ✗ failed: ${e.message ?? e}\n`);
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error("\n❌", e); process.exit(1); },
);

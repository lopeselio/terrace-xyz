/**
 * Settle the 3 parlay leg markets with winning_outcome=0 using the admin keypair.
 * Run: node scripts/settle-parlay-markets.mjs
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require(resolve(__dirname, "../packages/app/node_modules/@solana/web3.js/lib/index.cjs.js"));

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL = process.env.ANCHOR_PROVIDER_URL
  ?? (process.env.HELIUS_API_KEY
        ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : "https://api.devnet.solana.com");
const PROGRAM_ID = "8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF";

// 3 market addresses from the parlay legs (all stored with outcome=0)
const MARKETS = [
  "2nMuHHWanDZ5wgvu2p58hAkAqxf71DCgQ6XDhbQyjsRr",
  "2yhcj1wdYQdd4mxNpHaKL2gGwDj8ohFSGhhjVoj95N1A",
  "AnF9YCqMga7YVfJjddshkCXmD1qsFCLg1EMwNcG441ME",
];

const WINNING_OUTCOME = 0; // parlay legs stored outcome=0, so settle markets with 0

// settle_market discriminator: sha256("global:settle_market")[0..8]
const IX_SETTLE_MARKET = Buffer.from([193, 153, 95, 216, 166, 6, 144, 217]);

// ── Load admin keypair ────────────────────────────────────────────────────────
const keypairPath = `${homedir()}/.config/solana/id.json`;
const secretArray = JSON.parse(readFileSync(keypairPath, "utf-8"));
const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(secretArray));
console.log(`Admin wallet: ${adminKeypair.publicKey.toBase58()}`);

// ── RPC helper ────────────────────────────────────────────────────────────────
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

// Fetch and decode a market account to get its creator
const BASE58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s) {
  let n = 0n;
  for (const c of s) {
    const idx = BASE58_ALPHA.indexOf(c);
    if (idx < 0) throw new Error(`bad base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  const leading = s.match(/^1*/)[0].length;
  return new Uint8Array([...Array(leading).fill(0), ...bytes]);
}

function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) { s = BASE58_ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

async function getMarketCreator(marketAddress) {
  const result = await rpc("getAccountInfo", [
    marketAddress,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!result?.value) throw new Error(`Market account not found: ${marketAddress}`);
  const raw = Uint8Array.from(atob(result.value.data[0]), c => c.charCodeAt(0));
  // Layout after 8-byte discriminator:
  //   question: u32 + bytes  → variable
  //   expiry: i64 (8 bytes)
  //   creator: pubkey (32 bytes)
  let o = 8;
  const qLen = new DataView(raw.buffer).getUint32(o, true);
  o += 4 + qLen + 8; // skip question + expiry
  const creatorBytes = raw.slice(o, o + 32);
  return base58Encode(creatorBytes);
}

// ── Build settle_market instruction ──────────────────────────────────────────
function buildSettleIx(marketAddress, creatorAddress, winningOutcome) {
  const data = Buffer.concat([
    IX_SETTLE_MARKET,
    Buffer.from([winningOutcome]),
  ]);
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(marketAddress), isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(creatorAddress), isWritable: false, isSigner: true  },
    ],
    data,
  });
}

// ── Send a transaction ────────────────────────────────────────────────────────
async function sendAndConfirm(instruction, signers) {
  const { value: { blockhash } } = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);

  const message = new TransactionMessage({
    payerKey: adminKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign(signers);

  const base64Tx = Buffer.from(tx.serialize()).toString("base64");

  // Pre-simulate
  const sim = await rpc("simulateTransaction", [
    base64Tx,
    { encoding: "base64", commitment: "confirmed", sigVerify: false },
  ]);
  if (sim?.value?.err) {
    const logs = sim.value.logs ?? [];
    throw new Error(`Simulation failed:\n${logs.join("\n")}`);
  }

  const sig = await rpc("sendTransaction", [
    base64Tx,
    { encoding: "base64", preflightCommitment: "confirmed" },
  ]);
  return sig;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  for (const market of MARKETS) {
    process.stdout.write(`\nSettling market ${market}...\n`);

    let creator;
    try {
      creator = await getMarketCreator(market);
      console.log(`  creator: ${creator}`);
    } catch (e) {
      console.error(`  ERROR reading market: ${e.message}`);
      continue;
    }

    if (creator !== adminKeypair.publicKey.toBase58()) {
      console.error(`  SKIP — creator ${creator} != admin ${adminKeypair.publicKey.toBase58()}`);
      continue;
    }

    const ix = buildSettleIx(market, creator, WINNING_OUTCOME);

    try {
      const sig = await sendAndConfirm(ix, [adminKeypair]);
      console.log(`  ✓ settled! tx: ${sig}`);
    } catch (e) {
      console.error(`  ERROR settling: ${e.message}`);
    }
  }

  console.log("\nDone.");
})();

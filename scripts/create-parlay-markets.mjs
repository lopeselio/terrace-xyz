/**
 * Create 3 markets suitable for a parlay bet.
 * Run: node scripts/create-parlay-markets.mjs
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

const RPC_URL    = "https://devnet.helius-rpc.com/?api-key=06decfd9-b8df-4d35-854f-3e6584dad022";
const PROGRAM_ID = "8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF";
const USDC_MINT  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const IX_CREATE_MARKET = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);

const TOKEN_PROGRAM_ID       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID      = "11111111111111111111111111111111";

const keypairPath = `${homedir()}/.config/solana/id.json`;
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8")))
);
const ADMIN = adminKeypair.publicKey.toBase58();
console.log(`Admin: ${ADMIN}`);

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

function encodeU64LE(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n), 0);
  return buf;
}
function encodeI64LE(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n), 0);
  return buf;
}
function encodeU16LE(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n, 0);
  return buf;
}
function encodeString(s) {
  const bytes = new TextEncoder().encode(s);
  const buf = Buffer.alloc(4 + bytes.length);
  buf.writeUInt32LE(bytes.length, 0);
  buf.set(bytes, 4);
  return buf;
}

function deriveAta(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBytes(),
      new PublicKey(TOKEN_PROGRAM_ID).toBytes(),
      new PublicKey(mint).toBytes(),
    ],
    new PublicKey(ASSOC_TOKEN_PROGRAM_ID)
  );
  return ata.toBase58();
}

function findMarketPda(creator, nonce) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), new PublicKey(creator).toBytes(), encodeU64LE(nonce)],
    new PublicKey(PROGRAM_ID)
  );
  return pda.toBase58();
}

async function sendAndConfirm(instruction, label) {
  const { value: { blockhash } } = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const message = new TransactionMessage({
    payerKey: adminKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([adminKeypair]);
  const b64 = Buffer.from(tx.serialize()).toString("base64");

  const sim = await rpc("simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
  if (sim?.value?.err) {
    const logs = sim.value.logs ?? [];
    throw new Error(`Sim failed (${label}):\n${logs.join("\n")}`);
  }

  return rpc("sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
}

async function createMarket(question, expiryUnix) {
  const nonce = BigInt(Date.now());
  await new Promise(r => setTimeout(r, 10)); // ensure unique nonce
  const marketPubkey = findMarketPda(ADMIN, nonce);
  const vaultPubkey  = deriveAta(USDC_MINT, marketPubkey);

  const data = Buffer.concat([
    IX_CREATE_MARKET,
    encodeString(question),
    encodeI64LE(expiryUnix),
    encodeU16LE(0),       // creatorFeeBps
    encodeU64LE(nonce),
    Buffer.from([0]),     // oracle: None
    Buffer.from([0]),     // isPrivate: false
    Buffer.from([0]),     // isFlash: false
  ]);

  const ix = new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(marketPubkey),          isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(vaultPubkey),            isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(USDC_MINT),              isWritable: false, isSigner: false },
      { pubkey: adminKeypair.publicKey,                isWritable: true,  isSigner: true  },
      { pubkey: new PublicKey(TOKEN_PROGRAM_ID),       isWritable: false, isSigner: false },
      { pubkey: new PublicKey(ASSOC_TOKEN_PROGRAM_ID), isWritable: false, isSigner: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM_ID),      isWritable: false, isSigner: false },
    ],
    data,
  });

  const sig = await sendAndConfirm(ix, question.slice(0, 40));
  return { sig, marketPubkey, nonce: nonce.toString() };
}

// 3 parlay legs — Premier League / Champions League end-of-season markets
const in14Days = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;

const PARLAY_MARKETS = [
  {
    question: "Will Arsenal win the Premier League 2025/26?",
    expiry: in14Days,
  },
  {
    question: "Will Erling Haaland finish as Premier League top scorer 2025/26?",
    expiry: in14Days,
  },
  {
    question: "Will Real Madrid reach the Champions League final 2025/26?",
    expiry: in14Days,
  },
];

(async () => {
  console.log("\nCreating 3 parlay markets…\n");
  const results = [];

  for (const { question, expiry } of PARLAY_MARKETS) {
    process.stdout.write(`  "${question}"\n  → `);
    try {
      const { sig, marketPubkey } = await createMarket(question, expiry);
      console.log(`✓ market: ${marketPubkey}  tx: ${sig.slice(0, 16)}…\n`);
      results.push({ question, marketPubkey, sig });
    } catch (e) {
      console.error(`ERROR: ${e.message.slice(0, 200)}\n`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (results.length === 3) {
    console.log("━━━ Parlay legs ready ━━━");
    results.forEach((r, i) => {
      console.log(`Leg ${i + 1}: ${r.marketPubkey}`);
      console.log(`        "${r.question}"`);
    });
    console.log("\nPaste these market pubkeys into the parlay builder.");
  }
})();

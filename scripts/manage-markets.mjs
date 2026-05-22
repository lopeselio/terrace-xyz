/**
 * 1. List all open markets created by admin wallet
 * 2. Settle duplicates of the same question
 * 3. Create 2 new unique markets
 * Run: node scripts/manage-markets.mjs
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

const RPC_URL = process.env.ANCHOR_PROVIDER_URL
  ?? (process.env.HELIUS_API_KEY
        ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : "https://api.devnet.solana.com");
const PROGRAM_ID = "8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF";
const USDC_MINT  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MARKET_SIZE = 359;

// Discriminators
const IX_SETTLE_MARKET  = Buffer.from([193, 153, 95, 216, 166, 6, 144, 217]);
const IX_CREATE_MARKET  = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);

const TOKEN_PROGRAM_ID       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID      = "11111111111111111111111111111111";

const keypairPath = `${homedir()}/.config/solana/id.json`;
const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8"))));
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

// ── Base58 helpers ─────────────────────────────────────────────────────────
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

// ── Deserialise market account ─────────────────────────────────────────────
function deserializeMarket(raw, pubkey) {
  const v = new DataView(raw.buffer);
  let o = 8;
  const qLen = v.getUint32(o, true); o += 4;
  const question = new TextDecoder().decode(raw.slice(o, o + qLen)); o += qLen;
  const expiry = v.getBigInt64(o, true); o += 8;
  const creator = b58Encode(raw.slice(o, o + 32)); o += 32;
  const hasOutcome = v.getUint8(o) === 1; o += 1;
  const outcome = hasOutcome ? v.getUint8(o++) : null;
  o += 8 + 8 + 8 + 32; // skip volumes + vault
  const status = ["Open","Closed","Settled"][v.getUint8(o)]; o += 1;
  return { pubkey, question, expiry, creator, outcome, status };
}

// ── Fetch all program accounts of market size ──────────────────────────────
async function fetchAllMarkets() {
  const res = await rpc("getProgramAccounts", [
    PROGRAM_ID,
    { encoding: "base64", filters: [{ dataSize: MARKET_SIZE }] },
  ]);
  return (res ?? []).map(({ pubkey, account }) => {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), c => c.charCodeAt(0));
      return deserializeMarket(raw, pubkey);
    } catch { return null; }
  }).filter(Boolean);
}

// ── ATA derivation ─────────────────────────────────────────────────────────
function deriveAta(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBytes(),
      new PublicKey(TOKEN_PROGRAM_ID).toBytes(),
      new PublicKey(mint).toBytes(),
    ],
    new PublicKey(ASSOC_TOKEN_PROGRAM_ID),
  );
  return ata.toBase58();
}

// ── Market PDA ─────────────────────────────────────────────────────────────
function encodeU64LE(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n), 0);
  return buf;
}

function findMarketPda(creator, nonce) {
  const nonceLE = encodeU64LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), new PublicKey(creator).toBytes(), nonceLE],
    new PublicKey(PROGRAM_ID),
  );
  return pda.toBase58();
}

// ── Send helper ────────────────────────────────────────────────────────────
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

  // pre-sim
  const sim = await rpc("simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
  if (sim?.value?.err) {
    const logs = sim.value.logs ?? [];
    throw new Error(`Sim failed (${label}):\n${logs.join("\n")}`);
  }

  const sig = await rpc("sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
  return sig;
}

// ── Settle market ──────────────────────────────────────────────────────────
async function settleMarket(marketPubkey, creator, outcome) {
  const data = Buffer.concat([IX_SETTLE_MARKET, Buffer.from([outcome])]);
  const ix = new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(marketPubkey), isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(creator),      isWritable: false, isSigner: true  },
    ],
    data,
  });
  return sendAndConfirm(ix, `settle ${marketPubkey.slice(0,8)}`);
}

// ── Create market ──────────────────────────────────────────────────────────
function encodeString(s) {
  const bytes = new TextEncoder().encode(s);
  const buf = Buffer.alloc(4 + bytes.length);
  buf.writeUInt32LE(bytes.length, 0);
  buf.set(bytes, 4);
  return buf;
}
function encodeI64LE(n) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n), 0); return b; }
function encodeU16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }

async function createMarket(question, expiryUnix, isFlash = false) {
  const nonce = BigInt(Date.now());
  const marketPubkey = findMarketPda(ADMIN, nonce);
  const vaultPubkey = deriveAta(USDC_MINT, marketPubkey);

  const data = Buffer.concat([
    IX_CREATE_MARKET,
    encodeString(question),
    encodeI64LE(expiryUnix),
    encodeU16LE(0),           // creatorFeeBps
    encodeU64LE(nonce),
    Buffer.from([0]),         // oracle: None
    Buffer.from([0]),         // isPrivate: false
    Buffer.from([isFlash ? 1 : 0]),
  ]);

  const ix = new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(marketPubkey),        isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(vaultPubkey),          isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(USDC_MINT),            isWritable: false, isSigner: false },
      { pubkey: adminKeypair.publicKey,              isWritable: true,  isSigner: true  },
      { pubkey: new PublicKey(TOKEN_PROGRAM_ID),     isWritable: false, isSigner: false },
      { pubkey: new PublicKey(ASSOC_TOKEN_PROGRAM_ID), isWritable: false, isSigner: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM_ID),    isWritable: false, isSigner: false },
    ],
    data,
  });

  const sig = await sendAndConfirm(ix, `create "${question.slice(0,40)}"`);
  return { sig, marketPubkey, nonce };
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\nFetching all markets…");
  const markets = await fetchAllMarkets();

  console.log(`\nFound ${markets.length} market accounts total`);
  markets.filter(m => m.creator === ADMIN).forEach(m => {
    console.log(`  [${m.status}] ${m.pubkey.slice(0,8)}… "${m.question.slice(0,60)}" expiry=${new Date(Number(m.expiry)*1000).toISOString().slice(0,10)}`);
  });

  // Find duplicate open markets (same question, Open status, created by admin)
  const adminOpen = markets.filter(m => m.creator === ADMIN && m.status === "Open");
  const byQuestion = {};
  for (const m of adminOpen) {
    (byQuestion[m.question] = byQuestion[m.question] ?? []).push(m);
  }

  const toSettle = [];
  for (const [q, group] of Object.entries(byQuestion)) {
    if (group.length > 1) {
      console.log(`\nDuplicate: "${q.slice(0,60)}" — ${group.length} copies, settling ${group.length - 1}`);
      // Keep first, settle the rest
      toSettle.push(...group.slice(1));
    }
  }

  if (toSettle.length === 0) {
    console.log("\nNo duplicates found to settle.");
  }

  for (const m of toSettle) {
    process.stdout.write(`  Settling ${m.pubkey.slice(0,8)}… with outcome=0… `);
    try {
      const sig = await settleMarket(m.pubkey, m.creator, 0);
      console.log(`✓ ${sig.slice(0,12)}…`);
    } catch (e) {
      console.error(`ERROR: ${e.message.slice(0,120)}`);
    }
  }

  // Create 2 new unique markets (expire 7 days from now)
  const in7Days = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const in3Days = Math.floor(Date.now() / 1000) + 3 * 24 * 3600;

  const newMarkets = [
    { question: "Will Man City finish in the Top 4 of the 2025/26 Premier League?", expiry: in7Days },
    { question: "Will Liverpool win the Champions League 2025/26?", expiry: in3Days },
  ];

  console.log("\nCreating 2 new markets…");
  for (const { question, expiry } of newMarkets) {
    process.stdout.write(`  Creating "${question.slice(0,50)}…" `);
    try {
      const { sig, marketPubkey } = await createMarket(question, expiry);
      console.log(`✓ ${marketPubkey.slice(0,8)}… tx ${sig.slice(0,12)}…`);
    } catch (e) {
      console.error(`ERROR: ${e.message.slice(0,200)}`);
    }
    await new Promise(r => setTimeout(r, 800)); // avoid blockhash reuse
  }

  console.log("\nDone.");
})();

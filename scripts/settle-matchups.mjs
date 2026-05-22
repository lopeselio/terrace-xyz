/**
 * Settle all accepted matchups whose markets are (or can be) resolved.
 *
 * Steps:
 *  1. Fetch every matchup account with status=Accepted.
 *  2. For each matchup fetch its market account.
 *  3. If the market is Open and the admin keypair is the creator, settle it
 *     with outcome=1 (YES). Override with env OUTCOME=0 for NO.
 *  4. Wait for market settlement to be confirmed.
 *  5. Call settle_matchup (permissionless — admin just pays gas).
 *
 * Usage:
 *   node scripts/settle-matchups.mjs
 *   OUTCOME=0 node scripts/settle-matchups.mjs   # settle markets as NO
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const {
  Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} = require(resolve(__dirname, "../packages/app/node_modules/@solana/web3.js/lib/index.cjs.js"));

const RPC_URL = process.env.ANCHOR_PROVIDER_URL
  ?? (process.env.HELIUS_API_KEY
        ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : "https://api.devnet.solana.com");
const PROGRAM_ID     = "8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF";
const USDC_MINT      = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MATCHUP_SIZE   = 136;
const MARKET_OUTCOME = Number(process.env.OUTCOME ?? "1"); // 1=YES, 0=NO

const IX_SETTLE_MARKET  = Buffer.from([193, 153, 95, 216, 166,   6, 144, 217]);
const IX_SETTLE_MATCHUP = Buffer.from([ 54,  94,  80, 183,  80,  58, 209, 167]);

const TOKEN_PROGRAM_ID       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID      = "11111111111111111111111111111111";

const keypairPath  = `${homedir()}/.config/solana/id.json`;
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8")))
);
const ADMIN = adminKeypair.publicKey.toBase58();
console.log(`Admin wallet: ${ADMIN}`);

// ── RPC ────────────────────────────────────────────────────────────────────
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

async function confirmTx(sig, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: false }]);
    const s = res?.value?.[0];
    if (s && !s.err) {
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return;
    }
    if (s?.err) throw new Error(`Tx ${sig.slice(0,8)} failed on-chain: ${JSON.stringify(s.err)}`);
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Tx ${sig.slice(0,8)} timed out`);
}

async function sendAndConfirm(instruction, label) {
  const { value: { blockhash } } = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const msg = new TransactionMessage({
    payerKey: adminKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([adminKeypair]);
  const b64 = Buffer.from(tx.serialize()).toString("base64");

  const sim = await rpc("simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
  if (sim?.value?.err) {
    const logs = (sim.value.logs ?? []).join("\n");
    throw new Error(`Sim failed (${label}):\n${logs}`);
  }

  const sig = await rpc("sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
  process.stdout.write(` sent ${sig.slice(0,8)}… confirming…`);
  await confirmTx(sig);
  process.stdout.write(" ✓\n");
  return sig;
}

// ── Base58 ─────────────────────────────────────────────────────────────────
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

// ── ATA derivation ─────────────────────────────────────────────────────────
function deriveAta(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBytes(), new PublicKey(TOKEN_PROGRAM_ID).toBytes(), new PublicKey(mint).toBytes()],
    new PublicKey(ASSOC_TOKEN_PROGRAM_ID),
  );
  return ata.toBase58();
}

// ── Deserialize matchup ────────────────────────────────────────────────────
const MATCHUP_STATUS = ["Pending", "Accepted", "Settled", "Declined"];
function deserializeMatchup(raw, pubkey) {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let o = 8;
  const challenger = b58Encode(raw.slice(o, o + 32)); o += 32;
  const opponent   = b58Encode(raw.slice(o, o + 32)); o += 32;
  const market     = b58Encode(raw.slice(o, o + 32)); o += 32;
  const challengerOutcome = v.getUint8(o); o += 1;
  const stakeUsdc  = v.getBigUint64(o, true); o += 8;
  const status     = MATCHUP_STATUS[v.getUint8(o)] ?? "Unknown"; o += 1;
  const nonce      = v.getBigUint64(o, true); o += 8;
  const bump       = v.getUint8(o);
  return { pubkey, challenger, opponent, market, challengerOutcome, stakeUsdc, status, nonce, bump };
}

// ── Deserialize market (minimal — just status, outcome, creator) ───────────
function deserializeMarketMeta(raw) {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let o = 8;
  const qLen = v.getUint32(o, true); o += 4 + qLen; // skip question
  o += 8;                                             // skip expiry
  const creator = b58Encode(raw.slice(o, o + 32)); o += 32;
  const hasOutcome = v.getUint8(o) === 1; o += 1;
  const outcome = hasOutcome ? v.getUint8(o++) : null;
  o += 8 + 8 + 8 + 32; // skip yes/no volume + vault
  const status = ["Open", "Closed", "Settled"][v.getUint8(o)] ?? "Unknown";
  return { creator, outcome, status };
}

async function fetchAccountData(address) {
  const res = await rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  if (!res?.value) return null;
  return Uint8Array.from(atob(res.value.data[0]), c => c.charCodeAt(0));
}

// ── Fetch all accepted matchups ────────────────────────────────────────────
async function fetchAcceptedMatchups() {
  const res = await rpc("getProgramAccounts", [
    PROGRAM_ID,
    {
      encoding: "base64",
      commitment: "confirmed",
      filters: [{ dataSize: MATCHUP_SIZE }],
    },
  ]);
  const all = (res ?? []).map(({ pubkey, account }) => {
    try {
      const raw = Uint8Array.from(atob(account.data[0]), c => c.charCodeAt(0));
      return deserializeMatchup(raw, pubkey);
    } catch { return null; }
  }).filter(Boolean);

  console.log(`  (${all.length} total matchup accounts found on-chain)`);
  all.forEach(m => console.log(`    ${m.pubkey.slice(0,8)}… status=${m.status} market=${m.market.slice(0,8)}…`));

  return all.filter(m => m.status === "Accepted");
}

// ── Settle market instruction ──────────────────────────────────────────────
function buildSettleMarketIx(marketPubkey, creatorPubkey, outcome) {
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(marketPubkey), isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(creatorPubkey), isWritable: false, isSigner: true  },
    ],
    data: Buffer.concat([IX_SETTLE_MARKET, Buffer.from([outcome])]),
  });
}

// ── Settle matchup instruction ─────────────────────────────────────────────
function buildSettleMatchupIx(matchup) {
  const matchupVault  = deriveAta(USDC_MINT, matchup.pubkey);
  const challengerAta = deriveAta(USDC_MINT, matchup.challenger);
  const opponentAta   = deriveAta(USDC_MINT, matchup.opponent);

  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(matchup.pubkey),     isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(matchup.market),     isWritable: false, isSigner: false },
      { pubkey: new PublicKey(matchupVault),        isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(challengerAta),       isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(opponentAta),         isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(matchup.challenger),  isWritable: false, isSigner: false },
      { pubkey: new PublicKey(matchup.opponent),    isWritable: false, isSigner: false },
      { pubkey: new PublicKey(USDC_MINT),           isWritable: false, isSigner: false },
      { pubkey: new PublicKey(TOKEN_PROGRAM_ID),    isWritable: false, isSigner: false },
      { pubkey: new PublicKey(ASSOC_TOKEN_PROGRAM_ID), isWritable: false, isSigner: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM_ID),   isWritable: false, isSigner: false },
    ],
    data: Buffer.from(IX_SETTLE_MATCHUP),
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\nFetching accepted matchups…");
  const matchups = await fetchAcceptedMatchups();

  if (matchups.length === 0) {
    console.log("No accepted matchups found.");
    return;
  }

  console.log(`Found ${matchups.length} accepted matchup(s):\n`);
  for (const m of matchups) {
    console.log(`  ${m.pubkey.slice(0,8)}… | market ${m.market.slice(0,8)}… | stake $${(Number(m.stakeUsdc)/1e6).toFixed(2)}`);
    console.log(`    challenger ${m.challenger.slice(0,8)}… (outcome ${m.challengerOutcome === 1 ? "YES" : "NO"})`);
    console.log(`    opponent   ${m.opponent.slice(0,8)}…`);
  }

  for (const matchup of matchups) {
    console.log(`\n── Matchup ${matchup.pubkey.slice(0,8)}… ──`);

    // 1. Fetch market
    const marketData = await fetchAccountData(matchup.market);
    if (!marketData) {
      console.log(`  ✗ Market ${matchup.market.slice(0,8)}… not found on-chain — skipping`);
      continue;
    }

    const market = deserializeMarketMeta(marketData);
    console.log(`  Market ${matchup.market.slice(0,8)}… status=${market.status} creator=${market.creator.slice(0,8)}…`);

    // 2. Settle market if still Open
    if (market.status === "Open") {
      if (market.creator !== ADMIN) {
        console.log(`  ✗ Market is Open but creator is not admin — cannot settle from this keypair`);
        continue;
      }
      const outcomeLabel = MARKET_OUTCOME === 1 ? "YES" : "NO";
      process.stdout.write(`  Settling market as ${outcomeLabel}…`);
      try {
        await sendAndConfirm(buildSettleMarketIx(matchup.market, ADMIN, MARKET_OUTCOME), "settle_market");
      } catch (e) {
        console.log(`\n  ✗ settle_market failed: ${e.message.slice(0, 200)}`);
        continue;
      }
    } else if (market.status !== "Settled") {
      console.log(`  ✗ Market status is "${market.status}" — cannot settle matchup`);
      continue;
    } else {
      console.log(`  Market already settled (outcome=${market.outcome === 1 ? "YES" : "NO"})`);
    }

    // 3. Settle matchup
    process.stdout.write(`  Settling matchup…`);
    try {
      await sendAndConfirm(buildSettleMatchupIx(matchup), "settle_matchup");
    } catch (e) {
      console.log(`\n  ✗ settle_matchup failed: ${e.message.slice(0, 200)}`);
    }
  }

  console.log("\nDone.");
})();

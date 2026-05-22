/**
 * Transfer devnet USDC from admin wallet to any wallet.
 * Run: node scripts/fund-wallet-usdc.mjs <recipient-pubkey> [amount-in-usdc]
 * Example: node scripts/fund-wallet-usdc.mjs AbC...xyz 10
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
const USDC_MINT          = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TOKEN_PROGRAM_ID   = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_PROGRAM_ID   = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID  = "11111111111111111111111111111111";

const recipient = process.argv[2];
const amountUsdc = parseFloat(process.argv[3] ?? "10");

if (!recipient) {
  console.error("Usage: node fund-wallet-usdc.mjs <recipient-pubkey> [amount]");
  process.exit(1);
}

const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf-8")))
);
const ADMIN = adminKeypair.publicKey.toBase58();
console.log(`Admin:     ${ADMIN}`);
console.log(`Recipient: ${recipient}`);
console.log(`Amount:    ${amountUsdc} USDC\n`);

function deriveAta(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBytes(), new PublicKey(TOKEN_PROGRAM_ID).toBytes(), new PublicKey(mint).toBytes()],
    new PublicKey(ASSOC_PROGRAM_ID)
  );
  return ata.toBase58();
}

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

async function sendAndConfirm(instructions) {
  const { value: { blockhash } } = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const message = new TransactionMessage({
    payerKey: adminKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([adminKeypair]);
  const b64 = Buffer.from(tx.serialize()).toString("base64");

  const sim = await rpc("simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
  if (sim?.value?.err) throw new Error(`Sim failed:\n${(sim.value.logs ?? []).join("\n")}`);

  return rpc("sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
}

(async () => {
  const adminAta     = deriveAta(USDC_MINT, ADMIN);
  const recipientAta = deriveAta(USDC_MINT, recipient);
  console.log(`Admin ATA:     ${adminAta}`);
  console.log(`Recipient ATA: ${recipientAta}\n`);

  // Create recipient ATA (idempotent) + transfer in one tx
  const createAtaIx = new TransactionInstruction({
    programId: new PublicKey(ASSOC_PROGRAM_ID),
    keys: [
      { pubkey: adminKeypair.publicKey,         isWritable: true,  isSigner: true  },
      { pubkey: new PublicKey(recipientAta),    isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(recipient),       isWritable: false, isSigner: false },
      { pubkey: new PublicKey(USDC_MINT),       isWritable: false, isSigner: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM_ID), isWritable: false, isSigner: false },
      { pubkey: new PublicKey(TOKEN_PROGRAM_ID), isWritable: false, isSigner: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  });

  const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000));
  const transferData = Buffer.alloc(9);
  transferData[0] = 3; // SPL transfer discriminator
  transferData.writeBigUInt64LE(amountRaw, 1);

  const transferIx = new TransactionInstruction({
    programId: new PublicKey(TOKEN_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(adminAta),     isWritable: true,  isSigner: false },
      { pubkey: new PublicKey(recipientAta), isWritable: true,  isSigner: false },
      { pubkey: adminKeypair.publicKey,      isWritable: false, isSigner: true  },
    ],
    data: transferData,
  });

  process.stdout.write(`Sending ${amountUsdc} USDC to ${recipient}… `);
  const sig = await sendAndConfirm([createAtaIx, transferIx]);
  console.log(`✓\nTx: ${sig}`);
})();

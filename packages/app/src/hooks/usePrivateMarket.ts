import { useState, useCallback } from "react";
import { Buffer } from "buffer";
import * as SecureStore from "expo-secure-store";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Address } from "@solana/kit";
import {
  getPrivateStatePda,
  getPrivateBetRecordPda,
  getArciumMxePda,
  getArciumSignPda,
  getArciumCompDefPda,
  getArciumMempoolPda,
  getArciumExecpoolPda,
  getArciumComputationPda,
  getArciumClusterPda,
  getArciumFeePoolPda,
  getArciumClockPda,
  COMP_DEF_OFFSET_PLACE_PRIVATE_BET,
  COMP_DEF_OFFSET_REVEAL_PRIVATE_MARKET,
  TERRACE_PROGRAM_ID,
  buildPlacePrivateBetEncryptedInstruction,
  buildRevealPrivateMarketInstruction,
  buildClaimPrivateWinningsInstruction,
} from "@terrace/sdk";
import { useWallet } from "./useWallet";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";

// ── Encryption helpers ────────────────────────────────────────────────────────
//
// ⚠️ KNOWN-BROKEN cipher (XOR + SHA256). arcis 0.9.x's `Enc<Shared, T>` actually
// needs RescueCipher over BN254 from @arcium-hq/client — the e2e + SDK use it
// correctly. We tried to use it in the app too, but bundling @arcium-hq/client
// into React Native pulled in @coral-xyz/anchor + Node's `crypto`, `fs`, and
// other stdlib modules. The bundle compiled with shims but threw at module
// eval ("Cannot read property 'n' of undefined"). See the session log for the
// debug trail.
//
// For now the app's `place_private_bet` flow uses this hand-rolled XOR scheme
// so the build is green. New bets placed from the app will be silently scored
// as zero by the chained MPC (the sealed outcome decodes to garbage). The
// `record_private_league_win` flow — scoring bets that were already sealed
// on-chain (e.g. via the e2e script) — works fine because that path doesn't
// touch the client-side cipher.
//
// TODO: port the RescueCipher math from @arcium-hq/client/src/cryptography/
// into a self-contained packages/app/src/lib/rescueCipher.ts (no anchor /
// no Node deps), or wire react-native-quick-crypto + rebuild the dev client.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sha256 } = require("@noble/hashes/sha2") as { sha256: (data: Uint8Array) => Uint8Array };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { x25519 } = require("@noble/curves/ed25519") as {
  x25519: {
    utils: { randomPrivateKey: () => Uint8Array };
    getPublicKey: (priv: Uint8Array) => Uint8Array;
    getSharedSecret: (priv: Uint8Array, pub: Uint8Array) => Uint8Array;
  };
};

function deriveFieldKey(shared: Uint8Array, idx: number): Uint8Array {
  const pre = new Uint8Array(shared.length + 1);
  pre.set(shared);
  pre[shared.length] = idx;
  return sha256(pre);
}
function xor32(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = a[i] ^ b[i];
  return out;
}
function padU8To32(v: number): Uint8Array {
  const out = new Uint8Array(32); out[0] = v; return out;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { blake3 } = require("@noble/hashes/blake3") as { blake3: (data: Uint8Array) => Uint8Array };

function computeOutcomeCommitment(outcome: 0 | 1, secret: Uint8Array): Uint8Array {
  // blake3(outcome_byte || secret_32_bytes) — must match on-chain commitment check
  const pre = new Uint8Array(1 + 32);
  pre[0] = outcome;
  pre.set(secret.slice(0, 32), 1);
  return blake3(pre);
}

// ── Transaction helpers ───────────────────────────────────────────────────────

function toWeb3Ix(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a: any) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

async function fetchBlockhash(): Promise<string> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }],
    }),
  });
  const { result: { value: { blockhash } } } = await res.json();
  return blockhash;
}

async function sendRaw(signedBase64: string): Promise<string> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: [signedBase64, { encoding: "base64", preflightCommitment: "confirmed" }],
    }),
  });
  const { result, error: rpcErr } = await res.json();
  if (rpcErr) throw new Error(`RPC error: ${rpcErr.message}`);
  return result as string;
}

async function buildAndSend(
  payer: string,
  instructions: any[],
  signTransaction: (b64: string) => Promise<string>
): Promise<string> {
  const blockhash = await fetchBlockhash();
  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: blockhash,
    instructions: instructions.map(toWeb3Ix),
  }).compileToV0Message();
  const vt = new VersionedTransaction(message);
  const base64Tx = Buffer.from(vt.serialize()).toString("base64");
  const signed = await signTransaction(base64Tx);
  return sendRaw(signed);
}

// ── MXE account parsing ───────────────────────────────────────────────────────

async function fetchMxeData(mxeAccount: Address): Promise<{
  clusterOffset: number;
  x25519Pubkey: Uint8Array;
}> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getAccountInfo",
      params: [mxeAccount, { encoding: "base64" }],
    }),
  });
  const { result } = await res.json();
  if (!result?.value) throw new Error("Private features aren't available right now — please try again later.");

  const raw = new Uint8Array(Buffer.from(result.value.data[0], "base64"));
  const view = new DataView(raw.buffer, raw.byteOffset);

  // MXEAccount layout (after 8-byte discriminator):
  //   cluster: Option<u32>  → 1 byte Some/None + 4 bytes if Some
  const hasCluster = raw[8] === 1;
  const clusterOffset = hasCluster ? view.getUint32(9, true) : 0;

  // utility_pubkeys comes after:
  //   discrim(8) + cluster(5) + keygen_offset(8) + key_recovery_init_offset(8)
  //   + mxe_program_id(32) + authority Option<Pubkey>(1+32)  = 94
  // SetUnset<UtilityPubkeys>: 1 byte tag; if Some → x25519 pubkey at [95..127]
  const utilStart = 94;
  if (raw[utilStart] !== 1) throw new Error("Private features aren't fully set up — please try again later.");
  const x25519Pubkey = raw.slice(utilStart + 1, utilStart + 33);

  return { clusterOffset, x25519Pubkey };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type PrivateBetStatus = "idle" | "building" | "signing" | "executing" | "success" | "error";

export function usePrivateMarket() {
  const [status, setStatus] = useState<PrivateBetStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const { publicKey, signTransaction } = useWallet();

  const placeBet = useCallback(
    async (params: {
      market: Address;
      outcome: 0 | 1;
      amount: bigint;
      usdcMint: Address;
      programId?: Address;
    }) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
      const programId = params.programId ?? TERRACE_PROGRAM_ID;
      setStatus("building");
      setError(null);
      setTxSig(null);

      try {
        const bettor = publicKey as Address;
        const [privateState]    = await getPrivateStatePda(params.market, programId);
        const [privateBetRecord] = await getPrivateBetRecordPda(params.market, bettor, programId);

        const mxeAccount  = await getArciumMxePda(programId);
        const signPda     = await getArciumSignPda(programId);
        const compDefAddr = await getArciumCompDefPda(COMP_DEF_OFFSET_PLACE_PRIVATE_BET, programId);
        const poolAccount  = await getArciumFeePoolPda();
        const clockAccount = await getArciumClockPda();

        const { clusterOffset, x25519Pubkey } = await fetchMxeData(mxeAccount);
        const mempoolAccount    = await getArciumMempoolPda(clusterOffset);
        const executingPool     = await getArciumExecpoolPda(clusterOffset);
        const clusterAccount    = await getArciumClusterPda(clusterOffset);
        const computationOffset = BigInt(Date.now());
        const computationAccount = await getArciumComputationPda(clusterOffset, computationOffset);

        // X25519 ECDH → RescueCipher encrypt the outcome as Enc<Shared, u64>.
        // Amount is plaintext — it's already publicly observable from the USDC
        // settlement transfer, so encrypting it inside the MPC adds no privacy.
        const clientPriv   = x25519.utils.randomPrivateKey();
        const clientPub    = x25519.getPublicKey(clientPriv);
        const sharedSecret = x25519.getSharedSecret(clientPriv, x25519Pubkey);
        const betNonce     = BigInt(Date.now()) ^ (BigInt(Math.random() * 0xFFFFFFFF | 0) << 32n);
        const cipher       = new RescueCipher(sharedSecret);
        const ctBlocks     = cipher.encrypt([BigInt(params.outcome)], nonceToBytes16(betNonce));
        const outcomeCt    = new Uint8Array(ctBlocks[0]);

        const secret = new Uint8Array(32);
        crypto.getRandomValues(secret);
        const outcomeCommitment = computeOutcomeCommitment(params.outcome, secret);

        // Persist secret + bettor outcome so claim can reproduce the blake3 commitment
        await SecureStore.setItemAsync(
          `terrace:bet_secret:${privateBetRecord}`,
          JSON.stringify({ secret: Buffer.from(secret).toString("hex"), outcome: params.outcome })
        );

        const ix = await buildPlacePrivateBetEncryptedInstruction({
          computationOffset,
          outcomeCt,
          encryptionPubkey: clientPub,
          betNonce,
          amount: params.amount,
          outcomeCommitment,
          bettor,
          mxeAccount,
          signPdaAccount: signPda,
          mempoolAccount,
          executingPool,
          computationAccount,
          compDefAccount: compDefAddr,
          clusterAccount,
          poolAccount,
          clockAccount,
          market: params.market,
          privateState,
          privateBetRecord,
          usdcMint: params.usdcMint,
          programId,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        setTxSig(sig);
        setStatus("success");
        return { sig, secret, privateBetRecord };
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction]
  );

  const revealMarket = useCallback(
    async (params: {
      market: Address;
      computationOffset?: bigint;
      programId?: Address;
    }) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
      const programId = params.programId ?? TERRACE_PROGRAM_ID;
      setStatus("building");
      setError(null);

      try {
        const creator      = publicKey as Address;
        const [privateState] = await getPrivateStatePda(params.market, programId);
        const mxeAccount   = await getArciumMxePda(programId);
        const signPda      = await getArciumSignPda(programId);
        const compDefAddr  = await getArciumCompDefPda(COMP_DEF_OFFSET_REVEAL_PRIVATE_MARKET, programId);
        const poolAccount   = await getArciumFeePoolPda();
        const clockAccount  = await getArciumClockPda();

        const { clusterOffset } = await fetchMxeData(mxeAccount);
        const mempoolAccount     = await getArciumMempoolPda(clusterOffset);
        const executingPool      = await getArciumExecpoolPda(clusterOffset);
        const clusterAccount     = await getArciumClusterPda(clusterOffset);
        const computationOffset  = params.computationOffset ?? BigInt(Date.now());
        const computationAccount = await getArciumComputationPda(clusterOffset, computationOffset);

        const ix = buildRevealPrivateMarketInstruction({
          computationOffset,
          creator,
          mxeAccount,
          signPdaAccount: signPda,
          mempoolAccount,
          executingPool,
          computationAccount,
          compDefAccount: compDefAddr,
          clusterAccount,
          poolAccount,
          clockAccount,
          market: params.market,
          privateState,
          programId,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        setTxSig(sig);
        setStatus("success");
        return sig;
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction]
  );

  const claimWinnings = useCallback(
    async (params: {
      market: Address;
      creator: Address;
      usdcMint: Address;
      programId?: Address;
    }) => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
      const programId = params.programId ?? TERRACE_PROGRAM_ID;
      setStatus("building");
      setError(null);

      try {
        const bettor         = publicKey as Address;
        const [privateState]  = await getPrivateStatePda(params.market, programId);
        const [privateBetRecord] = await getPrivateBetRecordPda(params.market, bettor, programId);

        const stored = await SecureStore.getItemAsync(`terrace:bet_secret:${privateBetRecord}`);
        if (!stored) throw new Error("Bet secret not found — cannot claim");
        const parsed = JSON.parse(stored) as { secret: string; outcome: 0 | 1 };
        const secret = new Uint8Array(Buffer.from(parsed.secret, "hex"));

        const ix = await buildClaimPrivateWinningsInstruction({
          outcome: parsed.outcome,
          secret,
          market: params.market,
          privateState,
          privateBetRecord,
          creator: params.creator,
          usdcMint: params.usdcMint,
          bettor,
          programId,
        });

        setStatus("signing");
        const sig = await buildAndSend(publicKey, [ix], signTransaction);
        await SecureStore.deleteItemAsync(`terrace:bet_secret:${privateBetRecord}`);
        setTxSig(sig);
        setStatus("success");
        return sig;
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setStatus("error");
        throw e;
      }
    },
    [publicKey, signTransaction]
  );

  return { placeBet, revealMarket, claimWinnings, status, error, txSig };
}

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

// ── Encryption helpers (X25519 + RescueCipher over BN254) ─────────────────────
//
// Arcium's arcis runtime expects `Enc<Shared, T>` inputs to be encrypted with
// RescueCipher in CTR mode keyed by the X25519 shared secret with the MXE's
// x25519 pubkey. Each plaintext value is encoded as a 32-byte BN254 field
// element. A hand-rolled XOR+SHA256 scheme produces 32-byte blobs that
// arcis rejects at input deserialization with "Failed to convert bytes to
// field element" — see fix(e2e) commit for the original incident.
//
// Commitment: blake3(outcome_byte || secret_32_bytes) stored on-chain;
// bettor reveals (outcome, secret) in claim_private_winnings.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { x25519 } = require("@noble/curves/ed25519") as {
  x25519: {
    utils: { randomPrivateKey: () => Uint8Array };
    getPublicKey: (priv: Uint8Array) => Uint8Array;
    getSharedSecret: (priv: Uint8Array, pub: Uint8Array) => Uint8Array;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RescueCipher } = require("@arcium-hq/client") as {
  RescueCipher: new (sharedSecret: Uint8Array) => {
    encrypt: (plaintext: bigint[], nonce: Uint8Array) => number[][];
  };
};

function nonceToBytes16(n: bigint): Uint8Array {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, n & 0xFFFFFFFFFFFFFFFFn, true);
  dv.setBigUint64(8, (n >> 64n) & 0xFFFFFFFFFFFFFFFFn, true);
  return out;
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
  if (!result?.value) throw new Error("MXE account not found — run init_mxe first");

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
  if (raw[utilStart] !== 1) throw new Error("MXE utility keys not initialised");
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

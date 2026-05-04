import { Buffer } from "buffer";
import {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
  FullySignedTransaction,
  TransactionWithBlockhashLifetime,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from "@solana/kit";
import type { CreateMarketParams, PlaceBetParams, SettleMarketParams, Market, MarketStatus } from "./types";
import { getMarketPda, getBetPda, TERRACE_PROGRAM_ID } from "./pda";
import { buildCreateMarketInstruction, buildPlaceBetInstruction, buildSettleMarketInstruction } from "./instructions";

// Minimal base58 encoder — used to convert raw Pubkey bytes to Address strings.
// Keeps the deserializer dependency-free (no @solana/addresses import uncertainty).
function pubkeyBytesToAddress(bytes: Uint8Array): Address {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s as Address;
}

/**
 * Deserialises a raw Market account buffer (Anchor borsh layout) into a typed Market.
 * Exported so the useMarkets hook can use it without instantiating TerraceSdk.
 *
 * Layout (after 8-byte discriminator):
 *   question  — u32 LE length prefix + UTF-8 bytes
 *   expiry    — i64 LE
 *   creator   — 32-byte Pubkey
 *   outcome   — u8 tag (0=None, 1=Some) + u8 value if Some
 *   total_volume — u64 LE
 *   vault     — 32-byte Pubkey
 *   status    — u8 enum (0=Open, 1=Closed, 2=Settled)
 *   nonce     — u64 LE
 *   bump      — u8
 */
export function deserializeMarketAccount(data: Uint8Array, address: Address): Market {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip 8-byte discriminator

  const qLen = view.getUint32(o, true);
  o += 4;
  const question = new TextDecoder().decode(data.slice(o, o + qLen));
  o += qLen;

  const expiry = view.getBigInt64(o, true);
  o += 8;

  const creator = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const hasOutcome = view.getUint8(o) === 1;
  o += 1;
  let outcome: number | null = null;
  if (hasOutcome) {
    outcome = view.getUint8(o);
    o += 1;
  }

  const totalVolume = view.getBigUint64(o, true);
  o += 8;

  const vault = pubkeyBytesToAddress(data.slice(o, o + 32));
  o += 32;

  const statusByte = view.getUint8(o);
  o += 1;
  const STATUS_MAP: MarketStatus[] = ["Open", "Closed", "Settled"];
  const status: MarketStatus = STATUS_MAP[statusByte] ?? "Open";

  const nonce = view.getBigUint64(o, true);
  o += 8;

  const bump = view.getUint8(o);

  return { address, question, expiry, creator, outcome, totalVolume, vault, status, nonce, bump };
}

export class TerraceSdk {
  constructor(
    private readonly rpc: Rpc<SolanaRpcApi>,
    private readonly signer: TransactionSigner,
    private readonly programId: Address = TERRACE_PROGRAM_ID
  ) {}

  async createMarket(params: CreateMarketParams): Promise<string> {
    const [marketAddress] = await getMarketPda(
      this.signer.address,
      params.nonce,
      this.programId
    );

    const ix = await buildCreateMarketInstruction({
      ...params,
      marketAddress,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async placeBet(params: PlaceBetParams): Promise<string> {
    const [betAddress] = await getBetPda(
      params.market,
      this.signer.address,
      this.programId
    );

    const ix = await buildPlaceBetInstruction({
      ...params,
      betAddress,
      bettor: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async settleMarket(params: SettleMarketParams): Promise<string> {
    const ix = buildSettleMarketInstruction({
      ...params,
      creator: this.signer.address,
      programId: this.programId,
    });

    return this._sendTx([ix]);
  }

  async fetchMarket(address: Address): Promise<Market> {
    const accountInfo = await this.rpc
      .getAccountInfo(address, { encoding: "base64" })
      .send();

    if (!accountInfo.value) throw new Error(`Market not found: ${address}`);

    const [b64] = accountInfo.value.data as [string, string];
    // Buffer.from works in both Node (tests) and React Native; atob is browser-only
    const raw = new Uint8Array(Buffer.from(b64, "base64"));
    return deserializeMarketAccount(raw, address);
  }

  private async _sendTx(instructions: any[]): Promise<string> {
    const { value: latestBlockhash } = await this.rpc
      .getLatestBlockhash()
      .send();

    const tx = await pipe(
      createTransactionMessage({ version: 0 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (msg: any) => setTransactionMessageFeePayerSigner(this.signer, msg),
      (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
      (msg: any) => appendTransactionMessageInstructions(instructions, msg),
      (msg: any) => signTransactionMessageWithSigners(msg)
    );

    const signedTx = tx as FullySignedTransaction & TransactionWithBlockhashLifetime;
    const signature = getSignatureFromTransaction(signedTx);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc: this.rpc, rpcSubscriptions: undefined as any });
    await sendAndConfirm(signedTx, { commitment: "confirmed" });
    return signature;
  }
}

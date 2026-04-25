import {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import type { CreateMarketParams, PlaceBetParams, SettleMarketParams, Market, Bet } from "./types";
import { getMarketPda, getBetPda, TERRACE_PROGRAM_ID } from "./pda";
import { buildCreateMarketInstruction, buildPlaceBetInstruction, buildSettleMarketInstruction } from "./instructions";

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
    // TODO: deserialize with anchor IDL codec (Phase 2 — wire up generated types)
    throw new Error("fetchMarket deserializer not yet wired — use @coral-xyz/anchor on node side");
  }

  private async _sendTx(instructions: any[]): Promise<string> {
    const { value: latestBlockhash } = await this.rpc
      .getLatestBlockhash()
      .send();

    const tx = await pipe(
      createTransactionMessage({ version: 0 }),
      (msg) => setTransactionMessageFeePayerSigner(this.signer, msg),
      (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
      (msg) => appendTransactionMessageInstructions(instructions, msg),
      (msg) => signTransactionMessageWithSigners(msg)
    );

    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc: this.rpc, rpcSubscriptions: undefined as any });
    const signature = await sendAndConfirm(tx, { commitment: "confirmed" });
    return signature;
  }
}

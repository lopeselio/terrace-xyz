import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Terrace } from "../target/types/terrace";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// USDC devnet mint
const USDC_MINT = new anchor.web3.PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

describe("terrace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Terrace as Program<Terrace>;
  const creator = provider.wallet as anchor.Wallet;

  const nonce = BigInt(1);
  const question = "Will Arsenal win the Premier League 2025/26?";
  const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24h from now

  const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      creator.publicKey.toBuffer(),
      Buffer.from(new anchor.BN(nonce.toString()).toArrayLike(Buffer, "le", 8)),
    ],
    program.programId
  );

  const vault = getAssociatedTokenAddressSync(USDC_MINT, marketPda, true);

  it("creates a market", async () => {
    const tx = await program.methods
      .createMarket(question, new anchor.BN(expiry), new anchor.BN(nonce.toString()))
      .accounts({
        market: marketPda,
        vault,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("create_market tx:", tx);

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.question, question);
    assert.equal(market.creator.toBase58(), creator.publicKey.toBase58());
    assert.isNull(market.outcome);
    assert.equal(market.totalVolume.toNumber(), 0);
  });

  it("rejects a market with expiry in the past", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 1;
    try {
      await program.methods
        .createMarket("Bad market", new anchor.BN(pastExpiry), new anchor.BN(999))
        .accounts({
          market: anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("market"),
              creator.publicKey.toBuffer(),
              Buffer.from(new anchor.BN(999).toArrayLike(Buffer, "le", 8)),
            ],
            program.programId
          )[0],
          vault: getAssociatedTokenAddressSync(
            USDC_MINT,
            anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from("market"), creator.publicKey.toBuffer(), Buffer.from(new anchor.BN(999).toArrayLike(Buffer, "le", 8))],
              program.programId
            )[0],
            true
          ),
          usdcMint: USDC_MINT,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected error");
    } catch (e: any) {
      assert.include(e.message, "ExpiryInPast");
    }
  });

  // place_bet and settle_market tests require a funded USDC ATA on devnet.
  // Run `anchor test --skip-local-validator` against a funded wallet.
  it.skip("places a bet", async () => {
    // TODO: fund bettor ATA with devnet USDC before running
  });

  it("settles a market", async () => {
    const tx = await program.methods
      .settleMarket(1)
      .accounts({
        market: marketPda,
        creator: creator.publicKey,
      })
      .rpc();

    console.log("settle_market tx:", tx);

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.outcome, 1);
    assert.deepEqual(market.status, { settled: {} });
  });
});

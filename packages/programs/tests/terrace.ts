import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Terrace } from "../target/types/terrace";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotent,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// Unique base per run — shared across all describe blocks so re-runs don't hit "account already exists"
const RUN = new anchor.BN(Date.now());

// USDC devnet mint
const USDC_MINT = new anchor.web3.PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

function marketPda(
  program: Program<Terrace>,
  creator: anchor.web3.PublicKey,
  nonce: anchor.BN
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      creator.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
}

function betPda(
  program: Program<Terrace>,
  market: anchor.web3.PublicKey,
  bettor: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
    program.programId
  );
}

function reputationPda(
  program: Program<Terrace>,
  owner: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), owner.toBuffer()],
    program.programId
  );
}

describe("terrace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Terrace as Program<Terrace>;
  const creator = provider.wallet as anchor.Wallet;

  const nonce = RUN;
  const question = "Will Arsenal win the Premier League 2025/26?";
  const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24h from now

  const [market] = marketPda(program, creator.publicKey, nonce);
  const vault = getAssociatedTokenAddressSync(USDC_MINT, market, true);

  // ── create_market ──────────────────────────────────────────────────────────

  it("creates a market", async () => {
    const tx = await program.methods
      .createMarket(question, new anchor.BN(expiry), 200, nonce, null, false, false) // 2% fee, public, not flash
      .accounts({
        market,
        vault,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("create_market tx:", tx);

    const m = await program.account.market.fetch(market);
    assert.equal(m.question, question);
    assert.equal(m.creator.toBase58(), creator.publicKey.toBase58());
    assert.isNull(m.outcome);
    assert.equal(m.totalVolume.toNumber(), 0);
    assert.equal(m.yesVolume.toNumber(), 0);
    assert.equal(m.noVolume.toNumber(), 0);
  });

  it("rejects a market with creator fee above 5%", async () => {
    const badNonce2 = RUN.addn(998);
    const [badMarket2] = marketPda(program, creator.publicKey, badNonce2);
    const badVault2 = getAssociatedTokenAddressSync(USDC_MINT, badMarket2, true);

    try {
      await program.methods
        .createMarket(question, new anchor.BN(expiry), 501, badNonce2, null, false, false) // 5.01% — over limit
        .accounts({
          market: badMarket2,
          vault: badVault2,
          usdcMint: USDC_MINT,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected FeeTooHigh error");
    } catch (e: any) {
      assert.include(e.message, "FeeTooHigh");
    }
  });

  it("rejects a market with expiry in the past", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 1;
    const badNonce = RUN.addn(999);
    const [badMarket] = marketPda(program, creator.publicKey, badNonce);
    const badVault = getAssociatedTokenAddressSync(USDC_MINT, badMarket, true);

    try {
      await program.methods
        .createMarket("Bad market", new anchor.BN(pastExpiry), 0, badNonce, null, false, false)
        .accounts({
          market: badMarket,
          vault: badVault,
          usdcMint: USDC_MINT,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected ExpiryInPast error");
    } catch (e: any) {
      assert.include(e.message, "ExpiryInPast");
    }
  });

  // ── place_bet (requires funded devnet USDC ATA) ────────────────────────────

  it.skip("places a bet on Yes", async () => {
    // Run with `anchor test --skip-local-validator` against a funded wallet.
    const [bet] = betPda(program, market, creator.publicKey);
    const bettorAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);
    const amountLamports = new anchor.BN(1_000_000); // 1 USDC

    const tx = await program.methods
      .placeBet(1, amountLamports)
      .accounts({
        market,
        bet,
        vault,
        bettorAta,
        usdcMint: USDC_MINT,
        bettor: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("place_bet tx:", tx);

    const b = await program.account.bet.fetch(bet);
    assert.equal(b.outcome, 1);
    assert.equal(b.amount.toNumber(), 1_000_000);
    assert.isFalse(b.claimed);
    assert.isFalse(b.resultRecorded);

    const m = await program.account.market.fetch(market);
    assert.equal(m.totalVolume.toNumber(), 1_000_000);
    assert.equal(m.yesVolume.toNumber(), 1_000_000);
    assert.equal(m.noVolume.toNumber(), 0);
  });

  // ── settle_market ──────────────────────────────────────────────────────────

  it("settles a market", async () => {
    const tx = await program.methods
      .settleMarket(1)
      .accounts({
        market,
        creator: creator.publicKey,
      })
      .rpc();

    console.log("settle_market tx:", tx);

    const m = await program.account.market.fetch(market);
    assert.equal(m.outcome, 1);
    assert.deepEqual(m.status, { settled: {} });
  });

  // ── settle_market_oracle ───────────────────────────────────────────────────

  it("creates a market with an oracle and settles it via the oracle", async () => {
    const oracleKeypair = anchor.web3.Keypair.generate();
    const oracleNonce = RUN.addn(50);
    const [oracleMarket] = marketPda(program, creator.publicKey, oracleNonce);
    const oracleVault = getAssociatedTokenAddressSync(USDC_MINT, oracleMarket, true);

    await program.methods
      .createMarket(question, new anchor.BN(expiry), 0, oracleNonce, oracleKeypair.publicKey, false, false)
      .accounts({
        market: oracleMarket,
        vault: oracleVault,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const m = await program.account.market.fetch(oracleMarket);
    assert.deepEqual(m.oracle, oracleKeypair.publicKey);

    // Oracle keypair (simulating Switchboard Function) settles the market
    const tx = await program.methods
      .settleMarketOracle(1)
      .accounts({
        market: oracleMarket,
        oracle: oracleKeypair.publicKey,
      })
      .signers([oracleKeypair])
      .rpc();

    console.log("settle_market_oracle tx:", tx);

    const settled = await program.account.market.fetch(oracleMarket);
    assert.equal(settled.outcome, 1);
    assert.deepEqual(settled.status, { settled: {} });
  });

  it("rejects oracle settlement with wrong keypair", async () => {
    const wrongOracle = anchor.web3.Keypair.generate();
    const oracleNonce = RUN.addn(51);
    const [oracleMarket] = marketPda(program, creator.publicKey, oracleNonce);
    const oracleVault = getAssociatedTokenAddressSync(USDC_MINT, oracleMarket, true);
    const realOracle = anchor.web3.Keypair.generate();

    await program.methods
      .createMarket(question, new anchor.BN(expiry), 0, oracleNonce, realOracle.publicKey, false, false)
      .accounts({
        market: oracleMarket,
        vault: oracleVault,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    try {
      await program.methods
        .settleMarketOracle(1)
        .accounts({ market: oracleMarket, oracle: wrongOracle.publicKey })
        .signers([wrongOracle])
        .rpc();
      assert.fail("Expected Unauthorized error");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
    }
  });

  it("rejects oracle settlement on a market with no oracle configured", async () => {
    // Use a fresh Open market with oracle=null (nonce=1 is already settled)
    const noOracleNonce = RUN.addn(60);
    const [noOracleMarket] = marketPda(program, creator.publicKey, noOracleNonce);
    const noOracleVault = getAssociatedTokenAddressSync(USDC_MINT, noOracleMarket, true);

    await program.methods
      .createMarket(question, new anchor.BN(expiry), 0, noOracleNonce, null, false, false)
      .accounts({
        market: noOracleMarket, vault: noOracleVault, usdcMint: USDC_MINT,
        creator: creator.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const anyKey = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .settleMarketOracle(0)
        .accounts({ market: noOracleMarket, oracle: anyKey.publicKey })
        .signers([anyKey])
        .rpc();
      assert.fail("Expected OracleNotSet error");
    } catch (e: any) {
      assert.include(e.message, "OracleNotSet");
    }
  });

  it("rejects settling an already-settled market", async () => {
    try {
      await program.methods
        .settleMarket(0)
        .accounts({ market, creator: creator.publicKey })
        .rpc();
      assert.fail("Expected MarketNotOpen error");
    } catch (e: any) {
      assert.include(e.message, "MarketNotOpen");
    }
  });

  // ── claim_winnings (requires funded devnet USDC ATA + placed bets) ─────────

  it.skip("claims winnings for the Yes side", async () => {
    // Prerequisites: market settled with outcome=1, bettor has a Yes bet.
    const [bet] = betPda(program, market, creator.publicKey);
    const [reputation] = reputationPda(program, creator.publicKey);
    const bettorAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);
    // creator_ata same address since bettor == creator in this test
    const creatorAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    const tx = await program.methods
      .claimWinnings()
      .accounts({
        market,
        bet,
        reputation,
        vault,
        bettorAta,
        creator: creator.publicKey,
        creatorAta,
        usdcMint: USDC_MINT,
        bettor: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("claim_winnings tx:", tx);

    const b = await program.account.bet.fetch(bet);
    assert.isTrue(b.claimed);
    assert.isTrue(b.resultRecorded);

    const rep = await program.account.reputation.fetch(reputation);
    assert.equal(rep.totalBets, 1);
    assert.equal(rep.winningBets, 1);
    assert.equal(rep.winRateBps, 10_000); // 100%
    assert.equal(rep.currentStreak, 1);
    assert.deepEqual(rep.badgeTier, { casual: {} }); // 1 bet, not yet Sharp
  });

  it.skip("rejects a double-claim", async () => {
    const [bet] = betPda(program, market, creator.publicKey);
    const [reputation] = reputationPda(program, creator.publicKey);
    const bettorAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);
    const creatorAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    try {
      await program.methods
        .claimWinnings()
        .accounts({
          market,
          bet,
          reputation,
          vault,
          bettorAta,
          creator: creator.publicKey,
          creatorAta,
          usdcMint: USDC_MINT,
          bettor: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected AlreadyClaimed error");
    } catch (e: any) {
      assert.include(e.message, "AlreadyClaimed");
    }
  });

  // ── record_loss (requires a settled market + a losing bet) ─────────────────

  it.skip("records a loss on the bettor's reputation", async () => {
    // Prerequisites: market settled with outcome=1, bettor has a No bet (lost).
    const loser = anchor.web3.Keypair.generate();
    const [bet] = betPda(program, market, loser.publicKey);
    const [reputation] = reputationPda(program, loser.publicKey);

    const tx = await program.methods
      .recordLoss()
      .accounts({
        market,
        bet,
        reputation,
        bettor: loser.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([loser])
      .rpc();

    console.log("record_loss tx:", tx);

    const b = await program.account.bet.fetch(bet);
    assert.isTrue(b.resultRecorded);
    assert.isFalse(b.claimed);

    const rep = await program.account.reputation.fetch(reputation);
    assert.equal(rep.totalBets, 1);
    assert.equal(rep.winningBets, 0);
    assert.equal(rep.winRateBps, 0);
    assert.equal(rep.currentStreak, -1);
  });

  it.skip("rejects recording a loss for a winning bet", async () => {
    const [bet] = betPda(program, market, creator.publicKey);
    const [reputation] = reputationPda(program, creator.publicKey);

    try {
      await program.methods
        .recordLoss()
        .accounts({
          market,
          bet,
          reputation,
          bettor: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected BetWasWinner error");
    } catch (e: any) {
      assert.include(e.message, "BetWasWinner");
    }
  });

  // ── Parlay ─────────────────────────────────────────────────────────────────

  function parlayPda(
    program: Program<Terrace>,
    creator: anchor.web3.PublicKey,
    nonce: anchor.BN
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("parlay"),
        creator.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
  }

  it("rejects a parlay with fewer than 2 legs", async () => {
    const pNonce = RUN.addn(42);
    const [parlay] = parlayPda(program, creator.publicKey, pNonce);
    const parlayVault = getAssociatedTokenAddressSync(USDC_MINT, parlay, true);

    try {
      await program.methods
        .createParlay(
          [{ market, outcome: 1 }], // only 1 leg
          new anchor.BN(1_000_000),
          pNonce
        )
        .accounts({
          parlay,
          parlayVault,
          creatorAta: getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey),
          usdcMint: USDC_MINT,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected InvalidParlayLegs error");
    } catch (e: any) {
      assert.include(e.message, "InvalidParlayLegs");
    }
  });

  it.skip("creates a 2-leg parlay and settles it (requires funded USDC ATA)", async () => {
    // Prerequisites: two settled markets + a funded creator USDC ATA.
    const pNonce = RUN.addn(100);
    const [parlay] = parlayPda(program, creator.publicKey, pNonce);
    const parlayVault = getAssociatedTokenAddressSync(USDC_MINT, parlay, true);

    // Need a second market for the second leg — use nonce=2
    const nonce2 = RUN.addn(2);
    const [market2] = marketPda(program, creator.publicKey, nonce2);

    const legs = [
      { market, outcome: 1 },  // Yes on first market
      { market: market2, outcome: 0 }, // No on second market
    ];

    await program.methods
      .createParlay(legs, new anchor.BN(2_000_000), pNonce)
      .accounts({
        parlay,
        parlayVault,
        creatorAta: getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey),
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const p = await program.account.parlay.fetch(parlay);
    assert.equal(p.legs.length, 2);
    assert.equal(p.stakeUsdc.toNumber(), 2_000_000);
    assert.deepEqual(p.status, { open: {} });

    // Settle after both markets resolve
    await program.methods
      .settleParlay()
      .accounts({ parlay })
      .remainingAccounts([
        { pubkey: market, isWritable: false, isSigner: false },
        { pubkey: market2, isWritable: false, isSigner: false },
      ])
      .rpc();

    const settled = await program.account.parlay.fetch(parlay);
    // Outcome depends on which side each market settled on
    assert.oneOf(Object.keys(settled.status)[0], ["won", "lost"]);
  });

  it.skip("rejects settling a parlay with wrong market order (requires funded USDC ATA)", async () => {
    // If remaining_accounts don't match parlay.legs order → MarketMismatch
    const pNonce = RUN.addn(101);
    const [parlay] = parlayPda(program, creator.publicKey, pNonce);
    const nonce2 = RUN.addn(2);
    const [market2] = marketPda(program, creator.publicKey, nonce2);

    try {
      await program.methods
        .settleParlay()
        .accounts({ parlay })
        .remainingAccounts([
          { pubkey: market2, isWritable: false, isSigner: false }, // wrong order
          { pubkey: market, isWritable: false, isSigner: false },
        ])
        .rpc();
      assert.fail("Expected MarketMismatch error");
    } catch (e: any) {
      assert.include(e.message, "MarketMismatch");
    }
  });
});

// ── Matchup ─────────────────────────────────────────────────────────────────

describe("Matchup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Terrace as Program<Terrace>;
  const creator = provider.wallet as anchor.Wallet;

  // Dedicated open market for matchup tests (nonce=200, never settled)
  const mMarketNonce = RUN.addn(200);
  const [mMarket] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      creator.publicKey.toBuffer(),
      mMarketNonce.toArrayLike(Buffer, "le", 8),
    ],
    anchor.workspace.Terrace.programId
  );
  const mVault = getAssociatedTokenAddressSync(USDC_MINT, mMarket, true);

  const opponent = anchor.web3.Keypair.generate();

  function matchupPda(
    challenger: anchor.web3.PublicKey,
    mkt: anchor.web3.PublicKey,
    nonce: anchor.BN
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("matchup"),
        challenger.toBuffer(),
        mkt.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
  }

  before("create open market + challenger USDC ATA for matchup tests", async () => {
    await program.methods
      .createMarket(
        "Will Man City win the title?",
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
        0,
        mMarketNonce,
        null,
        false,
        false
      )
      .accounts({
        market: mMarket,
        vault: mVault,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Idempotently create the challenger's USDC ATA (empty is fine for validation tests)
    await createAssociatedTokenAccountIdempotent(
      provider.connection,
      (provider.wallet as any).payer,
      USDC_MINT,
      creator.publicKey
    );
  });

  // ── Validation tests (no funded USDC needed) ────────────────────────────

  it("rejects create_matchup with outcome > 1", async () => {
    const muNonce = RUN.addn(201);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    try {
      await program.methods
        .createMatchup(opponent.publicKey, 2, new anchor.BN(1_000_000), muNonce)
        .accounts({
          matchup,
          matchupVault,
          challengerAta,
          market: mMarket,
          usdcMint: USDC_MINT,
          challenger: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected InvalidOutcome error");
    } catch (e: any) {
      assert.include(e.message, "InvalidOutcome");
    }
  });

  it("rejects create_matchup with stake below 0.1 USDC minimum", async () => {
    const muNonce = RUN.addn(202);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    try {
      await program.methods
        .createMatchup(opponent.publicKey, 1, new anchor.BN(50_000), muNonce) // 0.05 USDC
        .accounts({
          matchup,
          matchupVault,
          challengerAta,
          market: mMarket,
          usdcMint: USDC_MINT,
          challenger: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected BetTooSmall error");
    } catch (e: any) {
      assert.include(e.message, "BetTooSmall");
    }
  });

  it("rejects create_matchup against a non-Open (settled) market", async () => {
    // RUN market was settled by the terrace suite above
    const [settledMarket] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        creator.publicKey.toBuffer(),
        RUN.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const muNonce = RUN.addn(203);
    const [matchup] = matchupPda(creator.publicKey, settledMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    try {
      await program.methods
        .createMatchup(opponent.publicKey, 1, new anchor.BN(1_000_000), muNonce)
        .accounts({
          matchup,
          matchupVault,
          challengerAta,
          market: settledMarket,
          usdcMint: USDC_MINT,
          challenger: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected MarketNotOpen error");
    } catch (e: any) {
      assert.include(e.message, "MarketNotOpen");
    }
  });

  // ── Happy-path + edge cases (require funded USDC ATAs) ──────────────────

  it.skip("full flow: create → accept → settle, challenger wins (requires funded USDC)", async () => {
    const muNonce = RUN.addn(210);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);
    const opponentAta = getAssociatedTokenAddressSync(USDC_MINT, opponent.publicKey);
    const stake = new anchor.BN(1_000_000);

    await program.methods
      .createMatchup(opponent.publicKey, 1, stake, muNonce)
      .accounts({
        matchup, matchupVault, challengerAta, market: mMarket,
        usdcMint: USDC_MINT, challenger: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const created = await program.account.matchup.fetch(matchup);
    assert.deepEqual(created.status, { pending: {} });
    assert.equal(created.challengerOutcome, 1);
    assert.equal(created.stakeUsdc.toNumber(), 1_000_000);

    await program.methods
      .acceptMatchup()
      .accounts({
        matchup, matchupVault, opponentAta,
        usdcMint: USDC_MINT, opponent: opponent.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([opponent])
      .rpc();

    assert.deepEqual((await program.account.matchup.fetch(matchup)).status, { accepted: {} });

    // Settle underlying market with outcome=1 (challenger picked Yes → wins)
    await program.methods
      .settleMarket(1)
      .accounts({ market: mMarket, creator: creator.publicKey })
      .rpc();

    const balBefore = (await provider.connection.getTokenAccountBalance(challengerAta)).value.uiAmount!;

    await program.methods
      .settleMatchup()
      .accounts({
        matchup, market: mMarket, matchupVault, challengerAta, opponentAta,
        challenger: creator.publicKey, opponent: opponent.publicKey,
        usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    assert.deepEqual((await program.account.matchup.fetch(matchup)).status, { settled: {} });
    const balAfter = (await provider.connection.getTokenAccountBalance(challengerAta)).value.uiAmount!;
    assert.approximately(balAfter - balBefore, 1.0, 0.001); // net +1 USDC (received 2×, spent 1×)
  });

  it.skip("opponent declines pending matchup — challenger gets full refund (requires funded USDC)", async () => {
    const muNonce = RUN.addn(211);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    await program.methods
      .createMatchup(opponent.publicKey, 1, new anchor.BN(1_000_000), muNonce)
      .accounts({
        matchup, matchupVault, challengerAta, market: mMarket,
        usdcMint: USDC_MINT, challenger: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const balBefore = (await provider.connection.getTokenAccountBalance(challengerAta)).value.uiAmount!;

    await program.methods
      .declineMatchup()
      .accounts({
        matchup, matchupVault, challengerAta,
        challenger: creator.publicKey, signer: opponent.publicKey,
        usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([opponent])
      .rpc();

    assert.deepEqual((await program.account.matchup.fetch(matchup)).status, { declined: {} });
    const balAfter = (await provider.connection.getTokenAccountBalance(challengerAta)).value.uiAmount!;
    assert.approximately(balAfter - balBefore, 1.0, 0.001);
  });

  it.skip("challenger self-cancels a pending matchup (requires funded USDC)", async () => {
    const muNonce = RUN.addn(212);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    await program.methods
      .createMatchup(opponent.publicKey, 0, new anchor.BN(1_000_000), muNonce)
      .accounts({
        matchup, matchupVault, challengerAta, market: mMarket,
        usdcMint: USDC_MINT, challenger: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .declineMatchup()
      .accounts({
        matchup, matchupVault, challengerAta,
        challenger: creator.publicKey, signer: creator.publicKey,
        usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    assert.deepEqual((await program.account.matchup.fetch(matchup)).status, { declined: {} });
  });

  it.skip("rejects accept_matchup from wrong opponent key (requires funded USDC)", async () => {
    const muNonce = RUN.addn(213);
    const [matchup] = matchupPda(creator.publicKey, mMarket, muNonce);
    const matchupVault = getAssociatedTokenAddressSync(USDC_MINT, matchup, true);
    const challengerAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);

    await program.methods
      .createMatchup(opponent.publicKey, 1, new anchor.BN(1_000_000), muNonce)
      .accounts({
        matchup, matchupVault, challengerAta, market: mMarket,
        usdcMint: USDC_MINT, challenger: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const wrongOpponent = anchor.web3.Keypair.generate();
    const wrongOpponentAta = getAssociatedTokenAddressSync(USDC_MINT, wrongOpponent.publicKey);

    try {
      await program.methods
        .acceptMatchup()
        .accounts({
          matchup, matchupVault, opponentAta: wrongOpponentAta,
          usdcMint: USDC_MINT, opponent: wrongOpponent.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wrongOpponent])
        .rpc();
      assert.fail("Expected Unauthorized error");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
    }
  });
});

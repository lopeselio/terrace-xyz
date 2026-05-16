use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::{
    constants::*,
    errors::TerracError,
    events::*,
    helpers::compute_badge,
    state::*,
};

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(question: String, expiry: i64, creator_fee_bps: u16, nonce: u64)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = creator,
        space = Market::SPACE,
        seeds = [b"market", creator.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// USDC vault — ATA owned by the market PDA
    #[account(
        init,
        payer = creator,
        associated_token::mint = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: u8, amount: u64)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Bet::SPACE,
        seeds = [b"bet", market.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Bettor's USDC ATA (must have sufficient balance)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = bettor,
    )]
    pub bettor_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", creator.key().as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
        has_one = creator @ TerracError::Unauthorized,
    )]
    pub market: Account<'info, Market>,

    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleMarketOracle<'info> {
    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// Switchboard Function oracle keypair — key validated against market.oracle in the instruction.
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    /// Market PDA — read-only; vault authority
    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"bet", market.key().as_ref(), bettor.key().as_ref()],
        bump = bet.bump,
        has_one = market,
        has_one = bettor,
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Reputation::SPACE,
        seeds = [b"reputation", bettor.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, Reputation>,

    /// Market's USDC vault — source of payout
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Bettor's USDC ATA — destination of net payout
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = bettor,
    )]
    pub bettor_ata: Box<Account<'info, TokenAccount>>,

    /// Market creator — used only as ATA authority; key checked against market.creator.
    /// CHECK: key is constrained to market.creator; no other trust assumption needed.
    #[account(
        constraint = creator.key() == market.creator @ TerracError::Unauthorized
    )]
    pub creator: UncheckedAccount<'info>,

    /// Market creator's USDC ATA — receives the creator fee.
    /// init_if_needed: bettor covers the ~0.002 SOL rent once per creator wallet.
    #[account(
        init_if_needed,
        payer = bettor,
        associated_token::mint = usdc_mint,
        associated_token::authority = creator,
    )]
    pub creator_ata: Box<Account<'info, TokenAccount>>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordLoss<'info> {
    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"bet", market.key().as_ref(), bettor.key().as_ref()],
        bump = bet.bump,
        has_one = market,
        has_one = bettor,
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Reputation::SPACE,
        seeds = [b"reputation", bettor.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, Reputation>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Handler functions
// ---------------------------------------------------------------------------

/// Create a binary-outcome prediction market.
/// nonce lets one creator own many markets: PDA = [b"market", creator, nonce_le].
/// creator_fee_bps: cut of each winning payout sent to the creator (max 500 = 5%).
/// oracle: optional Switchboard Function pubkey authorized to call settle_market_oracle.
pub fn create_market(
    ctx: Context<CreateMarket>,
    question: String,
    expiry: i64,
    creator_fee_bps: u16,
    nonce: u64,
    oracle: Option<Pubkey>,
    is_private: bool,
    is_flash: bool,
) -> Result<()> {
    require!(
        question.len() > 0 && question.len() <= MAX_QUESTION_LEN,
        TerracError::InvalidQuestion
    );
    require!(
        expiry > Clock::get()?.unix_timestamp,
        TerracError::ExpiryInPast
    );
    require!(
        creator_fee_bps <= MAX_CREATOR_FEE_BPS,
        TerracError::FeeTooHigh
    );

    let market = &mut ctx.accounts.market;
    market.question = question;
    market.expiry = expiry;
    market.creator = ctx.accounts.creator.key();
    market.outcome = None;
    market.total_volume = 0;
    market.yes_volume = 0;
    market.no_volume = 0;
    market.vault = ctx.accounts.vault.key();
    market.status = MarketStatus::Open;
    market.creator_fee_bps = creator_fee_bps;
    market.oracle = oracle;
    market.is_private = is_private;
    market.is_flash = is_flash;
    market.nonce = nonce;
    market.bump = ctx.bumps.market;

    emit!(MarketCreated {
        market: market.key(),
        creator: market.creator,
        expiry,
        nonce,
    });

    Ok(())
}

/// Place a binary bet (outcome 0 = No, 1 = Yes) on an open market.
/// One bet PDA per (market, bettor) — repeated bets accumulate into the same PDA.
pub fn place_bet(
    ctx: Context<PlaceBet>,
    outcome: u8,
    amount: u64,
) -> Result<()> {
    require!(outcome <= 1, TerracError::InvalidOutcome);
    require!(amount >= MIN_BET, TerracError::BetTooSmall);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, TerracError::MarketNotOpen);
    require!(!market.is_private, TerracError::MarketIsPrivate);
    require!(
        Clock::get()?.unix_timestamp < market.expiry,
        TerracError::MarketExpired
    );

    // Transfer USDC from bettor ATA → market vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.bettor_ata.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.bettor.to_account_info(),
            },
        ),
        amount,
    )?;

    market.total_volume = market
        .total_volume
        .checked_add(amount)
        .ok_or(TerracError::Overflow)?;

    if outcome == 1 {
        market.yes_volume = market
            .yes_volume
            .checked_add(amount)
            .ok_or(TerracError::Overflow)?;
    } else {
        market.no_volume = market
            .no_volume
            .checked_add(amount)
            .ok_or(TerracError::Overflow)?;
    }

    let bet = &mut ctx.accounts.bet;
    if bet.amount == 0 {
        bet.market = market.key();
        bet.bettor = ctx.accounts.bettor.key();
        bet.outcome = outcome;
        bet.bump = ctx.bumps.bet;
    } else {
        // Accumulate only if same outcome — reject mixed-outcome top-ups.
        require!(bet.outcome == outcome, TerracError::OutcomeMismatch);
    }

    bet.amount = bet
        .amount
        .checked_add(amount)
        .ok_or(TerracError::Overflow)?;

    emit!(BetPlaced {
        market: market.key(),
        bettor: ctx.accounts.bettor.key(),
        outcome,
        amount,
    });

    Ok(())
}

/// Settle the market by recording the winning outcome.
/// Only the market creator can settle. If an oracle is configured,
/// prefer settle_market_oracle — this remains as a creator override.
pub fn settle_market(
    ctx: Context<SettleMarket>,
    winning_outcome: u8,
) -> Result<()> {
    require!(winning_outcome <= 1, TerracError::InvalidOutcome);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, TerracError::MarketNotOpen);

    market.outcome = Some(winning_outcome);
    market.status = MarketStatus::Settled;

    emit!(MarketSettled {
        market: market.key(),
        winning_outcome,
    });

    Ok(())
}

/// Permissionless oracle settlement for sports markets.
/// The oracle signer must match the pubkey stored in market.oracle at creation.
/// In production this is called by a Switchboard Function TEE that queries a
/// football API, maps the match result to 0 (No) or 1 (Yes), and submits here.
pub fn settle_market_oracle(
    ctx: Context<SettleMarketOracle>,
    winning_outcome: u8,
) -> Result<()> {
    require!(winning_outcome <= 1, TerracError::InvalidOutcome);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, TerracError::MarketNotOpen);

    let expected_oracle = market.oracle.ok_or(TerracError::OracleNotSet)?;
    require!(
        ctx.accounts.oracle.key() == expected_oracle,
        TerracError::Unauthorized
    );

    market.outcome = Some(winning_outcome);
    market.status = MarketStatus::Settled;

    emit!(MarketSettled {
        market: market.key(),
        winning_outcome,
    });

    Ok(())
}

/// Pro-rata USDC payout for the winning side.
/// gross_payout = bet_amount * total_volume / winning_side_volume
/// fee          = gross_payout * creator_fee_bps / 10_000  → creator ATA
/// net_payout   = gross_payout - fee                       → bettor ATA
/// Also initialises (or updates) the bettor's Reputation PDA (win).
pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
    let (gross_payout, creator_fee_bps, creator, nonce_le, market_bump, market_key, bettor_key) = {
        let market = &ctx.accounts.market;
        let bet = &ctx.accounts.bet;

        require!(market.status == MarketStatus::Settled, TerracError::MarketNotSettled);
        require!(!bet.claimed, TerracError::AlreadyClaimed);

        let winning_outcome = market.outcome.ok_or(TerracError::MarketNotSettled)?;
        require!(bet.outcome == winning_outcome, TerracError::BetDidNotWin);

        let winning_volume = if winning_outcome == 1 {
            market.yes_volume
        } else {
            market.no_volume
        };
        require!(winning_volume > 0, TerracError::ZeroWinningVolume);

        // u128 prevents overflow during multiplication before division
        let gross_payout = (bet.amount as u128)
            .checked_mul(market.total_volume as u128)
            .ok_or(TerracError::Overflow)?
            .checked_div(winning_volume as u128)
            .ok_or(TerracError::Overflow)? as u64;

        (
            gross_payout,
            market.creator_fee_bps,
            market.creator,
            market.nonce.to_le_bytes(),
            market.bump,
            market.key(),
            ctx.accounts.bettor.key(),
        )
    };

    let fee = (gross_payout as u128)
        .checked_mul(creator_fee_bps as u128)
        .ok_or(TerracError::Overflow)?
        .checked_div(10_000)
        .ok_or(TerracError::Overflow)? as u64;
    let net_payout = gross_payout.checked_sub(fee).ok_or(TerracError::Overflow)?;

    let signer_seeds: &[&[&[u8]]] = &[&[b"market", creator.as_ref(), &nonce_le, &[market_bump]]];

    // Transfer net payout: vault → bettor ATA
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.bettor_ata.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        net_payout,
    )?;

    // Transfer creator fee: vault → creator ATA (skip if zero)
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator_ata.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    ctx.accounts.bet.claimed = true;
    ctx.accounts.bet.result_recorded = true;

    // Update reputation — win
    let rep = &mut ctx.accounts.reputation;
    rep.owner = bettor_key;
    rep.bump = ctx.bumps.reputation;
    rep.total_bets = rep.total_bets.checked_add(1).ok_or(TerracError::Overflow)?;
    rep.winning_bets = rep.winning_bets.checked_add(1).ok_or(TerracError::Overflow)?;
    rep.win_rate_bps = ((rep.winning_bets as u64)
        .checked_mul(10_000)
        .ok_or(TerracError::Overflow)?
        / rep.total_bets as u64) as u16;
    rep.current_streak = if rep.current_streak >= 0 {
        rep.current_streak.saturating_add(1)
    } else {
        1
    };
    rep.badge_tier = compute_badge(rep.total_bets, rep.win_rate_bps);

    emit!(WinningsClaimed {
        market: market_key,
        bettor: bettor_key,
        payout: net_payout,
        fee,
    });
    emit!(ReputationUpdated {
        owner: bettor_key,
        total_bets: rep.total_bets,
        winning_bets: rep.winning_bets,
        win_rate_bps: rep.win_rate_bps,
        badge_tier: rep.badge_tier.clone(),
    });

    Ok(())
}

/// Records a loss on the bettor's Reputation PDA.
/// Must be called by the bettor after the market settles to keep their record current.
pub fn record_loss(ctx: Context<RecordLoss>) -> Result<()> {
    let (market_key, bettor_key) = {
        let market = &ctx.accounts.market;
        let bet = &ctx.accounts.bet;

        require!(market.status == MarketStatus::Settled, TerracError::MarketNotSettled);
        require!(!bet.result_recorded, TerracError::AlreadyRecorded);

        let winning_outcome = market.outcome.ok_or(TerracError::MarketNotSettled)?;
        // Ensure this bet actually lost — winners must use claim_winnings.
        require!(bet.outcome != winning_outcome, TerracError::BetWasWinner);

        (market.key(), ctx.accounts.bettor.key())
    };

    ctx.accounts.bet.result_recorded = true;

    // Update reputation — loss
    let rep = &mut ctx.accounts.reputation;
    rep.owner = bettor_key;
    rep.bump = ctx.bumps.reputation;
    rep.total_bets = rep.total_bets.checked_add(1).ok_or(TerracError::Overflow)?;
    // winning_bets unchanged
    rep.win_rate_bps = if rep.total_bets > 0 {
        ((rep.winning_bets as u64)
            .checked_mul(10_000)
            .ok_or(TerracError::Overflow)?
            / rep.total_bets as u64) as u16
    } else {
        0
    };
    rep.current_streak = if rep.current_streak <= 0 {
        rep.current_streak.saturating_sub(1)
    } else {
        -1
    };
    rep.badge_tier = compute_badge(rep.total_bets, rep.win_rate_bps);

    emit!(ReputationUpdated {
        owner: bettor_key,
        total_bets: rep.total_bets,
        winning_bets: rep.winning_bets,
        win_rate_bps: rep.win_rate_bps,
        badge_tier: rep.badge_tier.clone(),
    });

    let _ = market_key; // used in future events; suppress warning for now
    Ok(())
}

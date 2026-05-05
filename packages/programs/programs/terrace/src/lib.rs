use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

const MAX_QUESTION_LEN: usize = 200;
const MAX_PARLAY_LEGS: usize = 8;
const USDC_DECIMALS: u64 = 1_000_000; // 1 USDC = 1_000_000 lamports (6 dp)
const MIN_BET: u64 = USDC_DECIMALS / 10; // 0.1 USDC minimum

#[program]
pub mod terrace {
    use super::*;

    /// Create a binary-outcome prediction market.
    /// nonce lets one creator own many markets: PDA = [b"market", creator, nonce_le].
    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        expiry: i64,
        nonce: u64,
    ) -> Result<()> {
        require!(
            question.len() > 0 && question.len() <= MAX_QUESTION_LEN,
            TerracError::InvalidQuestion
        );
        require!(
            expiry > Clock::get()?.unix_timestamp,
            TerracError::ExpiryInPast
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
    /// Only the market creator can settle.
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

    /// Pro-rata USDC payout for the winning side.
    /// payout = bet_amount * total_volume / winning_side_volume
    /// Also initialises (or updates) the bettor's Reputation PDA (win).
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let (payout, creator, nonce_le, market_bump, market_key, bettor_key) = {
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
            let payout = (bet.amount as u128)
                .checked_mul(market.total_volume as u128)
                .ok_or(TerracError::Overflow)?
                .checked_div(winning_volume as u128)
                .ok_or(TerracError::Overflow)? as u64;

            (
                payout,
                market.creator,
                market.nonce.to_le_bytes(),
                market.bump,
                market.key(),
                ctx.accounts.bettor.key(),
            )
        };

        // Transfer USDC: vault (PDA-owned) → bettor ATA
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.bettor_ata.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[&[b"market", creator.as_ref(), &nonce_le, &[market_bump]]],
            ),
            payout,
        )?;

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
            payout,
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

    /// Create a multi-leg parlay bet.
    /// Stake is escrowed in a vault owned by the Parlay PDA.
    /// Legs must reference distinct, open markets.
    pub fn create_parlay(
        ctx: Context<CreateParlay>,
        legs: Vec<ParlayLeg>,
        stake_usdc: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(
            legs.len() >= 2 && legs.len() <= MAX_PARLAY_LEGS,
            TerracError::InvalidParlayLegs
        );
        require!(stake_usdc >= MIN_BET, TerracError::BetTooSmall);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator_ata.to_account_info(),
                    to: ctx.accounts.parlay_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            stake_usdc,
        )?;

        let parlay = &mut ctx.accounts.parlay;
        parlay.creator = ctx.accounts.creator.key();
        parlay.legs = legs;
        parlay.stake_usdc = stake_usdc;
        parlay.status = ParlayStatus::Open;
        parlay.nonce = nonce;
        parlay.bump = ctx.bumps.parlay;

        emit!(ParlayCreated {
            parlay: parlay.key(),
            creator: parlay.creator,
            n_legs: parlay.legs.len() as u8,
            stake_usdc,
            nonce,
        });

        Ok(())
    }

    /// Permissionless parlay settlement.
    /// Caller must pass all leg market accounts as remaining_accounts in the same
    /// order as parlay.legs. All markets must be settled; any mismatched outcome
    /// marks the parlay Lost. If every leg hits, the parlay is Won.
    pub fn settle_parlay(ctx: Context<SettleParlay>) -> Result<()> {
        require!(
            ctx.accounts.parlay.status == ParlayStatus::Open,
            TerracError::ParlayNotOpen
        );
        // Clone legs to avoid split-borrow issues when iterating remaining_accounts
        let legs = ctx.accounts.parlay.legs.clone();
        let n = legs.len();
        require!(ctx.remaining_accounts.len() == n, TerracError::InvalidParlayLegs);

        let mut all_won = true;
        for i in 0..n {
            let account_info = &ctx.remaining_accounts[i];
            require!(
                account_info.key() == legs[i].market,
                TerracError::MarketMismatch
            );
            let data = account_info.try_borrow_data()?;
            let (status, outcome) = read_market_status_outcome(&data)
                .ok_or(TerracError::MarketMismatch)?;
            require!(status == 2, TerracError::MarketNotSettled); // 2 = Settled
            let winning = outcome.ok_or(TerracError::MarketNotSettled)?;
            if winning != legs[i].outcome {
                all_won = false;
            }
        }

        let parlay_key = ctx.accounts.parlay.key();
        ctx.accounts.parlay.status = if all_won {
            ParlayStatus::Won
        } else {
            ParlayStatus::Lost
        };

        emit!(ParlaySettled {
            parlay: parlay_key,
            won: all_won,
        });

        Ok(())
    }

    /// Creator redeems their stake from a winning parlay.
    pub fn claim_parlay(ctx: Context<ClaimParlay>) -> Result<()> {
        let parlay = &ctx.accounts.parlay;
        require!(parlay.status == ParlayStatus::Won, TerracError::ParlayNotWon);

        let creator = parlay.creator;
        let nonce_le = parlay.nonce.to_le_bytes();
        let bump = parlay.bump;
        let stake = parlay.stake_usdc;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.parlay_vault.to_account_info(),
                    to: ctx.accounts.creator_ata.to_account_info(),
                    authority: ctx.accounts.parlay.to_account_info(),
                },
                &[&[b"parlay", creator.as_ref(), &nonce_le, &[bump]]],
            ),
            stake,
        )?;

        ctx.accounts.parlay.status = ParlayStatus::Claimed;

        emit!(ParlayClaimed {
            parlay: ctx.accounts.parlay.key(),
            creator,
            stake,
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Reads status byte and Option<u8> outcome from a raw Market account buffer.
/// Parses the borsh layout without deserialising the full struct to avoid the
/// Anchor remaining_accounts lifetime split (accounts vs remaining have separate
/// 'b / 'c lifetime params that prevent Account::try_from).
///
/// Returns (status_byte, outcome): status 2 = Settled.
fn read_market_status_outcome(data: &[u8]) -> Option<(u8, Option<u8>)> {
    let mut o: usize = 8; // skip 8-byte discriminator
    // question: u32 LE length prefix + bytes
    if o + 4 > data.len() { return None; }
    let q_len = u32::from_le_bytes([data[o], data[o+1], data[o+2], data[o+3]]) as usize;
    o += 4 + q_len;
    o += 8;  // expiry  i64
    o += 32; // creator Pubkey
    // outcome: Option<u8> — 1-byte tag; 1-byte value if Some(...)
    if o >= data.len() { return None; }
    let outcome = if data[o] == 1 {
        o += 1;
        if o >= data.len() { return None; }
        let v = data[o];
        o += 1;
        Some(v)
    } else {
        o += 1;
        None
    };
    // total_volume u64 + yes_volume u64 + no_volume u64 + vault Pubkey
    o += 8 + 8 + 8 + 32;
    // status: u8 enum (0=Open, 1=Closed, 2=Settled)
    if o >= data.len() { return None; }
    Some((data[o], outcome))
}

fn compute_badge(total_bets: u32, win_rate_bps: u16) -> BadgeTier {
    if total_bets >= 50 && win_rate_bps >= 6500 {
        BadgeTier::Legend
    } else if total_bets >= 10 && win_rate_bps >= 5500 {
        BadgeTier::Sharp
    } else {
        BadgeTier::Casual
    }
}

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(question: String, expiry: i64, nonce: u64)]
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
    pub vault: Account<'info, TokenAccount>,

    /// Bettor's USDC ATA — destination of payout
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

#[derive(Accounts)]
#[instruction(legs: Vec<ParlayLeg>, stake_usdc: u64, nonce: u64)]
pub struct CreateParlay<'info> {
    #[account(
        init,
        payer = creator,
        space = Parlay::SPACE,
        seeds = [b"parlay", creator.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub parlay: Account<'info, Parlay>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = usdc_mint,
        associated_token::authority = parlay,
    )]
    pub parlay_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = creator,
    )]
    pub creator_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleParlay<'info> {
    #[account(
        mut,
        seeds = [b"parlay", parlay.creator.as_ref(), &parlay.nonce.to_le_bytes()],
        bump = parlay.bump,
    )]
    pub parlay: Account<'info, Parlay>,
    // Leg market accounts passed as remaining_accounts (same order as parlay.legs)
}

#[derive(Accounts)]
pub struct ClaimParlay<'info> {
    #[account(
        mut,
        seeds = [b"parlay", creator.key().as_ref(), &parlay.nonce.to_le_bytes()],
        bump = parlay.bump,
        has_one = creator @ TerracError::Unauthorized,
    )]
    pub parlay: Account<'info, Parlay>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = parlay,
    )]
    pub parlay_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = creator,
    )]
    pub creator_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
pub struct Market {
    pub question: String,      // 4 + MAX_QUESTION_LEN
    pub expiry: i64,           // 8
    pub creator: Pubkey,       // 32
    pub outcome: Option<u8>,   // 1 + 1
    pub total_volume: u64,     // 8
    pub yes_volume: u64,       // 8  — sum of all Yes bets
    pub no_volume: u64,        // 8  — sum of all No bets
    pub vault: Pubkey,         // 32
    pub status: MarketStatus,  // 1
    pub nonce: u64,            // 8
    pub bump: u8,              // 1
}

impl Market {
    pub const SPACE: usize = 8           // discriminator
        + 4 + MAX_QUESTION_LEN           // question
        + 8                              // expiry
        + 32                             // creator
        + 1 + 1                          // outcome Option<u8>
        + 8                              // total_volume
        + 8                              // yes_volume
        + 8                              // no_volume
        + 32                             // vault
        + 1                              // status
        + 8                              // nonce
        + 1                              // bump
        + 16;                            // padding
}

#[account]
pub struct Bet {
    pub market: Pubkey,          // 32
    pub bettor: Pubkey,          // 32
    pub outcome: u8,             // 1
    pub amount: u64,             // 8
    pub claimed: bool,           // 1
    pub result_recorded: bool,   // 1  — true once reputation was updated (win or loss)
    pub bump: u8,                // 1
}

impl Bet {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1 + 1 + 15; // 15 padding
}

#[account]
pub struct Reputation {
    pub owner: Pubkey,            // 32
    pub total_bets: u32,          // 4
    pub winning_bets: u32,        // 4
    pub win_rate_bps: u16,        // 2  — basis points, e.g. 6500 = 65%
    pub current_streak: i16,      // 2  — positive = win streak, negative = loss streak
    pub badge_tier: BadgeTier,    // 1
    pub bump: u8,                 // 1
}

impl Reputation {
    pub const SPACE: usize = 8 + 32 + 4 + 4 + 2 + 2 + 1 + 1 + 16; // 16 padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ParlayLeg {
    pub market: Pubkey,  // 32
    pub outcome: u8,     // 1 — 0=No, 1=Yes
}

#[account]
pub struct Parlay {
    pub creator: Pubkey,       // 32
    pub legs: Vec<ParlayLeg>,  // 4 + MAX_PARLAY_LEGS * (32 + 1)
    pub stake_usdc: u64,       // 8
    pub status: ParlayStatus,  // 1
    pub nonce: u64,            // 8
    pub bump: u8,              // 1
}

impl Parlay {
    pub const SPACE: usize = 8                              // discriminator
        + 32                                                // creator
        + 4 + MAX_PARLAY_LEGS * (32 + 1)                   // legs vec
        + 8                                                 // stake_usdc
        + 1                                                 // status
        + 8                                                 // nonce
        + 1                                                 // bump
        + 16;                                               // padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ParlayStatus {
    Open,
    Won,
    Lost,
    Claimed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Open,
    Closed,
    Settled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum BadgeTier {
    #[default]
    Casual,  // < 10 bets or < 55% win rate
    Sharp,   // >= 10 bets and >= 55% win rate
    Legend,  // >= 50 bets and >= 65% win rate
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub expiry: i64,
    pub nonce: u64,
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub winning_outcome: u8,
}

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub payout: u64,
}

#[event]
pub struct ReputationUpdated {
    pub owner: Pubkey,
    pub total_bets: u32,
    pub winning_bets: u32,
    pub win_rate_bps: u16,
    pub badge_tier: BadgeTier,
}

#[event]
pub struct ParlayCreated {
    pub parlay: Pubkey,
    pub creator: Pubkey,
    pub n_legs: u8,
    pub stake_usdc: u64,
    pub nonce: u64,
}

#[event]
pub struct ParlaySettled {
    pub parlay: Pubkey,
    pub won: bool,
}

#[event]
pub struct ParlayClaimed {
    pub parlay: Pubkey,
    pub creator: Pubkey,
    pub stake: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum TerracError {
    #[msg("Question must be 1–200 characters")]
    InvalidQuestion,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market has passed its expiry")]
    MarketExpired,
    #[msg("Outcome must be 0 (No) or 1 (Yes)")]
    InvalidOutcome,
    #[msg("Bet is below the minimum of 0.1 USDC")]
    BetTooSmall,
    #[msg("Cannot top up a bet with a different outcome")]
    OutcomeMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Only the market creator can perform this action")]
    Unauthorized,
    #[msg("Market is not settled yet")]
    MarketNotSettled,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("This bet did not win")]
    BetDidNotWin,
    #[msg("No volume on the winning side — nothing to claim")]
    ZeroWinningVolume,
    #[msg("Reputation already recorded for this bet")]
    AlreadyRecorded,
    #[msg("Bet was a winner — use claim_winnings instead")]
    BetWasWinner,
    #[msg("Parlay must have 2–8 legs")]
    InvalidParlayLegs,
    #[msg("Parlay is not open")]
    ParlayNotOpen,
    #[msg("Parlay was not won")]
    ParlayNotWon,
    #[msg("Provided market account does not match parlay leg")]
    MarketMismatch,
}

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("9TERRACExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

const MAX_QUESTION_LEN: usize = 200;
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

        let bet = &mut ctx.accounts.bet;
        // If this is the first bet for this (market, bettor) the account is freshly init'd.
        // If init_if_needed fires again on a re-bet the values are overwritten — see constraint below.
        if bet.amount == 0 {
            bet.market = market.key();
            bet.bettor = ctx.accounts.bettor.key();
            bet.outcome = outcome;
            bet.bump = ctx.bumps.bet;
        } else {
            // Accumulate only if same outcome; reject mixed-outcome top-ups to keep accounting simple.
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
    /// Only the market creator can settle. Claim logic (pro-rata payout) is Phase 2.
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

    /// Bettor's USDC token account (must have enough balance)
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
    pub vault: Pubkey,         // 32
    pub status: MarketStatus,  // 1
    pub nonce: u64,            // 8
    pub bump: u8,              // 1
}

impl Market {
    pub const SPACE: usize = 8          // discriminator
        + 4 + MAX_QUESTION_LEN          // question
        + 8                             // expiry
        + 32                            // creator
        + 1 + 1                         // outcome (Option<u8>)
        + 8                             // total_volume
        + 32                            // vault
        + 1                             // status
        + 8                             // nonce
        + 1                             // bump
        + 32;                           // padding
}

#[account]
pub struct Bet {
    pub market: Pubkey,   // 32
    pub bettor: Pubkey,   // 32
    pub outcome: u8,      // 1
    pub amount: u64,      // 8
    pub claimed: bool,    // 1
    pub bump: u8,         // 1
}

impl Bet {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1 + 16; // 16 padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Open,
    Closed,
    Settled,
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
}

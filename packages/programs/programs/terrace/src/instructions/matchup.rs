use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::{
    constants::*,
    errors::TerracError,
    events::*,
    state::*,
};

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(opponent: Pubkey, challenger_outcome: u8, stake_usdc: u64, nonce: u64)]
pub struct CreateMatchup<'info> {
    #[account(
        init,
        payer = challenger,
        space = Matchup::SPACE,
        seeds = [b"matchup", challenger.key().as_ref(), market.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub matchup: Account<'info, Matchup>,

    #[account(
        init,
        payer = challenger,
        associated_token::mint = usdc_mint,
        associated_token::authority = matchup,
    )]
    pub matchup_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = challenger,
    )]
    pub challenger_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
        constraint = market.status == MarketStatus::Open @ TerracError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub challenger: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptMatchup<'info> {
    #[account(
        mut,
        seeds = [
            b"matchup",
            matchup.challenger.as_ref(),
            matchup.market.as_ref(),
            &matchup.nonce.to_le_bytes(),
        ],
        bump = matchup.bump,
    )]
    pub matchup: Account<'info, Matchup>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = matchup,
    )]
    pub matchup_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = opponent,
    )]
    pub opponent_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub opponent: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMatchup<'info> {
    #[account(
        mut,
        seeds = [
            b"matchup",
            matchup.challenger.as_ref(),
            matchup.market.as_ref(),
            &matchup.nonce.to_le_bytes(),
        ],
        bump = matchup.bump,
    )]
    pub matchup: Account<'info, Matchup>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
        constraint = market.key() == matchup.market @ TerracError::MarketMismatch,
        constraint = market.status == MarketStatus::Settled @ TerracError::MarketNotSettled,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = matchup,
    )]
    pub matchup_vault: Account<'info, TokenAccount>,

    /// Challenger's ATA — receives payout if challenger wins.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = challenger,
    )]
    pub challenger_ata: Account<'info, TokenAccount>,

    /// Opponent's ATA — receives payout if opponent wins.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = opponent,
    )]
    pub opponent_ata: Account<'info, TokenAccount>,

    /// CHECK: key validated against matchup.challenger in instruction.
    #[account(constraint = challenger.key() == matchup.challenger @ TerracError::Unauthorized)]
    pub challenger: UncheckedAccount<'info>,

    /// CHECK: key validated against matchup.opponent in instruction.
    #[account(constraint = opponent.key() == matchup.opponent @ TerracError::Unauthorized)]
    pub opponent: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeclineMatchup<'info> {
    #[account(
        mut,
        seeds = [
            b"matchup",
            matchup.challenger.as_ref(),
            matchup.market.as_ref(),
            &matchup.nonce.to_le_bytes(),
        ],
        bump = matchup.bump,
    )]
    pub matchup: Account<'info, Matchup>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = matchup,
    )]
    pub matchup_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = challenger,
    )]
    pub challenger_ata: Account<'info, TokenAccount>,

    /// CHECK: key validated against matchup.challenger in instruction.
    #[account(constraint = challenger.key() == matchup.challenger @ TerracError::Unauthorized)]
    pub challenger: UncheckedAccount<'info>,

    /// Either opponent or challenger can decline/cancel.
    pub signer: Signer<'info>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Handler functions
// ---------------------------------------------------------------------------

/// Create a 1v1 matchup challenge against a specific opponent on an open market.
/// Challenger escrows stake_usdc into the matchup vault. Opponent must accept
/// (also escrow stake_usdc) for the matchup to become active.
pub fn create_matchup(
    ctx: Context<CreateMatchup>,
    opponent: Pubkey,
    challenger_outcome: u8,
    stake_usdc: u64,
    nonce: u64,
) -> Result<()> {
    require!(challenger_outcome <= 1, TerracError::InvalidOutcome);
    require!(stake_usdc >= MIN_BET, TerracError::BetTooSmall);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.challenger_ata.to_account_info(),
                to: ctx.accounts.matchup_vault.to_account_info(),
                authority: ctx.accounts.challenger.to_account_info(),
            },
        ),
        stake_usdc,
    )?;

    let matchup = &mut ctx.accounts.matchup;
    matchup.challenger = ctx.accounts.challenger.key();
    matchup.opponent = opponent;
    matchup.market = ctx.accounts.market.key();
    matchup.challenger_outcome = challenger_outcome;
    matchup.stake_usdc = stake_usdc;
    matchup.status = MatchupStatus::Pending;
    matchup.nonce = nonce;
    matchup.bump = ctx.bumps.matchup;

    emit!(MatchupCreated {
        matchup: matchup.key(),
        challenger: matchup.challenger,
        opponent,
        market: matchup.market,
        challenger_outcome,
        stake_usdc,
    });

    Ok(())
}

/// Opponent accepts a pending matchup challenge, escrows their stake.
/// Opponent's outcome is the opposite of the challenger's.
pub fn accept_matchup(ctx: Context<AcceptMatchup>) -> Result<()> {
    require!(
        ctx.accounts.matchup.status == MatchupStatus::Pending,
        TerracError::MatchupNotPending
    );
    require!(
        ctx.accounts.opponent.key() == ctx.accounts.matchup.opponent,
        TerracError::Unauthorized
    );

    let stake = ctx.accounts.matchup.stake_usdc;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.opponent_ata.to_account_info(),
                to: ctx.accounts.matchup_vault.to_account_info(),
                authority: ctx.accounts.opponent.to_account_info(),
            },
        ),
        stake,
    )?;

    ctx.accounts.matchup.status = MatchupStatus::Accepted;

    emit!(MatchupAccepted {
        matchup: ctx.accounts.matchup.key(),
        opponent: ctx.accounts.opponent.key(),
    });

    Ok(())
}

/// Permissionless settlement once the underlying market is settled.
/// Winner (challenger if they picked correctly, else opponent) receives 2× stake.
pub fn settle_matchup(ctx: Context<SettleMatchup>) -> Result<()> {
    require!(
        ctx.accounts.matchup.status == MatchupStatus::Accepted,
        TerracError::MatchupNotAccepted
    );

    let outcome = ctx.accounts.market.outcome.ok_or(TerracError::MarketNotSettled)?;
    let challenger_outcome = ctx.accounts.matchup.challenger_outcome;
    let challenger_wins = outcome == challenger_outcome;
    let payout = ctx.accounts.matchup
        .stake_usdc
        .checked_mul(2)
        .ok_or(TerracError::Overflow)?;

    let challenger = ctx.accounts.matchup.challenger;
    let market_key = ctx.accounts.matchup.market;
    let nonce_le = ctx.accounts.matchup.nonce.to_le_bytes();
    let bump = ctx.accounts.matchup.bump;
    let matchup_key = ctx.accounts.matchup.key();

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"matchup",
        challenger.as_ref(),
        market_key.as_ref(),
        &nonce_le,
        &[bump],
    ]];

    let winner_ata = if challenger_wins {
        require!(
            ctx.accounts.challenger_ata.owner == challenger,
            TerracError::Unauthorized
        );
        ctx.accounts.challenger_ata.to_account_info()
    } else {
        require!(
            ctx.accounts.opponent_ata.owner == ctx.accounts.matchup.opponent,
            TerracError::Unauthorized
        );
        ctx.accounts.opponent_ata.to_account_info()
    };

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.matchup_vault.to_account_info(),
                to: winner_ata,
                authority: ctx.accounts.matchup.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    ctx.accounts.matchup.status = MatchupStatus::Settled;
    let winner = if challenger_wins { challenger } else { ctx.accounts.matchup.opponent };

    emit!(MatchupSettled {
        matchup: matchup_key,
        winner,
        payout,
    });

    Ok(())
}

/// Opponent declines (or challenger cancels) a pending matchup.
/// Challenger's escrowed stake is refunded.
pub fn decline_matchup(ctx: Context<DeclineMatchup>) -> Result<()> {
    require!(
        ctx.accounts.matchup.status == MatchupStatus::Pending,
        TerracError::MatchupNotPending
    );
    let signer_key = ctx.accounts.signer.key();
    require!(
        signer_key == ctx.accounts.matchup.opponent
            || signer_key == ctx.accounts.matchup.challenger,
        TerracError::Unauthorized
    );

    let stake = ctx.accounts.matchup.stake_usdc;
    let challenger = ctx.accounts.matchup.challenger;
    let market_key = ctx.accounts.matchup.market;
    let nonce_le = ctx.accounts.matchup.nonce.to_le_bytes();
    let bump = ctx.accounts.matchup.bump;
    let matchup_key = ctx.accounts.matchup.key();

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.matchup_vault.to_account_info(),
                to: ctx.accounts.challenger_ata.to_account_info(),
                authority: ctx.accounts.matchup.to_account_info(),
            },
            &[&[
                b"matchup",
                challenger.as_ref(),
                market_key.as_ref(),
                &nonce_le,
                &[bump],
            ]],
        ),
        stake,
    )?;

    ctx.accounts.matchup.status = MatchupStatus::Declined;

    emit!(MatchupDeclined {
        matchup: matchup_key,
        signer: signer_key,
    });

    Ok(())
}

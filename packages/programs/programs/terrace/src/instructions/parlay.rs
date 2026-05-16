use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::{
    constants::*,
    errors::TerracError,
    events::*,
    helpers::read_market_status_outcome,
    state::*,
};

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

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
// Handler functions
// ---------------------------------------------------------------------------

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

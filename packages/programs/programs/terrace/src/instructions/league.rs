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
#[instruction(name: String, season: u16, is_private: bool, entry_fee_usdc: u64, max_members: u8, nonce: u64)]
pub struct CreateLeague<'info> {
    #[account(
        init,
        payer = creator,
        space = League::SPACE,
        seeds = [b"league", creator.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub league: Account<'info, League>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = usdc_mint,
        associated_token::authority = league,
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
pub struct JoinLeague<'info> {
    #[account(
        mut,
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
    )]
    pub league: Account<'info, League>,

    #[account(
        init,
        payer = member,
        space = LeagueMember::SPACE,
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub league_member: Account<'info, LeagueMember>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = member,
    )]
    pub member_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = league,
    )]
    pub league_vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub member: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordLeagueWin<'info> {
    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
    )]
    pub league: Account<'info, League>,

    #[account(
        mut,
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump = league_member.bump,
        constraint = league_member.member == member.key() @ TerracError::NotLeagueMember,
    )]
    pub league_member: Account<'info, LeagueMember>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"bet", market.key().as_ref(), member.key().as_ref()],
        bump = bet.bump,
        constraint = bet.bettor == member.key() @ TerracError::Unauthorized,
        constraint = bet.market == market.key() @ TerracError::MarketMismatch,
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        init,
        payer = member,
        space = LeagueScoreRecord::SPACE,
        seeds = [b"league_score", league.key().as_ref(), bet.key().as_ref()],
        bump,
    )]
    pub score_record: Account<'info, LeagueScoreRecord>,

    #[account(mut)]
    pub member: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdvanceGameweek<'info> {
    #[account(
        mut,
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
    )]
    pub league: Account<'info, League>,

    pub creator: Signer<'info>,
}

// ---------------------------------------------------------------------------
// Handler functions
// ---------------------------------------------------------------------------

/// Create a weekly leaderboard league.
/// `is_private` reserves the Arcium-encrypted standings path (circuit wired in a follow-on sprint).
/// `entry_fee_usdc` == 0 means free-to-join; any positive value is transferred to the league vault at join time.
pub fn create_league(
    ctx: Context<CreateLeague>,
    name: String,
    season: u16,
    is_private: bool,
    entry_fee_usdc: u64,
    max_members: u8,
    nonce: u64,
) -> Result<()> {
    require!(!name.is_empty() && name.len() <= MAX_LEAGUE_NAME_LEN, TerracError::LeagueNameTooLong);
    require!(max_members >= 2, TerracError::LeagueMaxMembersInvalid);

    let league = &mut ctx.accounts.league;
    league.creator = ctx.accounts.creator.key();
    league.name = name.clone();
    league.season = season;
    league.gameweek = 1;
    league.member_count = 0;
    league.max_members = max_members;
    league.is_private = is_private;
    league.entry_fee_usdc = entry_fee_usdc;
    league.prize_pool = 0;
    league.vault = ctx.accounts.vault.key();
    league.status = LeagueStatus::Active;
    league.nonce = nonce;
    league.bump = ctx.bumps.league;

    emit!(LeagueCreated {
        league: league.key(),
        creator: ctx.accounts.creator.key(),
        name,
        season,
        is_private,
        nonce,
    });

    Ok(())
}

/// Join an active league. Creates a LeagueMember PDA and optionally transfers the entry fee.
pub fn join_league(ctx: Context<JoinLeague>) -> Result<()> {
    let league = &mut ctx.accounts.league;
    require!(league.status == LeagueStatus::Active, TerracError::LeagueNotActive);
    require!(league.member_count < league.max_members, TerracError::LeagueFull);

    let member_key = ctx.accounts.member.key();

    let lm = &mut ctx.accounts.league_member;
    lm.league = league.key();
    lm.member = member_key;
    lm.member_slot = league.member_count; // slot = position before increment (0-indexed)
    lm.gameweek_score = 0;
    lm.total_score = 0;
    lm.last_scored_gameweek = 0;
    lm.bump = ctx.bumps.league_member;

    // Transfer entry fee if set
    if league.entry_fee_usdc > 0 {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.member_ata.to_account_info(),
                to: ctx.accounts.league_vault.to_account_info(),
                authority: ctx.accounts.member.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, league.entry_fee_usdc)?;
        league.prize_pool = league.prize_pool.checked_add(league.entry_fee_usdc)
            .ok_or(TerracError::Overflow)?;
    }

    league.member_count = league.member_count.checked_add(1).ok_or(TerracError::Overflow)?;

    emit!(LeagueJoined {
        league: league.key(),
        member: member_key,
        gameweek: league.gameweek,
    });

    Ok(())
}

/// Record a winning bet as a league score point.
/// Verifies the market is settled and the bet picked the winning side.
/// A `LeagueScoreRecord` PDA is initialised to prevent double-counting the same bet.
pub fn record_league_win(ctx: Context<RecordLeagueWin>) -> Result<()> {
    let market = &ctx.accounts.market;
    let bet = &ctx.accounts.bet;
    let league = &ctx.accounts.league;
    let lm = &mut ctx.accounts.league_member;

    require!(market.status == MarketStatus::Settled, TerracError::MarketNotSettled);
    require!(bet.market == market.key(), TerracError::MarketMismatch);
    require!(bet.bettor == ctx.accounts.member.key(), TerracError::NotLeagueMember);

    let winning_outcome = market.outcome.ok_or(TerracError::MarketNotSettled)?;
    require!(bet.outcome == winning_outcome, TerracError::BetDidNotWin);

    // Initialise score record PDA — will fail if already exists (init guard)
    ctx.accounts.score_record.bump = ctx.bumps.score_record;

    // If the gameweek has advanced since last score, reset weekly counter
    if lm.last_scored_gameweek != league.gameweek {
        lm.gameweek_score = 0;
        lm.last_scored_gameweek = league.gameweek;
    }

    lm.gameweek_score = lm.gameweek_score.checked_add(1).ok_or(TerracError::Overflow)?;
    lm.total_score = lm.total_score.checked_add(1).ok_or(TerracError::Overflow)?;

    emit!(LeagueWinRecorded {
        league: league.key(),
        member: ctx.accounts.member.key(),
        market: market.key(),
        gameweek: league.gameweek,
        gameweek_score: lm.gameweek_score,
        total_score: lm.total_score,
    });

    Ok(())
}

/// Advance the league to the next gameweek. Only the league creator can call this.
/// Members' `gameweek_score` resets lazily on their next `record_league_win` call.
pub fn advance_gameweek(ctx: Context<AdvanceGameweek>) -> Result<()> {
    let league = &mut ctx.accounts.league;
    require!(
        ctx.accounts.creator.key() == league.creator,
        TerracError::OnlyCreatorCanAdvanceGameweek
    );
    require!(league.status == LeagueStatus::Active, TerracError::LeagueNotActive);

    let prev = league.gameweek;
    league.gameweek = league.gameweek.checked_add(1).ok_or(TerracError::Overflow)?;

    emit!(GameweekAdvanced {
        league: league.key(),
        prev_gameweek: prev,
        new_gameweek: league.gameweek,
    });

    Ok(())
}

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use arcium_macros::{
    init_computation_definition_accounts, queue_computation_accounts,
};
use crate::{
    constants::*,
    errors::TerracError,
    state::*,
};
use crate::{ID, ID_CONST, ArciumSignerAccount};
use crate::{
    InitMemberScoreV2Output,
    IncrementMemberScoreV2Output,
    RevealMemberScoreV2Output,
    RecordPrivateLeagueWinV2Output,
};

#[allow(dead_code)]
type ErrorCode = TerracError;

// ---------------------------------------------------------------------------
// Comp-def init contexts (one-time setup per circuit)
// ---------------------------------------------------------------------------

#[init_computation_definition_accounts("init_member_score_v2", payer)]
#[derive(Accounts)]
pub struct InitInitMemberScoreCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account initialised by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: address lookup table for Arcium CPI calls.
    pub address_lookup_table: UncheckedAccount<'info>,
    /// CHECK: Solana address lookup table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("increment_member_score_v2", payer)]
#[derive(Accounts)]
pub struct InitIncrementMemberScoreCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account initialised by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: address lookup table for Arcium CPI calls.
    pub address_lookup_table: UncheckedAccount<'info>,
    /// CHECK: Solana address lookup table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("reveal_member_score_v2", payer)]
#[derive(Accounts)]
pub struct InitRevealMemberScoreCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account initialised by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: address lookup table for Arcium CPI calls.
    pub address_lookup_table: UncheckedAccount<'info>,
    /// CHECK: Solana address lookup table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("record_private_league_win_v2", payer)]
#[derive(Accounts)]
pub struct InitRecordPrivateLeagueWinV2CompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account initialised by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: address lookup table for Arcium CPI calls.
    pub address_lookup_table: UncheckedAccount<'info>,
    /// CHECK: Solana address lookup table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// InitMemberScore — member joins private league, creates their encrypted score PDA
// Called once per member on joining. Queues init_member_score MXE to set score to 0.
// ---------------------------------------------------------------------------

#[queue_computation_accounts("init_member_score_v2", member)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct InitMemberScore<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    /// CHECK: Arcium mempool PDA.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Arcium executing pool PDA.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: computation account, initialised by queue_computation CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_INIT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
        constraint = league.is_private @ TerracError::MarketNotPrivate,
        constraint = league.status == LeagueStatus::Active @ TerracError::LeagueNotActive,
    )]
    pub league: Box<Account<'info, League>>,

    #[account(
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump = league_member.bump,
        constraint = league_member.member == member.key() @ TerracError::NotLeagueMember,
    )]
    pub league_member: Box<Account<'info, LeagueMember>>,

    #[account(
        init,
        payer = member,
        space = PrivateMemberScore::SPACE,
        seeds = [b"member-score", league.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub member_score: Box<Account<'info, PrivateMemberScore>>,
}

// ---------------------------------------------------------------------------
// ResetMemberScore — re-init encrypted score to 0 for a new gameweek.
// Uses the same init_member_score circuit. Called after reveal, before next GW's wins.
// ---------------------------------------------------------------------------

#[queue_computation_accounts("init_member_score_v2", member)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ResetMemberScore<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    /// CHECK: Arcium mempool PDA.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Arcium executing pool PDA.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: computation account, initialised by queue_computation CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_INIT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
        constraint = league.is_private @ TerracError::MarketNotPrivate,
    )]
    pub league: Box<Account<'info, League>>,

    #[account(
        mut,
        seeds = [b"member-score", league.key().as_ref(), member.key().as_ref()],
        bump = member_score.bump,
        constraint = member_score.member == member.key() @ TerracError::Unauthorized,
        constraint = member_score.is_revealed @ TerracError::ScoreNotRevealed,
    )]
    pub member_score: Box<Account<'info, PrivateMemberScore>>,
}

// ---------------------------------------------------------------------------
// RecordPrivateLeagueWin — queues increment_member_score MXE circuit
// ---------------------------------------------------------------------------

#[queue_computation_accounts("increment_member_score_v2", member)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RecordPrivateLeagueWin<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    /// CHECK: Arcium mempool PDA.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Arcium executing pool PDA.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: computation account, initialised by queue_computation CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_SCORE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
        constraint = league.is_private @ TerracError::MarketNotPrivate,
        constraint = league.status == LeagueStatus::Active @ TerracError::LeagueNotActive,
    )]
    pub league: Box<Account<'info, League>>,

    #[account(
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump = league_member.bump,
        constraint = league_member.member == member.key() @ TerracError::NotLeagueMember,
    )]
    pub league_member: Box<Account<'info, LeagueMember>>,

    #[account(
        mut,
        seeds = [b"member-score", league.key().as_ref(), member.key().as_ref()],
        bump = member_score.bump,
        constraint = member_score.member == member.key() @ TerracError::Unauthorized,
        constraint = member_score.scores_gameweek == league.gameweek @ TerracError::MustResetScore,
        constraint = !member_score.is_revealed @ TerracError::ScoreAlreadyRevealed,
    )]
    pub member_score: Box<Account<'info, PrivateMemberScore>>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        seeds = [b"bet", market.key().as_ref(), member.key().as_ref()],
        bump = bet.bump,
        constraint = bet.bettor == member.key() @ TerracError::Unauthorized,
        constraint = bet.market == market.key() @ TerracError::MarketMismatch,
    )]
    pub bet: Box<Account<'info, Bet>>,

    #[account(
        init,
        payer = member,
        space = LeagueScoreRecord::SPACE,
        seeds = [b"league_score", league.key().as_ref(), bet.key().as_ref()],
        bump,
    )]
    pub score_record: Box<Account<'info, LeagueScoreRecord>>,
}

// ---------------------------------------------------------------------------
// RevealMemberScore — member reveals their own score after GW advances
// Queues reveal_member_score MXE. Callback applies score to LeagueMember.
// ---------------------------------------------------------------------------

#[queue_computation_accounts("reveal_member_score_v2", member)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RevealMemberScore<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    /// CHECK: Arcium mempool PDA.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Arcium executing pool PDA.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: computation account, initialised by queue_computation CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_REVEAL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
        constraint = league.is_private @ TerracError::MarketNotPrivate,
    )]
    pub league: Box<Account<'info, League>>,

    #[account(
        mut,
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump = league_member.bump,
        constraint = league_member.member == member.key() @ TerracError::NotLeagueMember,
    )]
    pub league_member: Box<Account<'info, LeagueMember>>,

    #[account(
        mut,
        seeds = [b"member-score", league.key().as_ref(), member.key().as_ref()],
        bump = member_score.bump,
        constraint = member_score.member == member.key() @ TerracError::Unauthorized,
        // GW must have advanced past the score's gameweek before revealing
        constraint = league.gameweek > member_score.scores_gameweek @ TerracError::LeagueNotActive,
        constraint = !member_score.is_revealed @ TerracError::ScoreAlreadyRevealed,
    )]
    pub member_score: Box<Account<'info, PrivateMemberScore>>,
}

// ---------------------------------------------------------------------------
// Handler functions
// ---------------------------------------------------------------------------

pub fn init_init_member_score_comp_def(ctx: Context<InitInitMemberScoreCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

pub fn init_increment_member_score_comp_def(ctx: Context<InitIncrementMemberScoreCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

pub fn init_reveal_member_score_comp_def(ctx: Context<InitRevealMemberScoreCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

pub fn init_record_private_league_win_v2_comp_def(ctx: Context<InitRecordPrivateLeagueWinV2CompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

/// Create the PrivateMemberScore PDA and queue init_member_score MXE (encrypted 0).
/// Called by each member after joining a private league.
pub fn init_member_score(
    ctx: Context<InitMemberScore>,
    computation_offset: u64,
    nonce: u128,
) -> Result<()> {
    let score = &mut ctx.accounts.member_score;
    score.league = ctx.accounts.league.key();
    score.member = ctx.accounts.member.key();
    score.nonce = nonce;
    score.scores_gameweek = ctx.accounts.league.gameweek;
    score.is_revealed = false;
    score.bump = ctx.bumps.member_score;

    let args = ArgBuilder::new()
        .plaintext_u128(nonce)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::InitMemberScoreV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.member_score.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn init_member_score_callback(
    ctx: Context<crate::InitMemberScoreV2Callback>,
    output: SignedComputationOutputs<InitMemberScoreV2Output>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(o) => o,
        Err(e) => return Err(e),
    };

    let score = &mut ctx.accounts.member_score;
    score.encrypted_score = o.field_0.ciphertexts[0];
    score.nonce = o.field_0.nonce;
    Ok(())
}

/// Re-initialise encrypted score to 0 for a new gameweek.
/// Member must have already revealed (is_revealed = true) before calling.
pub fn reset_member_score(
    ctx: Context<ResetMemberScore>,
    computation_offset: u64,
    nonce: u128,
) -> Result<()> {
    let score = &mut ctx.accounts.member_score;
    score.nonce = nonce;
    score.scores_gameweek = ctx.accounts.league.gameweek;
    score.is_revealed = false;

    let args = ArgBuilder::new()
        .plaintext_u128(nonce)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::InitMemberScoreV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.member_score.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

/// Record a win for a private league member. Queues the increment_member_score MXE circuit.
/// Verifies: market settled, bet won, score not already recorded, GW matches.
pub fn record_private_league_win(
    ctx: Context<RecordPrivateLeagueWin>,
    computation_offset: u64,
) -> Result<()> {
    let market = &ctx.accounts.market;
    let bet = &ctx.accounts.bet;

    require!(market.status == MarketStatus::Settled, TerracError::MarketNotSettled);
    require!(bet.market == market.key(), TerracError::MarketMismatch);

    let winning_outcome = market.outcome.ok_or(TerracError::MarketNotSettled)?;
    require!(bet.outcome == winning_outcome, TerracError::BetDidNotWin);

    ctx.accounts.score_record.bump = ctx.bumps.score_record;

    let current_nonce = ctx.accounts.member_score.nonce;

    let args = ArgBuilder::new()
        .plaintext_u128(current_nonce)
        .account(
            ctx.accounts.member_score.key(),
            MEMBER_SCORE_OFFSET,
            MEMBER_SCORE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::IncrementMemberScoreV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.member_score.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn increment_member_score_callback(
    ctx: Context<crate::IncrementMemberScoreV2Callback>,
    output: SignedComputationOutputs<IncrementMemberScoreV2Output>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(o) => o,
        Err(_) => return Err(TerracError::AbortedComputation.into()),
    };

    let score = &mut ctx.accounts.member_score;
    score.encrypted_score = o.field_0.ciphertexts[0];
    score.nonce = o.field_0.nonce;
    Ok(())
}

/// Member reveals their own encrypted score after the gameweek has advanced.
/// Queues reveal_member_score MXE. Callback applies score to LeagueMember.
pub fn reveal_member_score(
    ctx: Context<RevealMemberScore>,
    computation_offset: u64,
) -> Result<()> {
    let current_nonce = ctx.accounts.member_score.nonce;

    let args = ArgBuilder::new()
        .plaintext_u128(current_nonce)
        .account(
            ctx.accounts.member_score.key(),
            MEMBER_SCORE_OFFSET,
            MEMBER_SCORE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::RevealMemberScoreV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.member_score.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.league_member.key(),
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn reveal_member_score_callback(
    ctx: Context<crate::RevealMemberScoreV2Callback>,
    output: SignedComputationOutputs<RevealMemberScoreV2Output>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(o) => o,
        Err(_) => return Err(TerracError::AbortedComputation.into()),
    };

    let gw_score = o.field_0 as u32;

    let lm = &mut ctx.accounts.league_member;
    let revealed_gw = ctx.accounts.member_score.scores_gameweek;

    if lm.last_scored_gameweek != revealed_gw {
        lm.gameweek_score = 0;
        lm.last_scored_gameweek = revealed_gw;
    }
    lm.gameweek_score = lm.gameweek_score.checked_add(gw_score).ok_or(TerracError::Overflow)?;
    lm.total_score = lm.total_score.checked_add(gw_score).ok_or(TerracError::Overflow)?;

    ctx.accounts.member_score.is_revealed = true;
    Ok(())
}

// ---------------------------------------------------------------------------
// RecordPrivateLeagueWinV2 — score a private-market bet without revealing outcome
//
// Stronger privacy path: re-uses the Enc<Shared, (u8,u64)> stored at bet time.
// The circuit checks encrypted_outcome == public winning_outcome inside Arcium
// and only increments the Enc<Mxe, u64> score if they match.
// The bettor's outcome choice is NEVER revealed on-chain by this instruction.
// ---------------------------------------------------------------------------

#[queue_computation_accounts("record_private_league_win_v2", member)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RecordPrivateLeagueWinV2<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    /// CHECK: Arcium mempool PDA.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Arcium executing pool PDA.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: computation account, initialised by queue_computation CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PRIVATE_LEAGUE_WIN))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        seeds = [b"league", league.creator.as_ref(), &league.nonce.to_le_bytes()],
        bump = league.bump,
        constraint = league.is_private @ TerracError::MarketNotPrivate,
        constraint = league.status == LeagueStatus::Active @ TerracError::LeagueNotActive,
    )]
    pub league: Box<Account<'info, League>>,

    #[account(
        seeds = [b"league_member", league.key().as_ref(), member.key().as_ref()],
        bump = league_member.bump,
        constraint = league_member.member == member.key() @ TerracError::NotLeagueMember,
    )]
    pub league_member: Box<Account<'info, LeagueMember>>,

    #[account(
        mut,
        seeds = [b"member-score", league.key().as_ref(), member.key().as_ref()],
        bump = member_score.bump,
        constraint = member_score.member == member.key() @ TerracError::Unauthorized,
        constraint = member_score.scores_gameweek == league.gameweek @ TerracError::MustResetScore,
        constraint = !member_score.is_revealed @ TerracError::ScoreAlreadyRevealed,
    )]
    pub member_score: Box<Account<'info, PrivateMemberScore>>,

    /// The private market on which the bet was placed (must be revealed/settled).
    #[account(
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
        constraint = market.status == MarketStatus::Settled @ TerracError::MarketNotSettled,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Ensures the private totals have been revealed so the winning_outcome is known.
    #[account(
        seeds = [b"private-state", market.key().as_ref()],
        bump = private_state.bump,
        constraint = private_state.is_revealed @ TerracError::NotYetRevealed,
        constraint = private_state.market == market.key() @ TerracError::MarketMismatch,
    )]
    pub private_state: Box<Account<'info, PrivateMarketState>>,

    /// The bettor's encrypted bet record; stores outcome_ct, amount_ct, encryption_pubkey, bet_nonce.
    #[account(
        seeds = [b"private-bet", market.key().as_ref(), member.key().as_ref()],
        bump = private_bet_record.bump,
        constraint = private_bet_record.bettor == member.key() @ TerracError::Unauthorized,
        constraint = private_bet_record.market == market.key() @ TerracError::MarketMismatch,
    )]
    pub private_bet_record: Box<Account<'info, PrivateBetRecord>>,

    /// Idempotency guard — init fails if this bet was already scored.
    #[account(
        init,
        payer = member,
        space = LeagueScoreRecord::SPACE,
        seeds = [b"league_score", league.key().as_ref(), private_bet_record.key().as_ref()],
        bump,
    )]
    pub score_record: Box<Account<'info, LeagueScoreRecord>>,
}

/// Queue the record_private_league_win_v2 MPC circuit.
/// The winning_outcome (from the revealed private market) and the bettor's
/// encrypted (outcome, amount) are passed to Arcium. The circuit internally
/// checks outcome == winning_outcome and conditionally increments the score.
pub fn record_private_league_win_v2(
    ctx: Context<RecordPrivateLeagueWinV2>,
    computation_offset: u64,
) -> Result<()> {
    let market = &ctx.accounts.market;
    let record = &ctx.accounts.private_bet_record;

    let winning_outcome = market.outcome.ok_or(TerracError::MarketNotSettled)?;

    ctx.accounts.score_record.bump = ctx.bumps.score_record;

    let score_nonce = ctx.accounts.member_score.nonce;

    let args = ArgBuilder::new()
        // Enc<Shared, (u8, u64)> — same encoding used in place_private_bet
        .x25519_pubkey(record.encryption_pubkey)
        .plaintext_u128(record.bet_nonce)
        .encrypted_u8(record.outcome_ct)     // field 0: outcome (u8)
        .encrypted_u64(record.amount_ct)     // field 1: amount (u64)
        // public winning_outcome — MPC checks this against decrypted outcome
        .plaintext_u8(winning_outcome)
        // Enc<Mxe, u64> — current encrypted score
        .plaintext_u128(score_nonce)
        .account(
            ctx.accounts.member_score.key(),
            MEMBER_SCORE_OFFSET,
            MEMBER_SCORE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::RecordPrivateLeagueWinV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.member_score.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn record_private_league_win_v2_callback(
    ctx: Context<crate::RecordPrivateLeagueWinV2Callback>,
    output: SignedComputationOutputs<RecordPrivateLeagueWinV2Output>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(o) => o,
        Err(e) => return Err(e),
    };

    let score = &mut ctx.accounts.member_score;
    score.encrypted_score = o.field_0.ciphertexts[0];
    score.nonce = o.field_0.nonce;
    Ok(())
}

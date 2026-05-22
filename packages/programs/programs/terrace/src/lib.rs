use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::{arcium_callback, arcium_program, callback_accounts};

pub mod constants;
pub mod errors;
pub mod events;
pub mod helpers;
pub mod state;
pub mod instructions;

use constants::*;
use errors::*;
use state::*;

// Re-export generated __client_accounts_* types from each instruction submodule
// so that the #[arcium_program] macro can find them at the crate root.
pub use instructions::market::*;
pub use instructions::parlay::*;
pub use instructions::matchup::*;
pub use instructions::private::*;
pub use instructions::league::*;
pub use instructions::league_private::*;

declare_id!("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

// arcium-macros callback_accounts generates `ErrorCode::ClusterNotSet` — alias our error type
#[allow(dead_code)]
type ErrorCode = TerracError;

// ---------------------------------------------------------------------------
// Arcium callback account structs — must live at crate root for the
// arcium_program macro to resolve __client_accounts_* at `crate::` level.
// ---------------------------------------------------------------------------

#[callback_accounts("init_private_market_state_v8")]
#[derive(Accounts)]
pub struct InitPrivateMarketStateV8Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium; verified by the callback CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar, address-constrained above.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"private-state", private_state.market.as_ref()],
        bump = private_state.bump,
    )]
    pub private_state: Account<'info, PrivateMarketState>,
}

#[callback_accounts("place_private_bet_v8")]
#[derive(Accounts)]
pub struct PlacePrivateBetV8Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_BET))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: computation account managed by Arcium; verified by the callback CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar, address-constrained above.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"private-state", private_state.market.as_ref()],
        bump = private_state.bump,
    )]
    pub private_state: Box<Account<'info, PrivateMarketState>>,
    // Written in the callback to persist the Mxe-sealed outcome ciphertext.
    // The bettor's pubkey is read from the record itself (it was set on init).
    #[account(
        mut,
        seeds = [b"private-bet", private_bet_record.market.as_ref(), private_bet_record.bettor.as_ref()],
        bump = private_bet_record.bump,
    )]
    pub private_bet_record: Box<Account<'info, PrivateBetRecord>>,
}

#[callback_accounts("reveal_private_market_v8")]
#[derive(Accounts)]
pub struct RevealPrivateMarketV8Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium; verified by the callback CPI.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar, address-constrained above.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"private-state", private_state.market.as_ref()],
        bump = private_state.bump,
    )]
    pub private_state: Account<'info, PrivateMarketState>,
    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &market.nonce.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

// ---------------------------------------------------------------------------
// League score callbacks (per-member Enc<Mxe, u64>)
// ---------------------------------------------------------------------------

#[callback_accounts("init_member_score_v2")]
#[derive(Accounts)]
pub struct InitMemberScoreV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_INIT))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"member-score", member_score.league.as_ref(), member_score.member.as_ref()],
        bump = member_score.bump,
    )]
    pub member_score: Account<'info, PrivateMemberScore>,
}

#[callback_accounts("increment_member_score_v2")]
#[derive(Accounts)]
pub struct IncrementMemberScoreV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_SCORE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"member-score", member_score.league.as_ref(), member_score.member.as_ref()],
        bump = member_score.bump,
    )]
    pub member_score: Account<'info, PrivateMemberScore>,
}

#[callback_accounts("reveal_member_score_v2")]
#[derive(Accounts)]
pub struct RevealMemberScoreV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LEAGUE_REVEAL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"member-score", member_score.league.as_ref(), member_score.member.as_ref()],
        bump = member_score.bump,
    )]
    pub member_score: Account<'info, PrivateMemberScore>,
    #[account(
        mut,
        seeds = [b"league_member", league_member.league.as_ref(), league_member.member.as_ref()],
        bump = league_member.bump,
    )]
    pub league_member: Account<'info, LeagueMember>,
}

#[callback_accounts("record_private_league_win_v8")]
#[derive(Accounts)]
pub struct RecordPrivateLeagueWinV8Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PRIVATE_LEAGUE_WIN))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation account managed by Arcium.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, TerracError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"member-score", member_score.league.as_ref(), member_score.member.as_ref()],
        bump = member_score.bump,
    )]
    pub member_score: Account<'info, PrivateMemberScore>,
}

// One-time init to create the ArciumSignerAccount PDA (owned by this program).
// Must be called once before any queue_computation CPI can succeed.
#[derive(Accounts)]
pub struct InitArciumSignerPda<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 1,
        seeds = [b"ArciumSignerAccount"],
        bump,
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    pub system_program: Program<'info, System>,
}

#[arcium_program]
pub mod terrace {
    use super::*;

    pub fn init_arcium_signer_pda(ctx: Context<InitArciumSignerPda>) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        Ok(())
    }

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
        instructions::market::create_market(ctx, question, expiry, creator_fee_bps, nonce, oracle, is_private, is_flash)
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::market::place_bet(ctx, outcome, amount)
    }

    pub fn settle_market(
        ctx: Context<SettleMarket>,
        winning_outcome: u8,
    ) -> Result<()> {
        instructions::market::settle_market(ctx, winning_outcome)
    }

    pub fn settle_market_oracle(
        ctx: Context<SettleMarketOracle>,
        winning_outcome: u8,
    ) -> Result<()> {
        instructions::market::settle_market_oracle(ctx, winning_outcome)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::market::claim_winnings(ctx)
    }

    pub fn record_loss(ctx: Context<RecordLoss>) -> Result<()> {
        instructions::market::record_loss(ctx)
    }

    pub fn create_parlay(
        ctx: Context<CreateParlay>,
        legs: Vec<ParlayLeg>,
        stake_usdc: u64,
        nonce: u64,
    ) -> Result<()> {
        instructions::parlay::create_parlay(ctx, legs, stake_usdc, nonce)
    }

    pub fn settle_parlay(ctx: Context<SettleParlay>) -> Result<()> {
        instructions::parlay::settle_parlay(ctx)
    }

    pub fn claim_parlay(ctx: Context<ClaimParlay>) -> Result<()> {
        instructions::parlay::claim_parlay(ctx)
    }

    pub fn create_matchup(
        ctx: Context<CreateMatchup>,
        opponent: Pubkey,
        challenger_outcome: u8,
        stake_usdc: u64,
        nonce: u64,
    ) -> Result<()> {
        instructions::matchup::create_matchup(ctx, opponent, challenger_outcome, stake_usdc, nonce)
    }

    pub fn accept_matchup(ctx: Context<AcceptMatchup>) -> Result<()> {
        instructions::matchup::accept_matchup(ctx)
    }

    pub fn settle_matchup(ctx: Context<SettleMatchup>) -> Result<()> {
        instructions::matchup::settle_matchup(ctx)
    }

    pub fn decline_matchup(ctx: Context<DeclineMatchup>) -> Result<()> {
        instructions::matchup::decline_matchup(ctx)
    }

    pub fn init_init_private_market_state_comp_def(
        ctx: Context<InitInitPrivateMarketStateCompDef>,
    ) -> Result<()> {
        instructions::private::init_init_private_market_state_comp_def(ctx)
    }

    pub fn init_place_private_bet_comp_def(
        ctx: Context<InitPlacePrivateBetCompDef>,
    ) -> Result<()> {
        instructions::private::init_place_private_bet_comp_def(ctx)
    }

    pub fn init_reveal_private_market_comp_def(
        ctx: Context<InitRevealPrivateMarketCompDef>,
    ) -> Result<()> {
        instructions::private::init_reveal_private_market_comp_def(ctx)
    }

    pub fn init_private_market_state(
        ctx: Context<InitPrivateMarketState>,
        computation_offset: u64,
        nonce: u128,
    ) -> Result<()> {
        instructions::private::init_private_market_state(ctx, computation_offset, nonce)
    }

    #[arcium_callback(encrypted_ix = "init_private_market_state_v8")]
    pub fn init_private_market_state_v8_callback(
        ctx: Context<InitPrivateMarketStateV8Callback>,
        output: SignedComputationOutputs<InitPrivateMarketStateV8Output>,
    ) -> Result<()> {
        instructions::private::init_private_market_state_callback(ctx, output)
    }

    pub fn place_private_bet(
        ctx: Context<PlacePrivateBet>,
        computation_offset: u64,
        outcome_ct: [u8; 32],
        encryption_pubkey: [u8; 32],
        bet_nonce: u128,
        amount: u64,
        outcome_commitment: [u8; 32],
    ) -> Result<()> {
        instructions::private::place_private_bet(ctx, computation_offset, outcome_ct, encryption_pubkey, bet_nonce, amount, outcome_commitment)
    }

    #[arcium_callback(encrypted_ix = "place_private_bet_v8")]
    pub fn place_private_bet_v8_callback(
        ctx: Context<PlacePrivateBetV8Callback>,
        output: SignedComputationOutputs<PlacePrivateBetV8Output>,
    ) -> Result<()> {
        instructions::private::place_private_bet_callback(ctx, output)
    }

    pub fn reveal_private_market(
        ctx: Context<RevealPrivateMarket>,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::private::reveal_private_market(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "reveal_private_market_v8")]
    pub fn reveal_private_market_v8_callback(
        ctx: Context<RevealPrivateMarketV8Callback>,
        output: SignedComputationOutputs<RevealPrivateMarketV8Output>,
    ) -> Result<()> {
        instructions::private::reveal_private_market_callback(ctx, output)
    }

    pub fn claim_private_winnings(
        ctx: Context<ClaimPrivateWinnings>,
        outcome: u8,
        secret: [u8; 32],
    ) -> Result<()> {
        instructions::private::claim_private_winnings(ctx, outcome, secret)
    }

    pub fn create_league(
        ctx: Context<CreateLeague>,
        name: String,
        season: u16,
        is_private: bool,
        entry_fee_usdc: u64,
        max_members: u8,
        nonce: u64,
    ) -> Result<()> {
        instructions::league::create_league(ctx, name, season, is_private, entry_fee_usdc, max_members, nonce)
    }

    pub fn join_league(ctx: Context<JoinLeague>) -> Result<()> {
        instructions::league::join_league(ctx)
    }

    pub fn record_league_win(ctx: Context<RecordLeagueWin>) -> Result<()> {
        instructions::league::record_league_win(ctx)
    }

    pub fn advance_gameweek(ctx: Context<AdvanceGameweek>) -> Result<()> {
        instructions::league::advance_gameweek(ctx)
    }

    // ── Private league score instructions (per-member Enc<Mxe, u64>) ────────

    pub fn init_init_member_score_comp_def(ctx: Context<InitInitMemberScoreCompDef>) -> Result<()> {
        instructions::league_private::init_init_member_score_comp_def(ctx)
    }

    pub fn init_increment_member_score_comp_def(ctx: Context<InitIncrementMemberScoreCompDef>) -> Result<()> {
        instructions::league_private::init_increment_member_score_comp_def(ctx)
    }

    pub fn init_reveal_member_score_comp_def(ctx: Context<InitRevealMemberScoreCompDef>) -> Result<()> {
        instructions::league_private::init_reveal_member_score_comp_def(ctx)
    }

    pub fn init_record_private_league_win_v2_comp_def(ctx: Context<InitRecordPrivateLeagueWinV2CompDef>) -> Result<()> {
        instructions::league_private::init_record_private_league_win_v2_comp_def(ctx)
    }

    pub fn init_member_score(
        ctx: Context<InitMemberScore>,
        computation_offset: u64,
        nonce: u128,
    ) -> Result<()> {
        instructions::league_private::init_member_score(ctx, computation_offset, nonce)
    }

    #[arcium_callback(encrypted_ix = "init_member_score_v2")]
    pub fn init_member_score_v2_callback(
        ctx: Context<InitMemberScoreV2Callback>,
        output: SignedComputationOutputs<InitMemberScoreV2Output>,
    ) -> Result<()> {
        instructions::league_private::init_member_score_callback(ctx, output)
    }

    pub fn reset_member_score(
        ctx: Context<ResetMemberScore>,
        computation_offset: u64,
        nonce: u128,
    ) -> Result<()> {
        instructions::league_private::reset_member_score(ctx, computation_offset, nonce)
    }

    pub fn record_private_league_win(
        ctx: Context<RecordPrivateLeagueWin>,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::league_private::record_private_league_win(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "increment_member_score_v2")]
    pub fn increment_member_score_v2_callback(
        ctx: Context<IncrementMemberScoreV2Callback>,
        output: SignedComputationOutputs<IncrementMemberScoreV2Output>,
    ) -> Result<()> {
        instructions::league_private::increment_member_score_callback(ctx, output)
    }

    pub fn reveal_member_score(
        ctx: Context<RevealMemberScore>,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::league_private::reveal_member_score(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "reveal_member_score_v2")]
    pub fn reveal_member_score_v2_callback(
        ctx: Context<RevealMemberScoreV2Callback>,
        output: SignedComputationOutputs<RevealMemberScoreV2Output>,
    ) -> Result<()> {
        instructions::league_private::reveal_member_score_callback(ctx, output)
    }

    pub fn record_private_league_win_v2(
        ctx: Context<RecordPrivateLeagueWinV2>,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::league_private::record_private_league_win_v2(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "record_private_league_win_v8")]
    pub fn record_private_league_win_v8_callback(
        ctx: Context<RecordPrivateLeagueWinV8Callback>,
        output: SignedComputationOutputs<RecordPrivateLeagueWinV8Output>,
    ) -> Result<()> {
        instructions::league_private::record_private_league_win_v8_callback(ctx, output)
    }
}

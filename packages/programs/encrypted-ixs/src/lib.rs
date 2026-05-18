use arcis::prelude::*;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/// Running encrypted totals stored in PrivateMarketState.
/// Layout: [no_total: u64, yes_total: u64]
pub type BetTotals = [u64; 2];

/// A single private bet — outcome is the hidden field, amount is also encrypted
/// (the on-chain USDC transfer reveals the amount, but we encrypt it here so
/// the MPC accumulation is self-consistent and doesn't leak side information).
pub struct PrivateBetInput {
    pub outcome: u8,  // 0 = No, 1 = Yes
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// MPC circuits
// ---------------------------------------------------------------------------

#[encrypted]
mod circuits {
    use super::*;

    /// Initialise a fresh encrypted BetTotals at [0, 0].
    /// Called once when a private market is created.
    #[instruction]
    pub fn init_private_market_state(mxe: Mxe) -> Enc<Mxe, BetTotals> {
        let totals: BetTotals = [0u64, 0u64];
        mxe.from_arcis(totals)
    }

    /// Add an encrypted bet to the running totals.
    /// The oblivious array update `totals[outcome as usize] += amount` is
    /// handled by Arcis as a secret-indexed write.
    #[instruction]
    pub fn place_private_bet(
        bet_ctx: Enc<Shared, PrivateBetInput>,
        totals_ctx: Enc<Mxe, BetTotals>,
    ) -> Enc<Mxe, BetTotals> {
        let bet = bet_ctx.to_arcis();
        let mut totals = totals_ctx.to_arcis();
        totals[bet.outcome as usize] += bet.amount;
        totals_ctx.owner.from_arcis(totals)
    }

    /// Reveal the final totals. Called by the market creator at settlement.
    #[instruction]
    pub fn reveal_private_market(totals_ctx: Enc<Mxe, BetTotals>) -> (u64, u64) {
        let totals = totals_ctx.to_arcis();
        (totals[0].reveal(), totals[1].reveal())
    }

    // ── Per-member league score circuits ─────────────────────────────────────
    // Each private league member gets their own PrivateMemberScore PDA with
    // a single encrypted u64. Simpler than an array — avoids arcis array
    // size limits while providing the same privacy guarantee.

    /// Initialise a member's encrypted score at 0.
    /// Called when the member joins a private league.
    #[instruction]
    pub fn init_member_score(mxe: Mxe) -> Enc<Mxe, u64> {
        mxe.from_arcis(0u64)
    }

    /// Add 1 to a member's encrypted score.
    /// Called when the member submits a winning bet for the active GW.
    #[instruction]
    pub fn increment_member_score(score_ctx: Enc<Mxe, u64>) -> Enc<Mxe, u64> {
        let score = score_ctx.to_arcis();
        score_ctx.owner.from_arcis(score + 1)
    }

    /// Reveal a member's score. Called by advance_gameweek_private.
    /// Returns plaintext u64 — the member's GW score.
    #[instruction]
    pub fn reveal_member_score(score_ctx: Enc<Mxe, u64>) -> u64 {
        let score = score_ctx.to_arcis();
        score.reveal()
    }
}

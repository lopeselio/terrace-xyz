use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ── Private market circuits ──────────────────────────────────────────────

    /// Initialise fresh encrypted bet totals [no_total, yes_total] at [0, 0].
    #[instruction]
    pub fn init_private_market_state_v2(mxe: Mxe) -> Enc<Mxe, [u64; 2]> {
        let totals: [u64; 2] = [0u64, 0u64];
        mxe.from_arcis(totals)
    }

    /// Add an encrypted bet to the running totals.
    /// bet_ctx encodes (outcome: u8, amount: u64) as a tuple.
    #[instruction]
    pub fn place_private_bet_v2(
        bet_ctx: Enc<Shared, (u8, u64)>,
        totals_ctx: Enc<Mxe, [u64; 2]>,
    ) -> Enc<Mxe, [u64; 2]> {
        let (outcome, amount) = bet_ctx.to_arcis();
        let mut totals = totals_ctx.to_arcis();
        totals[outcome as usize] += amount;
        totals_ctx.owner.from_arcis(totals)
    }

    /// Reveal the final totals. Called by the market creator at settlement.
    #[instruction]
    pub fn reveal_private_market_v2(totals_ctx: Enc<Mxe, [u64; 2]>) -> (u64, u64) {
        let totals = totals_ctx.to_arcis();
        (totals[0].reveal(), totals[1].reveal())
    }

    // ── Per-member league score circuits ─────────────────────────────────────

    /// Initialise a member's encrypted score at 0.
    #[instruction]
    pub fn init_member_score_v2(mxe: Mxe) -> Enc<Mxe, u64> {
        mxe.from_arcis(0u64)
    }

    /// Add 1 to a member's encrypted score.
    #[instruction]
    pub fn increment_member_score_v2(score_ctx: Enc<Mxe, u64>) -> Enc<Mxe, u64> {
        let score = score_ctx.to_arcis();
        score_ctx.owner.from_arcis(score + 1)
    }

    /// Reveal a member's score. Returns plaintext u64.
    #[instruction]
    pub fn reveal_member_score_v2(score_ctx: Enc<Mxe, u64>) -> u64 {
        let score = score_ctx.to_arcis();
        score.reveal()
    }

    /// Privately score a league win from an encrypted private-market bet.
    /// Re-uses the Enc<Shared, (u8, u64)> stored at bet time so the outcome
    /// is never revealed on-chain — the MPC checks it internally against the
    /// public winning_outcome and increments the score only if they match.
    #[instruction]
    pub fn record_private_league_win_v2(
        bet_ctx: Enc<Shared, (u8, u64)>,
        winning_outcome: u8,
        score_ctx: Enc<Mxe, u64>,
    ) -> Enc<Mxe, u64> {
        let (outcome, _) = bet_ctx.to_arcis();
        let score = score_ctx.to_arcis();
        let increment = if outcome == winning_outcome { 1u64 } else { 0u64 };
        score_ctx.owner.from_arcis(score + increment)
    }
}

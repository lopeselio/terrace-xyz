use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ──────────────────────────────────────────────────────────────────────────
    // ONLY-u64 ARCHITECTURE
    //
    // Every Enc<Mxe, T> uses T = u64 — the one type we've confirmed roundtrips
    // correctly on this MXE cluster. Markets track NO and YES as two independent
    // Enc<Mxe, u64> cells (not as Enc<Mxe, [u64; 2]>). Bet outcome is sealed as
    // Enc<Mxe, u64> with value 0 or 1. Score is Enc<Mxe, u64>.
    //
    // Bettor's public USDC `amount` is passed as a plaintext circuit input,
    // since it's already publicly visible from the SPL token transfer. Only
    // the bettor's *side* (0 or 1) is hidden — that's the property we care about.
    // ──────────────────────────────────────────────────────────────────────────

    // ── Private market circuits (only Enc<Mxe, u64>) ─────────────────────────

    /// Initialise both encrypted totals (no, yes) to 0.
    /// Returns two independent Enc<Mxe, u64> ciphertexts.
    #[instruction]
    pub fn init_private_market_state_v8(mxe: Mxe) -> (Enc<Mxe, u64>, Enc<Mxe, u64>) {
        let no = mxe.from_arcis(0u64);
        let yes = Mxe::get().from_arcis(0u64);
        (no, yes)
    }

    /// Place a bet:
    ///   - bettor sends Enc<Shared, u64> outcome (value 0 or 1)
    ///   - bettor's USDC amount is public (passed as plaintext u64)
    ///   - circuit conditionally adds amount to NO or YES total
    ///   - circuit also re-seals outcome as Enc<Mxe, u64> for later private scoring
    ///
    /// Output tuple: (new_no_total, new_yes_total, sealed_outcome) — all Enc<Mxe, u64>.
    #[instruction]
    pub fn place_private_bet_v8(
        outcome_ctx: Enc<Shared, u64>,
        amount: u64,
        no_total_ctx: Enc<Mxe, u64>,
        yes_total_ctx: Enc<Mxe, u64>,
        seal_mxe: Mxe,
    ) -> (Enc<Mxe, u64>, Enc<Mxe, u64>, Enc<Mxe, u64>) {
        let outcome = outcome_ctx.to_arcis();
        let no_total = no_total_ctx.to_arcis();
        let yes_total = yes_total_ctx.to_arcis();

        // Seal outcome first (clean copy before any other use).
        let sealed = seal_mxe.from_arcis(outcome);

        // Conditional add: both branches execute in MPC, mask via outcome bit.
        let no_incr = if outcome == 0u64 { amount } else { 0u64 };
        let yes_incr = if outcome == 1u64 { amount } else { 0u64 };

        let new_no = no_total_ctx.owner.from_arcis(no_total + no_incr);
        let new_yes = yes_total_ctx.owner.from_arcis(yes_total + yes_incr);

        (new_no, new_yes, sealed)
    }

    /// Reveal both totals as plaintext (no, yes).
    /// Called by the market creator at settlement.
    #[instruction]
    pub fn reveal_private_market_v8(
        no_total_ctx: Enc<Mxe, u64>,
        yes_total_ctx: Enc<Mxe, u64>,
    ) -> (u64, u64) {
        let no = no_total_ctx.to_arcis();
        let yes = yes_total_ctx.to_arcis();
        (no.reveal(), yes.reveal())
    }

    // ── Per-member league score circuits (unchanged Enc<Mxe, u64> chain) ─────

    /// Initialise a member's encrypted score at 0.
    #[instruction]
    pub fn init_member_score_v2(mxe: Mxe) -> Enc<Mxe, u64> {
        mxe.from_arcis(0u64)
    }

    /// Add 1 to a member's encrypted score (legacy public-bet path).
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

    /// Privately score a league win — chained Enc<Mxe, u64>.
    /// Reads the sealed outcome from PrivateBetRecord, compares to public
    /// winning_outcome inside the MPC, conditionally increments the score.
    /// Bettor's outcome is NEVER revealed on-chain.
    #[instruction]
    pub fn record_private_league_win_v8(
        sealed_outcome_ctx: Enc<Mxe, u64>,
        winning_outcome: u64,
        score_ctx: Enc<Mxe, u64>,
    ) -> Enc<Mxe, u64> {
        let outcome = sealed_outcome_ctx.to_arcis();
        let score = score_ctx.to_arcis();
        let increment = if outcome == winning_outcome { 1u64 } else { 0u64 };
        score_ctx.owner.from_arcis(score + increment)
    }
}

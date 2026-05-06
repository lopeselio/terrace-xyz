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
    /// `mxe: Mxe` represents the MXE key context; the nonce for the output
    /// ciphertext is passed as a plaintext_u128 via ArgBuilder.
    #[instruction]
    pub fn init_private_market_state(mxe: Mxe) -> Enc<Mxe, BetTotals> {
        let totals: BetTotals = [0u64, 0u64];
        mxe.from_arcis(totals)
    }

    /// Add an encrypted bet to the running totals.
    /// `bet_ctx` is encrypted by the client's ephemeral X25519 key so the
    /// MPC nodes can decrypt it inside the secure environment without ever
    /// exposing plaintext to the chain.
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
    /// Returns plaintext (no_total, yes_total) — visible only after this
    /// instruction is called; individual positions remain hidden.
    #[instruction]
    pub fn reveal_private_market(totals_ctx: Enc<Mxe, BetTotals>) -> (u64, u64) {
        let totals = totals_ctx.to_arcis();
        (totals[0].reveal(), totals[1].reveal())
    }
}

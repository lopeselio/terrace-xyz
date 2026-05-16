use anchor_lang::prelude::*;
use crate::constants::MAX_QUESTION_LEN;

#[account]
pub struct Market {
    pub question: String,          // 4 + MAX_QUESTION_LEN
    pub expiry: i64,               // 8
    pub creator: Pubkey,           // 32
    pub outcome: Option<u8>,       // 1 + 1
    pub total_volume: u64,         // 8
    pub yes_volume: u64,           // 8  — sum of all Yes bets
    pub no_volume: u64,            // 8  — sum of all No bets
    pub vault: Pubkey,             // 32
    pub status: MarketStatus,      // 1
    pub creator_fee_bps: u16,      // 2  — basis points taken on each winning claim
    pub oracle: Option<Pubkey>,    // 1 + 32 — Switchboard Function pubkey (None = creator-only)
    pub is_private: bool,          // 1 — private group market (Light Protocol Phase 4)
    pub is_flash: bool,            // 1 — in-match micro-market (< 90 min window)
    pub nonce: u64,                // 8
    pub bump: u8,                  // 1
}

impl Market {
    pub const SPACE: usize = 8           // discriminator
        + 4 + MAX_QUESTION_LEN           // question
        + 8                              // expiry
        + 32                             // creator
        + 1 + 1                          // outcome Option<u8>
        + 8                              // total_volume
        + 8                              // yes_volume
        + 8                              // no_volume
        + 32                             // vault
        + 1                              // status
        + 2                              // creator_fee_bps
        + 1 + 32                         // oracle Option<Pubkey>
        + 1                              // is_private
        + 1                              // is_flash
        + 8                              // nonce
        + 1                              // bump
        + 2;                             // padding
}

#[account]
pub struct Bet {
    pub market: Pubkey,          // 32
    pub bettor: Pubkey,          // 32
    pub outcome: u8,             // 1
    pub amount: u64,             // 8
    pub claimed: bool,           // 1
    pub result_recorded: bool,   // 1  — true once reputation was updated (win or loss)
    pub bump: u8,                // 1
}

impl Bet {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1 + 1 + 15; // 15 padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Open,
    Closed,
    Settled,
}

use anchor_lang::prelude::*;

#[account]
pub struct Reputation {
    pub owner: Pubkey,            // 32
    pub total_bets: u32,          // 4
    pub winning_bets: u32,        // 4
    pub win_rate_bps: u16,        // 2  — basis points, e.g. 6500 = 65%
    pub current_streak: i16,      // 2  — positive = win streak, negative = loss streak
    pub badge_tier: BadgeTier,    // 1
    pub bump: u8,                 // 1
}

impl Reputation {
    pub const SPACE: usize = 8 + 32 + 4 + 4 + 2 + 2 + 1 + 1 + 16; // 16 padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum BadgeTier {
    #[default]
    Casual,  // < 10 bets or < 55% win rate
    Sharp,   // >= 10 bets and >= 55% win rate
    Legend,  // >= 50 bets and >= 65% win rate
}

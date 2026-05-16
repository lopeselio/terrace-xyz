use anchor_lang::prelude::*;

#[account]
pub struct Matchup {
    pub challenger: Pubkey,      // 32
    pub opponent: Pubkey,        // 32
    pub market: Pubkey,          // 32
    pub challenger_outcome: u8,  // 1
    pub stake_usdc: u64,         // 8
    pub status: MatchupStatus,   // 1
    pub nonce: u64,              // 8
    pub bump: u8,                // 1
}

impl Matchup {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 8 + 1 + 8 + 1 + 13; // 136
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MatchupStatus {
    Pending,   // challenger staked, waiting for opponent
    Accepted,  // both staked, waiting for market to settle
    Settled,   // winner paid out
    Declined,  // declined or cancelled, challenger refunded
}

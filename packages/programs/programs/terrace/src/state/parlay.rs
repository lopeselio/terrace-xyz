use anchor_lang::prelude::*;
use crate::constants::MAX_PARLAY_LEGS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ParlayLeg {
    pub market: Pubkey,  // 32
    pub outcome: u8,     // 1 — 0=No, 1=Yes
}

#[account]
pub struct Parlay {
    pub creator: Pubkey,       // 32
    pub legs: Vec<ParlayLeg>,  // 4 + MAX_PARLAY_LEGS * (32 + 1)
    pub stake_usdc: u64,       // 8
    pub status: ParlayStatus,  // 1
    pub nonce: u64,            // 8
    pub bump: u8,              // 1
}

impl Parlay {
    pub const SPACE: usize = 8                              // discriminator
        + 32                                                // creator
        + 4 + MAX_PARLAY_LEGS * (32 + 1)                   // legs vec
        + 8                                                 // stake_usdc
        + 1                                                 // status
        + 8                                                 // nonce
        + 1                                                 // bump
        + 16;                                               // padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ParlayStatus {
    Open,
    Won,
    Lost,
    Claimed,
    Cancelled,
}

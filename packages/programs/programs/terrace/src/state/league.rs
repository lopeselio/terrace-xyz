use anchor_lang::prelude::*;
use crate::constants::MAX_LEAGUE_NAME_LEN;

#[account]
pub struct League {
    pub creator: Pubkey,           // 32
    pub name: String,              // 4 + MAX_LEAGUE_NAME_LEN (50)
    pub season: u16,               // 2
    pub gameweek: u8,              // 1 — current active gameweek (1-based)
    pub member_count: u8,          // 1
    pub max_members: u8,           // 1
    pub is_private: bool,          // 1 — Arcium-encrypted standings (wired in follow-on sprint)
    pub entry_fee_usdc: u64,       // 8 — 0 = free to join
    pub prize_pool: u64,           // 8 — accumulated from entry fees
    pub vault: Pubkey,             // 32 — USDC ATA owned by this PDA
    pub status: LeagueStatus,      // 1
    pub nonce: u64,                // 8
    pub bump: u8,                  // 1
}

impl League {
    pub const SPACE: usize = 8          // discriminator
        + 32                            // creator
        + 4 + MAX_LEAGUE_NAME_LEN       // name String
        + 2                             // season
        + 1                             // gameweek
        + 1                             // member_count
        + 1                             // max_members
        + 1                             // is_private
        + 8                             // entry_fee_usdc
        + 8                             // prize_pool
        + 32                            // vault
        + 1                             // status
        + 8                             // nonce
        + 1                             // bump
        + 2;                            // padding → 160
}

#[account]
pub struct LeagueMember {
    pub league: Pubkey,                // 32
    pub member: Pubkey,                // 32
    pub gameweek_score: u32,           // 4 — wins in current gameweek (resets lazily on new gameweek)
    pub total_score: u32,              // 4 — cumulative wins across all gameweeks
    pub last_scored_gameweek: u8,      // 1 — tracks which gameweek gameweek_score belongs to
    pub bump: u8,                      // 1
}

impl LeagueMember {
    pub const SPACE: usize = 8 + 32 + 32 + 4 + 4 + 1 + 1 + 14; // 96
}

#[account]
pub struct LeagueScoreRecord {
    pub bump: u8, // 1 — marker PDA; existence prevents double-scoring a bet
}

impl LeagueScoreRecord {
    pub const SPACE: usize = 8 + 1 + 7; // 16
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum LeagueStatus {
    Active,
    Ended,
}

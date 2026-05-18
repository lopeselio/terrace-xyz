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
    pub is_private: bool,          // 1 — Arcium-encrypted standings
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
    pub member_slot: u8,               // 1 — join order (0-based); kept for ordering/display
    pub gameweek_score: u32,           // 4 — wins in current gameweek (resets lazily on new GW)
    pub total_score: u32,              // 4 — cumulative wins across all gameweeks
    pub last_scored_gameweek: u8,      // 1 — tracks which gameweek gameweek_score belongs to
    pub bump: u8,                      // 1
}

impl LeagueMember {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 4 + 4 + 1 + 1 + 13; // 96 (same total, slot replaces padding)
}

/// Per-member encrypted score PDA for private leagues.
/// Created when a member joins a private league; persists across gameweeks.
/// Each gameweek the score accumulates via MXE, then is revealed and reset.
#[account]
pub struct PrivateMemberScore {
    pub league: Pubkey,            // 32
    pub member: Pubkey,            // 32
    pub encrypted_score: [u8; 32], // 32 — Arcium MXE ciphertext (Enc<Mxe, u64>)
    pub nonce: u128,               // 16 — MXE nonce for current encrypted value
    pub scores_gameweek: u8,       // 1 — GW this encrypted score belongs to
    pub is_revealed: bool,         // 1 — true after reveal, reset on next GW init
    pub bump: u8,                  // 1
}

impl PrivateMemberScore {
    pub const SPACE: usize = 8    // discriminator
        + 32                      // league
        + 32                      // member
        + 32                      // encrypted_score [u8;32]
        + 16                      // nonce u128
        + 1                       // scores_gameweek
        + 1                       // is_revealed
        + 1                       // bump
        + 3;                      // padding → 126
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

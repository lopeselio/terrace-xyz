use anchor_lang::prelude::*;

#[account]
pub struct PrivateMarketState {
    pub market: Pubkey,                  // 32 — links to the Market PDA
    pub encrypted_totals: [[u8; 32]; 2], // 64 — MXE ciphertext: [no_total, yes_total]
    pub nonce: u128,                     // 16 — MXE nonce for next re-encryption
    pub is_revealed: bool,               // 1
    pub no_volume_revealed: u64,         // 8 — set after reveal_private_market callback
    pub yes_volume_revealed: u64,        // 8
    pub bump: u8,                        // 1
}

impl PrivateMarketState {
    pub const SPACE: usize = 8   // discriminator
        + 32                     // market
        + 64                     // encrypted_totals [[u8;32]; 2]
        + 16                     // nonce u128
        + 1                      // is_revealed
        + 8                      // no_volume_revealed
        + 8                      // yes_volume_revealed
        + 1                      // bump
        + 22;                    // padding → 160
}

#[account]
pub struct PrivateBetRecord {
    pub market: Pubkey,               // 32
    pub bettor: Pubkey,               // 32
    pub amount: u64,                  // 8
    pub outcome_commitment: [u8; 32], // 32 — blake3(outcome_byte || secret_32_bytes)
    pub claimed: bool,                // 1
    pub bump: u8,                     // 1
}

impl PrivateBetRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 1 + 1 + 14; // 128 total
}

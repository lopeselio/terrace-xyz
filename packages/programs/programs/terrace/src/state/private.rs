use anchor_lang::prelude::*;

#[account]
pub struct PrivateMarketState {
    pub market: Pubkey,                 // 32 — links to the Market PDA
    pub no_total_ct: [u8; 32],          // 32 — Enc<Mxe, u64> ciphertext (NO total)
    pub no_total_nonce: u128,           // 16 — nonce of no_total ciphertext
    pub yes_total_ct: [u8; 32],         // 32 — Enc<Mxe, u64> ciphertext (YES total)
    pub yes_total_nonce: u128,          // 16 — nonce of yes_total ciphertext
    pub is_revealed: bool,              // 1
    pub no_volume_revealed: u64,        // 8 — set after reveal_private_market callback
    pub yes_volume_revealed: u64,       // 8
    pub bump: u8,                       // 1
}

impl PrivateMarketState {
    pub const SPACE: usize = 8   // discriminator
        + 32                     // market
        + 32                     // no_total_ct
        + 16                     // no_total_nonce
        + 32                     // yes_total_ct
        + 16                     // yes_total_nonce
        + 1                      // is_revealed
        + 8                      // no_volume_revealed
        + 8                      // yes_volume_revealed
        + 1                      // bump
        + 6;                     // padding → 160
}

#[account]
pub struct PrivateBetRecord {
    pub market: Pubkey,                 // 32
    pub bettor: Pubkey,                 // 32
    pub amount: u64,                    // 8
    pub outcome_commitment: [u8; 32],   // 32 — blake3(outcome_byte || secret_32_bytes)
    pub outcome_ct: [u8; 32],           // 32 — Enc<Shared> field 0 (consumed by place_private_bet_v4)
    pub amount_ct: [u8; 32],            // 32 — Enc<Shared> field 1
    pub encryption_pubkey: [u8; 32],    // 32 — ephemeral X25519 pubkey used at bet time
    pub bet_nonce: u128,                // 16 — nonce for Enc<Shared>
    pub claimed: bool,                  // 1
    pub bump: u8,                       // 1
    pub mxe_outcome_ct: [u8; 32],       // 32 — Enc<Mxe, u8>: sealed outcome ciphertext (from place_private_bet_v4 field_1)
    pub mxe_outcome_nonce: u128,        // 16 — nonce of the Enc<Mxe, u8> sealed outcome
    pub mxe_outcome_sealed: bool,       // 1  — true once the place_private_bet_v4 callback wrote mxe_outcome_ct
}

impl PrivateBetRecord {
    pub const SPACE: usize = 8   // discriminator
        + 32                     // market
        + 32                     // bettor
        + 8                      // amount
        + 32                     // outcome_commitment
        + 32                     // outcome_ct
        + 32                     // amount_ct
        + 32                     // encryption_pubkey
        + 16                     // bet_nonce u128
        + 1                      // claimed
        + 1                      // bump
        + 32                     // mxe_outcome_ct
        + 16                     // mxe_outcome_nonce u128
        + 1                      // mxe_outcome_sealed
        + 5;                     // padding → 280
}

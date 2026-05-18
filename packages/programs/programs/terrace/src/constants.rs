pub const MAX_QUESTION_LEN: usize = 200;
pub const MAX_PARLAY_LEGS: usize = 8;
pub const MAX_LEAGUE_NAME_LEN: usize = 50;
pub const MAX_CREATOR_FEE_BPS: u16 = 500; // 5% ceiling on creator fees
pub const USDC_DECIMALS: u64 = 1_000_000; // 1 USDC = 1_000_000 lamports (6 dp)
pub const MIN_BET: u64 = USDC_DECIMALS / 10; // 0.1 USDC minimum

// Arcium computation definition offsets — sha256-derived identifiers for each circuit.
// Private market circuits:
pub const COMP_DEF_OFFSET_INIT:   u32 = arcium_anchor::comp_def_offset("init_private_market_state");
pub const COMP_DEF_OFFSET_BET:    u32 = arcium_anchor::comp_def_offset("place_private_bet");
pub const COMP_DEF_OFFSET_REVEAL: u32 = arcium_anchor::comp_def_offset("reveal_private_market");

// Private league score circuits (per-member Enc<Mxe, u64>):
pub const COMP_DEF_OFFSET_LEAGUE_INIT:   u32 = arcium_anchor::comp_def_offset("init_member_score");
pub const COMP_DEF_OFFSET_LEAGUE_SCORE:  u32 = arcium_anchor::comp_def_offset("increment_member_score");
pub const COMP_DEF_OFFSET_LEAGUE_REVEAL: u32 = arcium_anchor::comp_def_offset("reveal_member_score");

// Byte offset of `encrypted_totals` inside a serialised PrivateMarketState account.
// Layout: 8 (discriminator) + 32 (market Pubkey) = 40.
pub const PRIVATE_STATE_TOTALS_OFFSET: u32 = (8 + 32) as u32;

// Byte offset of `encrypted_score` inside a serialised PrivateMemberScore account.
// Layout: 8 (discriminator) + 32 (league) + 32 (member) = 72.
pub const MEMBER_SCORE_OFFSET: u32 = (8 + 32 + 32) as u32;
// Size of encrypted_score: one 32-byte Arcium ciphertext.
pub const MEMBER_SCORE_SIZE: u32 = 32;

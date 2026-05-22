pub const MAX_QUESTION_LEN: usize = 200;
pub const MAX_PARLAY_LEGS: usize = 8;
pub const MAX_LEAGUE_NAME_LEN: usize = 50;
pub const MAX_CREATOR_FEE_BPS: u16 = 500; // 5% ceiling on creator fees
pub const USDC_DECIMALS: u64 = 1_000_000; // 1 USDC = 1_000_000 lamports (6 dp)
pub const MIN_BET: u64 = USDC_DECIMALS / 10; // 0.1 USDC minimum

// Arcium computation definition offsets — sha256-derived identifiers for each circuit.
// v4/v6 use the only-Enc<Mxe, u64> architecture — every Mxe-encrypted state in
// the system is a single u64. The previous v3/v5 attempts using named structs
// and the v2 attempts using raw arrays / u8 produced garbage roundtrips on this cluster.
pub const COMP_DEF_OFFSET_INIT:   u32 = arcium_anchor::comp_def_offset("init_private_market_state_v8");
pub const COMP_DEF_OFFSET_BET:    u32 = arcium_anchor::comp_def_offset("place_private_bet_v8");
pub const COMP_DEF_OFFSET_REVEAL: u32 = arcium_anchor::comp_def_offset("reveal_private_market_v8");

// Private league score circuits (per-member Enc<Mxe, u64>):
pub const COMP_DEF_OFFSET_LEAGUE_INIT:   u32 = arcium_anchor::comp_def_offset("init_member_score_v2");
pub const COMP_DEF_OFFSET_LEAGUE_SCORE:  u32 = arcium_anchor::comp_def_offset("increment_member_score_v2");
pub const COMP_DEF_OFFSET_LEAGUE_REVEAL: u32 = arcium_anchor::comp_def_offset("reveal_member_score_v2");
// Private-bet-aware scoring via chained Enc<Mxe, u64> — consumes the sealed
// outcome (Enc<Mxe, u64>) emitted by place_private_bet_v8.
pub const COMP_DEF_OFFSET_PRIVATE_LEAGUE_WIN: u32 = arcium_anchor::comp_def_offset("record_private_league_win_v8");

// Byte offsets inside a serialised PrivateMarketState account.
// Layout: 8 (disc) + 32 (market) + 32 (no_ct) + 16 (no_nonce) + 32 (yes_ct) + 16 (yes_nonce) ...
pub const NO_TOTAL_OFFSET:   u32 = (8 + 32) as u32;                       // 40
pub const YES_TOTAL_OFFSET:  u32 = (8 + 32 + 32 + 16) as u32;             // 88
pub const TOTAL_SIZE:        u32 = 32;                                    // each total is one 32-byte ciphertext

// Byte offset of `encrypted_score` inside a serialised PrivateMemberScore account.
// Layout: 8 (discriminator) + 32 (league) + 32 (member) = 72.
pub const MEMBER_SCORE_OFFSET: u32 = (8 + 32 + 32) as u32;
pub const MEMBER_SCORE_SIZE: u32 = 32;

// Byte offset of `mxe_outcome_ct` inside a serialised PrivateBetRecord account.
// Layout: 8 (disc) + 32 (market) + 32 (bettor) + 8 (amount) + 32 (commitment)
//       + 32 (outcome_ct) + 32 (amount_ct) + 32 (encryption_pubkey)
//       + 16 (bet_nonce) + 1 (claimed) + 1 (bump) = 226.
pub const MXE_OUTCOME_OFFSET: u32 = (8 + 32 + 32 + 8 + 32 + 32 + 32 + 32 + 16 + 1 + 1) as u32;
pub const MXE_OUTCOME_SIZE: u32 = 32;

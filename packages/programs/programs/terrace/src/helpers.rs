use crate::state::reputation::BadgeTier;

/// Reads status byte and Option<u8> outcome from a raw Market account buffer.
/// Parses the borsh layout without deserialising the full struct to avoid the
/// Anchor remaining_accounts lifetime split (accounts vs remaining have separate
/// 'b / 'c lifetime params that prevent Account::try_from).
///
/// Returns (status_byte, outcome): status 2 = Settled.
pub fn read_market_status_outcome(data: &[u8]) -> Option<(u8, Option<u8>)> {
    let mut o: usize = 8; // skip 8-byte discriminator
    // question: u32 LE length prefix + bytes
    if o + 4 > data.len() { return None; }
    let q_len = u32::from_le_bytes([data[o], data[o+1], data[o+2], data[o+3]]) as usize;
    o += 4 + q_len;
    o += 8;  // expiry  i64
    o += 32; // creator Pubkey
    // outcome: Option<u8> — 1-byte tag; 1-byte value if Some(...)
    if o >= data.len() { return None; }
    let outcome = if data[o] == 1 {
        o += 1;
        if o >= data.len() { return None; }
        let v = data[o];
        o += 1;
        Some(v)
    } else {
        o += 1;
        None
    };
    // total_volume u64 + yes_volume u64 + no_volume u64 + vault Pubkey
    o += 8 + 8 + 8 + 32;
    // status: u8 enum (0=Open, 1=Closed, 2=Settled)
    if o >= data.len() { return None; }
    Some((data[o], outcome))
}

pub fn compute_badge(total_bets: u32, win_rate_bps: u16) -> BadgeTier {
    if total_bets >= 50 && win_rate_bps >= 6500 {
        BadgeTier::Legend
    } else if total_bets >= 10 && win_rate_bps >= 5500 {
        BadgeTier::Sharp
    } else {
        BadgeTier::Casual
    }
}

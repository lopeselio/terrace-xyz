use anchor_lang::prelude::*;
use crate::state::reputation::BadgeTier;

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub expiry: i64,
    pub nonce: u64,
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub winning_outcome: u8,
}

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

#[event]
pub struct ReputationUpdated {
    pub owner: Pubkey,
    pub total_bets: u32,
    pub winning_bets: u32,
    pub win_rate_bps: u16,
    pub badge_tier: BadgeTier,
}

#[event]
pub struct ParlayCreated {
    pub parlay: Pubkey,
    pub creator: Pubkey,
    pub n_legs: u8,
    pub stake_usdc: u64,
    pub nonce: u64,
}

#[event]
pub struct ParlaySettled {
    pub parlay: Pubkey,
    pub won: bool,
}

#[event]
pub struct ParlayClaimed {
    pub parlay: Pubkey,
    pub creator: Pubkey,
    pub stake: u64,
}

#[event]
pub struct MatchupCreated {
    pub matchup: Pubkey,
    pub challenger: Pubkey,
    pub opponent: Pubkey,
    pub market: Pubkey,
    pub challenger_outcome: u8,
    pub stake_usdc: u64,
}

#[event]
pub struct MatchupAccepted {
    pub matchup: Pubkey,
    pub opponent: Pubkey,
}

#[event]
pub struct MatchupSettled {
    pub matchup: Pubkey,
    pub winner: Pubkey,
    pub payout: u64,
}

#[event]
pub struct MatchupDeclined {
    pub matchup: Pubkey,
    pub signer: Pubkey,
}

#[event]
pub struct PrivateBetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PrivateMarketRevealed {
    pub market: Pubkey,
    pub yes_volume: u64,
    pub no_volume: u64,
    pub winning_outcome: u8,
}

#[event]
pub struct PrivateWinningsClaimed {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub payout: u64,
}

#[event]
pub struct LeagueCreated {
    pub league: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub season: u16,
    pub is_private: bool,
    pub nonce: u64,
}

#[event]
pub struct LeagueJoined {
    pub league: Pubkey,
    pub member: Pubkey,
    pub gameweek: u8,
}

#[event]
pub struct LeagueWinRecorded {
    pub league: Pubkey,
    pub member: Pubkey,
    pub market: Pubkey,
    pub gameweek: u8,
    pub gameweek_score: u32,
    pub total_score: u32,
}

#[event]
pub struct GameweekAdvanced {
    pub league: Pubkey,
    pub prev_gameweek: u8,
    pub new_gameweek: u8,
}

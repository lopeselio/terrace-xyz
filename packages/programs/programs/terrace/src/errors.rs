use anchor_lang::prelude::*;

#[error_code]
pub enum TerracError {
    #[msg("Question must be 1–200 characters")]
    InvalidQuestion,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market has passed its expiry")]
    MarketExpired,
    #[msg("Outcome must be 0 (No) or 1 (Yes)")]
    InvalidOutcome,
    #[msg("Bet is below the minimum of 0.1 USDC")]
    BetTooSmall,
    #[msg("Cannot top up a bet with a different outcome")]
    OutcomeMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Only the market creator can perform this action")]
    Unauthorized,
    #[msg("Market is not settled yet")]
    MarketNotSettled,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("This bet did not win")]
    BetDidNotWin,
    #[msg("No volume on the winning side — nothing to claim")]
    ZeroWinningVolume,
    #[msg("Reputation already recorded for this bet")]
    AlreadyRecorded,
    #[msg("Bet was a winner — use claim_winnings instead")]
    BetWasWinner,
    #[msg("Creator fee exceeds the 5% maximum (500 bps)")]
    FeeTooHigh,
    #[msg("Parlay must have 2–8 legs")]
    InvalidParlayLegs,
    #[msg("Parlay is not open")]
    ParlayNotOpen,
    #[msg("Parlay was not won")]
    ParlayNotWon,
    #[msg("Provided market account does not match parlay leg")]
    MarketMismatch,
    #[msg("Market has no oracle configured — use settle_market instead")]
    OracleNotSet,
    #[msg("Matchup is not in Pending status")]
    MatchupNotPending,
    #[msg("Matchup is not in Accepted status")]
    MatchupNotAccepted,
    #[msg("Market is private — use place_private_bet instead")]
    MarketIsPrivate,
    #[msg("Market is not a private market")]
    MarketNotPrivate,
    #[msg("Private market totals already revealed")]
    AlreadyRevealed,
    #[msg("MPC computation failed or was aborted")]
    AbortedComputation,
    #[msg("Private market totals not yet revealed")]
    NotYetRevealed,
    #[msg("Outcome commitment verification failed")]
    InvalidCommitment,
    #[msg("No Arcium cluster configured for this MXE")]
    ClusterNotSet,
    #[msg("League name must be 1–50 characters")]
    LeagueNameTooLong,
    #[msg("League is full")]
    LeagueFull,
    #[msg("Not a member of this league")]
    NotLeagueMember,
    #[msg("League is not active")]
    LeagueNotActive,
    #[msg("Only the league creator can advance the gameweek")]
    OnlyCreatorCanAdvanceGameweek,
    #[msg("max_members must be at least 2")]
    LeagueMaxMembersInvalid,
    #[msg("Member score has not been revealed yet")]
    ScoreNotRevealed,
    #[msg("Member score has already been revealed for this gameweek")]
    ScoreAlreadyRevealed,
    #[msg("Must reset score before recording wins for new gameweek")]
    MustResetScore,
    #[msg("Member score not initialised — call init_member_score first")]
    ScoreNotInitialized,
}

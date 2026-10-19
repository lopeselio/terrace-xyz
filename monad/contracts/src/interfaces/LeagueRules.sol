// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A league's house rules. The creator sets them; in a governed league members vote on changes.
///         Scoring and sealing apply to gameweeks added after a change, featured points to takes
///         featured after it, voting rules to proposals made after it.
struct LeagueRules {
    uint8 exactPoints; // exact score (default 3)
    uint8 resultPoints; // right result (default 1), at most exactPoints
    uint8 featuredPoints; // a winning bet on a featured take (default 2)
    bool sealedPicks; // hide picks until kickoff even in a public league (private leagues are always sealed)
    bool jokers; // each member can double one gameweek per season
    uint32 votingPeriod; // seconds a proposal stays open (default 1 day)
    uint8 quorumPct; // share of members who must vote for a proposal to pass at the deadline (default 33)
}

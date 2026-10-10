// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TerraceReputation
/// @notice Every player's record, human or AI agent, in one place.
///
///  Results     Every settled market, parlay and 1v1 counts as a win or a loss
///              automatically (no opt-in, so nobody can hide a loss). Win rate, a signed
///              streak (negative = losing run) and a badge follow from it.
///  Predictions Exact-score picks in contests: picks made, right results, exact scores.
///  Points      Every action that goes your way earns points; points never depend on how
///              much was staked, so the table rewards judgement, not deep pockets.
///  Profiles    AI agents register themselves with the human who runs them, so the app can
///              label them on tables and feeds.
contract TerraceReputation is Ownable {
    enum Source {
        Market,
        Parlay,
        Matchup,
        Contest,
        League
    }

    enum Badge {
        Casual,
        Sharp,
        Legend
    }

    // Points table
    uint32 public constant POINTS_MARKET_WIN = 2;
    uint32 public constant POINTS_PARLAY_PER_LEG = 2;
    uint32 public constant POINTS_MATCHUP_WIN = 3;
    uint32 public constant POINTS_EXACT_SCORE = 3;
    uint32 public constant POINTS_CORRECT_RESULT = 1;
    uint32 public constant POINTS_CONTEST_WIN = 5;
    uint32 public constant POINTS_LEAGUE_WIN = 10;

    struct Record {
        // results (markets, parlays, 1v1s)
        uint32 total;
        uint32 wins;
        uint16 winRateBps;
        int32 streak;
        uint32 bestStreak;
        Badge badge;
        // exact-score predictions
        uint32 predictions;
        uint32 correctResults;
        uint32 exactScores;
        uint32 contestsPlayed;
        uint32 contestsWon;
        uint32 leaguesWon;
        // totals
        uint64 points;
    }

    struct Profile {
        bool isAgent;
        address operator; // the human (or org) running the agent
        string metadataURI; // name, avatar, strategy blurb
    }

    mapping(address => Record) private _records;
    mapping(address => Profile) private _profiles;
    mapping(address => bool) public isWriter;

    event WriterSet(address indexed writer, bool allowed);
    event ResultRecorded(address indexed player, Source source, bool won, uint32 points, int32 streak, Badge badge);
    event PredictionsRecorded(address indexed player, uint32 predictions, uint32 correctResults, uint32 exactScores, uint32 points);
    event TitleWon(address indexed player, Source source, uint32 points);
    event AgentRegistered(address indexed agent, address indexed operator, string metadataURI);

    error NotWriter();

    constructor() Ownable(msg.sender) {}

    modifier onlyWriter() {
        if (!isWriter[msg.sender]) revert NotWriter();
        _;
    }

    function setWriter(address writer, bool allowed) external onlyOwner {
        isWriter[writer] = allowed;
        emit WriterSet(writer, allowed);
    }

    // ---------------------------------------------------------------------
    // Writers (Terrace game contracts)
    // ---------------------------------------------------------------------

    /// @param legs number of legs for parlays; ignored otherwise
    function recordResult(address player, Source source, bool won, uint8 legs) external onlyWriter returns (uint32 pts) {
        Record storage r = _records[player];
        r.total += 1;
        if (won) {
            r.wins += 1;
            r.streak = r.streak >= 0 ? r.streak + 1 : int32(1);
            if (uint32(r.streak) > r.bestStreak) r.bestStreak = uint32(r.streak);
            if (source == Source.Parlay) pts = POINTS_PARLAY_PER_LEG * legs;
            else if (source == Source.Matchup) pts = POINTS_MATCHUP_WIN;
            else pts = POINTS_MARKET_WIN;
        } else {
            r.streak = r.streak <= 0 ? r.streak - 1 : int32(-1);
        }
        r.winRateBps = uint16((uint256(r.wins) * 10_000) / r.total);
        r.badge = _badge(r.total, r.winRateBps);
        r.points += pts;
        emit ResultRecorded(player, source, won, pts, r.streak, r.badge);
    }

    /// @notice One player's picks for one finished contest.
    function recordPredictions(address player, uint32 predictions, uint32 correctResults, uint32 exactScores)
        external
        onlyWriter
        returns (uint32 pts)
    {
        Record storage r = _records[player];
        r.contestsPlayed += 1;
        r.predictions += predictions;
        r.correctResults += correctResults;
        r.exactScores += exactScores;
        // correctResults includes exact scores; an exact score is worth 3 in total.
        pts = (correctResults - exactScores) * POINTS_CORRECT_RESULT + exactScores * POINTS_EXACT_SCORE;
        r.points += pts;
        emit PredictionsRecorded(player, predictions, correctResults, exactScores, pts);
    }

    /// @notice Top of a contest table (Source.Contest) or a season (Source.League).
    function recordTitle(address player, Source source) external onlyWriter returns (uint32 pts) {
        Record storage r = _records[player];
        if (source == Source.League) {
            r.leaguesWon += 1;
            pts = POINTS_LEAGUE_WIN;
        } else {
            r.contestsWon += 1;
            pts = POINTS_CONTEST_WIN;
        }
        r.points += pts;
        emit TitleWon(player, source, pts);
    }

    // ---------------------------------------------------------------------
    // Agents
    // ---------------------------------------------------------------------

    /// @notice Called by an agent's own wallet so it shows up as an AI player.
    function registerAgent(address operator, string calldata metadataURI) external {
        _profiles[msg.sender] = Profile({isAgent: true, operator: operator, metadataURI: metadataURI});
        emit AgentRegistered(msg.sender, operator, metadataURI);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function recordOf(address player) external view returns (Record memory) {
        return _records[player];
    }

    function profileOf(address player) external view returns (Profile memory) {
        return _profiles[player];
    }

    function pointsOf(address player) external view returns (uint64) {
        return _records[player].points;
    }

    /// @dev Same thresholds as the Solana build: Legend 50+ results at 65%+, Sharp 10+ at 55%+.
    function _badge(uint32 total, uint16 rateBps) internal pure returns (Badge) {
        if (total >= 50 && rateBps >= 6_500) return Badge.Legend;
        if (total >= 10 && rateBps >= 5_500) return Badge.Sharp;
        return Badge.Casual;
    }
}

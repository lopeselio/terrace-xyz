// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Answer, ITerraceOracle} from "./interfaces/ITerraceOracle.sol";
import {TerraceReputation} from "./TerraceReputation.sol";

/// @title TerraceMatchups
/// @notice 1v1 challenges. You pick a side on a question and put up a stake; your mate
///         takes the other side by matching it. Winner takes both stakes.
///
///  - Challenge a specific mate, or leave the opponent empty for an open link anyone can accept.
///  - Either player can call it off before it's accepted.
///  - Not accepted by kickoff? Anyone can return the challenger's stake.
///  - Void question: both stakes go back. Every result lands on both players' records and
///    on their head-to-head.
contract TerraceMatchups is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_STAKE = 100_000; // 0.10 tUSD

    enum Status {
        Pending,
        Accepted,
        Declined,
        Expired,
        Settled,
        Refunded
    }

    struct Matchup {
        address challenger;
        address opponent; // address(0) until an open challenge is accepted
        uint256 questionId;
        IERC20 token;
        uint128 stake;
        uint8 challengerSide; // Answer.YES or Answer.NO
        Status status;
        address winner;
    }

    ITerraceOracle public immutable oracle;
    TerraceReputation public immutable reputation;

    Matchup[] private _matchups;
    /// @notice headToHead[a][b] = how many times a has beaten b
    mapping(address => mapping(address => uint32)) public headToHead;

    event MatchupCreated(uint256 indexed matchupId, address indexed challenger, address indexed opponent, uint256 questionId, uint8 challengerSide, address token, uint256 stake);
    event MatchupAccepted(uint256 indexed matchupId, address indexed opponent);
    event MatchupCalledOff(uint256 indexed matchupId, Status status, address by);
    event MatchupSettled(uint256 indexed matchupId, address indexed winner, uint256 payout);
    event MatchupRefunded(uint256 indexed matchupId);

    error BadInput();
    error StakeTooSmall();
    error QuestionClosed();
    error NotPending();
    error NotAccepted();
    error NotYourChallenge();
    error StillOpen();
    error NotResolved();

    constructor(ITerraceOracle oracle_, TerraceReputation reputation_) {
        oracle = oracle_;
        reputation = reputation_;
    }

    function challenge(address opponent, uint256 questionId, uint8 side, IERC20 token, uint256 stake)
        external
        nonReentrant
        returns (uint256 matchupId)
    {
        if (opponent == msg.sender) revert BadInput();
        if (!oracle.isSettlementToken(address(token))) revert BadInput();
        if (side != Answer.YES && side != Answer.NO) revert BadInput();
        if (!oracle.questionExists(questionId)) revert BadInput();
        if (oracle.closeTimeOf(questionId) <= block.timestamp) revert QuestionClosed();
        if (stake < MIN_STAKE) revert StakeTooSmall();

        matchupId = _matchups.length;
        _matchups.push(
            Matchup({challenger: msg.sender, opponent: opponent, questionId: questionId, token: token, stake: uint128(stake), challengerSide: side, status: Status.Pending, winner: address(0)})
        );
        token.safeTransferFrom(msg.sender, address(this), stake);
        emit MatchupCreated(matchupId, msg.sender, opponent, questionId, side, address(token), stake);
    }

    /// @notice Take the other side by matching the stake.
    function accept(uint256 matchupId) external nonReentrant {
        Matchup storage m = _matchups[matchupId];
        if (m.status != Status.Pending) revert NotPending();
        if (m.opponent == address(0)) {
            if (msg.sender == m.challenger) revert NotYourChallenge();
            m.opponent = msg.sender;
        } else if (msg.sender != m.opponent) {
            revert NotYourChallenge();
        }
        if (oracle.closeTimeOf(m.questionId) <= block.timestamp) revert QuestionClosed();

        m.status = Status.Accepted;
        m.token.safeTransferFrom(msg.sender, address(this), m.stake);
        emit MatchupAccepted(matchupId, msg.sender);
    }

    /// @notice Either player can call off a challenge that hasn't been accepted.
    function decline(uint256 matchupId) external nonReentrant {
        Matchup storage m = _matchups[matchupId];
        if (m.status != Status.Pending) revert NotPending();
        if (msg.sender != m.challenger && (m.opponent == address(0) || msg.sender != m.opponent)) revert NotYourChallenge();
        _callOff(matchupId, Status.Declined);
    }

    /// @notice Nobody accepted before kickoff: return the challenger's stake. Anyone can call it.
    function expire(uint256 matchupId) external nonReentrant {
        Matchup storage m = _matchups[matchupId];
        if (m.status != Status.Pending) revert NotPending();
        if (oracle.closeTimeOf(m.questionId) > block.timestamp) revert StillOpen();
        _callOff(matchupId, Status.Expired);
    }

    /// @notice Pay the winner once the question is answered. Anyone can call it.
    function settle(uint256 matchupId) external nonReentrant {
        Matchup storage m = _matchups[matchupId];
        if (m.status != Status.Accepted) revert NotAccepted();
        uint8 answer = oracle.outcomeOf(m.questionId);
        if (answer == Answer.OPEN) revert NotResolved();

        if (answer == Answer.VOID) {
            m.status = Status.Refunded;
            m.token.safeTransfer(m.challenger, m.stake);
            m.token.safeTransfer(m.opponent, m.stake);
            emit MatchupRefunded(matchupId);
            return;
        }

        (address winner, address loser) = answer == m.challengerSide ? (m.challenger, m.opponent) : (m.opponent, m.challenger);
        m.status = Status.Settled;
        m.winner = winner;
        headToHead[winner][loser] += 1;
        reputation.recordResult(winner, TerraceReputation.Source.Matchup, true, 0);
        reputation.recordResult(loser, TerraceReputation.Source.Matchup, false, 0);

        uint256 payout = uint256(m.stake) * 2;
        m.token.safeTransfer(winner, payout);
        emit MatchupSettled(matchupId, winner, payout);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function matchupCount() external view returns (uint256) {
        return _matchups.length;
    }

    function getMatchup(uint256 matchupId) external view returns (Matchup memory) {
        return _matchups[matchupId];
    }

    /// @return aWins wins for a over b
    /// @return bWins wins for b over a
    function rivalry(address a, address b) external view returns (uint32 aWins, uint32 bWins) {
        return (headToHead[a][b], headToHead[b][a]);
    }

    function _callOff(uint256 matchupId, Status status) internal {
        Matchup storage m = _matchups[matchupId];
        m.status = status;
        m.token.safeTransfer(m.challenger, m.stake);
        emit MatchupCalledOff(matchupId, status, msg.sender);
    }
}

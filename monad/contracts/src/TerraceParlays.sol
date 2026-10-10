// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Answer, ITerraceOracle} from "./interfaces/ITerraceOracle.sol";
import {TerraceReputation} from "./TerraceReputation.sol";

/// @title TerraceParlays
/// @notice Accumulators: 2 to 8 picks that all have to come in.
///
///  Every accumulator joins the weekly pot, for its token, for the week its last leg closes in. When the
///  week is over and every accumulator in it is settled, the winners split the whole pot
///  in proportion to stake x legs, so longer accumulators pay more and the pot can never
///  pay out more than it holds. If nobody wins, everyone gets their stake back.
///  A void leg is dropped; an accumulator whose legs are all void is refunded at once.
contract TerraceParlays is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_STAKE = 100_000; // 0.10 tUSD
    uint8 public constant MIN_LEGS = 2;
    uint8 public constant MAX_LEGS = 8;
    uint64 public constant POT_PERIOD = 1 weeks;

    enum Status {
        Open,
        Won,
        Lost,
        Refunded,
        Paid
    }

    struct Leg {
        uint256 questionId;
        uint8 side; // Answer.YES or Answer.NO
    }

    struct Parlay {
        address player;
        IERC20 token;
        uint128 stake;
        uint64 potId;
        uint8 liveLegs; // legs that weren't void, set at settlement
        Status status;
    }

    struct Pot {
        uint128 total;
        uint32 unsettled;
        uint256 winningWeight;
    }

    ITerraceOracle public immutable oracle;
    TerraceReputation public immutable reputation;

    Parlay[] private _parlays;
    mapping(uint256 => Leg[]) private _legs;
    /// @notice pots[token][week]: each token has its own weekly pot
    mapping(IERC20 => mapping(uint64 => Pot)) public pots;

    event ParlayPlaced(uint256 indexed parlayId, address indexed player, uint64 indexed potId, address token, uint256 stake, uint8 legs);
    event ParlaySettled(uint256 indexed parlayId, Status status, uint8 liveLegs);
    event ParlayPaid(uint256 indexed parlayId, address indexed player, uint256 payout);

    error BadInput();
    error StakeTooSmall();
    error LegClosed(uint256 questionId);
    error DuplicateLeg(uint256 questionId);
    error NotOpen();
    error LegsPending();
    error PotStillOpen();
    error NothingToPay();

    constructor(ITerraceOracle oracle_, TerraceReputation reputation_) {
        oracle = oracle_;
        reputation = reputation_;
    }

    function placeParlay(Leg[] calldata legs, IERC20 token, uint256 stake) external nonReentrant returns (uint256 parlayId) {
        uint256 n = legs.length;
        if (!oracle.isSettlementToken(address(token))) revert BadInput();
        if (n < MIN_LEGS || n > MAX_LEGS) revert BadInput();
        if (stake < MIN_STAKE) revert StakeTooSmall();

        uint64 lastClose;
        parlayId = _parlays.length;
        for (uint256 i; i < n; ++i) {
            Leg calldata leg = legs[i];
            if (leg.side != Answer.YES && leg.side != Answer.NO) revert BadInput();
            if (!oracle.questionExists(leg.questionId)) revert BadInput();
            uint64 close = oracle.closeTimeOf(leg.questionId);
            if (close <= block.timestamp) revert LegClosed(leg.questionId);
            for (uint256 j; j < i; ++j) {
                if (legs[j].questionId == leg.questionId) revert DuplicateLeg(leg.questionId);
            }
            if (close > lastClose) lastClose = close;
            _legs[parlayId].push(leg);
        }

        uint64 potId = lastClose / POT_PERIOD;
        _parlays.push(Parlay({player: msg.sender, token: token, stake: uint128(stake), potId: potId, liveLegs: 0, status: Status.Open}));
        Pot storage pot = pots[token][potId];
        pot.total += uint128(stake);
        pot.unsettled += 1;

        token.safeTransferFrom(msg.sender, address(this), stake);
        emit ParlayPlaced(parlayId, msg.sender, potId, address(token), stake, uint8(n));
    }

    /// @notice Grade an accumulator once all its legs have answers. Anyone can call it.
    function settleParlay(uint256 parlayId) public nonReentrant {
        Parlay storage p = _parlays[parlayId];
        if (p.status != Status.Open) revert NotOpen();

        Leg[] storage legs = _legs[parlayId];
        bool lost;
        uint8 live;
        for (uint256 i; i < legs.length; ++i) {
            uint8 answer = oracle.outcomeOf(legs[i].questionId);
            if (answer == Answer.OPEN) revert LegsPending();
            if (answer == Answer.VOID) continue;
            ++live;
            if (answer != legs[i].side) lost = true;
        }

        Pot storage pot = pots[p.token][p.potId];
        pot.unsettled -= 1;
        p.liveLegs = live;

        if (lost) {
            p.status = Status.Lost;
            reputation.recordResult(p.player, TerraceReputation.Source.Parlay, false, live);
        } else if (live == 0) {
            p.status = Status.Refunded;
            pot.total -= p.stake;
            p.token.safeTransfer(p.player, p.stake);
        } else {
            p.status = Status.Won;
            pot.winningWeight += uint256(p.stake) * live;
            reputation.recordResult(p.player, TerraceReputation.Source.Parlay, true, live);
        }
        emit ParlaySettled(parlayId, p.status, live);
    }

    function settleMany(uint256[] calldata parlayIds) external {
        for (uint256 i; i < parlayIds.length; ++i) {
            if (_parlays[parlayIds[i]].status == Status.Open) settleParlay(parlayIds[i]);
        }
    }

    /// @notice Collect from the pot once its week is over and every accumulator in it is graded.
    function claim(uint256 parlayId) external nonReentrant returns (uint256 payout) {
        Parlay storage p = _parlays[parlayId];
        Pot storage pot = pots[p.token][p.potId];
        if (block.timestamp < (uint256(p.potId) + 1) * POT_PERIOD || pot.unsettled != 0) revert PotStillOpen();

        if (p.status == Status.Won) {
            payout = (uint256(pot.total) * p.stake * p.liveLegs) / pot.winningWeight;
        } else if (p.status == Status.Lost && pot.winningWeight == 0) {
            payout = p.stake; // nobody won this week: stakes come back
        } else {
            revert NothingToPay();
        }
        p.status = Status.Paid;
        p.token.safeTransfer(p.player, payout);
        emit ParlayPaid(parlayId, p.player, payout);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function parlayCount() external view returns (uint256) {
        return _parlays.length;
    }

    function getParlay(uint256 parlayId) external view returns (Parlay memory parlay, Leg[] memory legs) {
        return (_parlays[parlayId], _legs[parlayId]);
    }

    /// @notice What a winning accumulator would collect if the pot closed now.
    function projectedPayout(uint256 parlayId) external view returns (uint256) {
        Parlay storage p = _parlays[parlayId];
        Pot storage pot = pots[p.token][p.potId];
        if (p.status != Status.Won || pot.winningWeight == 0) return 0;
        return (uint256(pot.total) * p.stake * p.liveLegs) / pot.winningWeight;
    }

    function potEndsAt(uint64 potId) external pure returns (uint256) {
        return (uint256(potId) + 1) * POT_PERIOD;
    }
}

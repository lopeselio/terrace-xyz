// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Interface the Chainlink KeystoneForwarder calls to deliver CRE reports.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title TerraceLeagues
/// @notice Free-to-play football prediction contests on Monad.
///         - The owner lists fixtures (id = the data provider's match id).
///         - Anyone creates a contest (friend league or sponsored), optionally funding a prize pool.
///         - Players predict exact scores for free before the first kickoff.
///         - A Chainlink CRE workflow writes final scores through the forwarder.
///         - Anyone finalizes a contest once every fixture is settled: prizes pay out
///           and each player's onchain reputation updates.
///         Scoring: exact score = 3 points, correct result (W/D/L) = 1 point.
contract TerraceLeagues is IReceiver, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_ENTRANTS = 200;
    uint256 public constant MAX_FIXTURES_PER_CONTEST = 20;

    struct Fixture {
        uint64 kickoff;
        bool exists;
        bool settled;
        uint8 homeGoals;
        uint8 awayGoals;
    }

    struct Contest {
        address creator;
        IERC20 prizeToken;   // address(0) = no prize, bragging rights only
        uint256 prizePool;
        uint64 lockTime;     // earliest kickoff among its fixtures
        bool finalized;
        uint256[] fixtureIds;
        address[] entrants;
    }

    struct Prediction {
        bool set;
        uint8 home;
        uint8 away;
    }

    struct Reputation {
        uint32 contestsPlayed;
        uint32 contestsWon;
        uint32 predictions;
        uint32 correctResults; // includes exact scores
        uint32 exactScores;
        uint32 currentStreak;  // consecutive correct results
        uint32 bestStreak;
        uint64 points;
    }

    address public forwarder;

    mapping(uint256 => Fixture) public fixtures;
    uint256[] private _fixtureIds;

    Contest[] private _contests;
    mapping(uint256 => mapping(address => mapping(uint256 => Prediction))) private _predictions;
    mapping(uint256 => mapping(address => bool)) public hasEntered;

    mapping(address => Reputation) public reputation;

    event ForwarderUpdated(address indexed forwarder);
    event FixtureAdded(uint256 indexed fixtureId, uint64 kickoff);
    event FixtureSettled(uint256 indexed fixtureId, uint8 homeGoals, uint8 awayGoals);
    event ContestCreated(uint256 indexed contestId, address indexed creator, address prizeToken, uint256 prizePool, uint64 lockTime);
    event PredictionsSubmitted(uint256 indexed contestId, address indexed player);
    event ContestFinalized(uint256 indexed contestId, address[] winners, uint256 topScore, uint256 prizePerWinner);

    error NotForwarder();
    error UnknownFixture(uint256 fixtureId);
    error FixtureAlreadyExists(uint256 fixtureId);
    error BadInput();
    error ContestLocked();
    error ContestFull();
    error NotReady();
    error AlreadyFinalized();

    constructor(address forwarder_) Ownable(msg.sender) {
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Switch between the simulation MockKeystoneForwarder and the production KeystoneForwarder.
    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    function addFixtures(uint256[] calldata ids, uint64[] calldata kickoffs) external onlyOwner {
        if (ids.length != kickoffs.length) revert BadInput();
        for (uint256 i; i < ids.length; ++i) {
            if (fixtures[ids[i]].exists) revert FixtureAlreadyExists(ids[i]);
            fixtures[ids[i]] = Fixture({kickoff: kickoffs[i], exists: true, settled: false, homeGoals: 0, awayGoals: 0});
            _fixtureIds.push(ids[i]);
            emit FixtureAdded(ids[i], kickoffs[i]);
        }
    }

    // ---------------------------------------------------------------------
    // Contests
    // ---------------------------------------------------------------------

    function createContest(uint256[] calldata fixtureIds, IERC20 prizeToken, uint256 prizePool)
        external
        returns (uint256 contestId)
    {
        uint256 n = fixtureIds.length;
        if (n == 0 || n > MAX_FIXTURES_PER_CONTEST) revert BadInput();
        if ((address(prizeToken) == address(0)) != (prizePool == 0)) revert BadInput();

        uint64 lock = type(uint64).max;
        for (uint256 i; i < n; ++i) {
            Fixture storage f = fixtures[fixtureIds[i]];
            if (!f.exists) revert UnknownFixture(fixtureIds[i]);
            if (f.kickoff < lock) lock = f.kickoff;
        }
        if (lock <= block.timestamp) revert ContestLocked();

        contestId = _contests.length;
        Contest storage c = _contests.push();
        c.creator = msg.sender;
        c.prizeToken = prizeToken;
        c.prizePool = prizePool;
        c.lockTime = lock;
        c.fixtureIds = fixtureIds;

        if (prizePool > 0) prizeToken.safeTransferFrom(msg.sender, address(this), prizePool);

        emit ContestCreated(contestId, msg.sender, address(prizeToken), prizePool, lock);
    }

    /// @notice Free entry. Can be called again to update predictions until the contest locks.
    /// @param home predicted home goals, in the same order as the contest's fixtureIds
    /// @param away predicted away goals, in the same order as the contest's fixtureIds
    function submitPredictions(uint256 contestId, uint8[] calldata home, uint8[] calldata away) external {
        Contest storage c = _contests[contestId];
        uint256 n = c.fixtureIds.length;
        if (home.length != n || away.length != n) revert BadInput();
        if (block.timestamp >= c.lockTime) revert ContestLocked();

        if (!hasEntered[contestId][msg.sender]) {
            if (c.entrants.length >= MAX_ENTRANTS) revert ContestFull();
            hasEntered[contestId][msg.sender] = true;
            c.entrants.push(msg.sender);
        }

        for (uint256 i; i < n; ++i) {
            _predictions[contestId][msg.sender][c.fixtureIds[i]] = Prediction({set: true, home: home[i], away: away[i]});
        }
        emit PredictionsSubmitted(contestId, msg.sender);
    }

    /// @notice Settles prizes and reputation once every fixture in the contest has a final score.
    function finalizeContest(uint256 contestId) external {
        Contest storage c = _contests[contestId];
        if (c.finalized) revert AlreadyFinalized();
        for (uint256 i; i < c.fixtureIds.length; ++i) {
            if (!fixtures[c.fixtureIds[i]].settled) revert NotReady();
        }
        c.finalized = true;

        uint256 nPlayers = c.entrants.length;
        uint256[] memory scores = new uint256[](nPlayers);
        uint256 top;

        for (uint256 p; p < nPlayers; ++p) {
            uint256 s = _scoreAndRecord(contestId, c.entrants[p], c.fixtureIds);
            scores[p] = s;
            if (s > top) top = s;
        }

        // Winners = everyone on the top score (ties split the pot). No winners if nobody scored.
        uint256 nWinners;
        if (top > 0) {
            for (uint256 p; p < nPlayers; ++p) if (scores[p] == top) ++nWinners;
        }
        address[] memory winners = new address[](nWinners);
        uint256 w;
        if (nWinners > 0) {
            for (uint256 p; p < nPlayers; ++p) {
                if (scores[p] == top) {
                    winners[w++] = c.entrants[p];
                    reputation[c.entrants[p]].contestsWon += 1;
                }
            }
        }

        uint256 prizeEach;
        if (c.prizePool > 0) {
            if (nWinners == 0) {
                // Nobody scored: refund the creator.
                c.prizeToken.safeTransfer(c.creator, c.prizePool);
            } else {
                prizeEach = c.prizePool / nWinners;
                uint256 dust = c.prizePool - prizeEach * nWinners;
                for (uint256 i; i < nWinners; ++i) {
                    c.prizeToken.safeTransfer(winners[i], prizeEach + (i == 0 ? dust : 0));
                }
            }
        }

        emit ContestFinalized(contestId, winners, top, prizeEach);
    }

    // ---------------------------------------------------------------------
    // Chainlink CRE receiver
    // ---------------------------------------------------------------------

    /// @dev Report payload: abi.encode(uint256[] fixtureIds, uint8[] homeGoals, uint8[] awayGoals)
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder();
        (uint256[] memory ids, uint8[] memory home, uint8[] memory away) =
            abi.decode(report, (uint256[], uint8[], uint8[]));
        if (ids.length != home.length || ids.length != away.length) revert BadInput();

        for (uint256 i; i < ids.length; ++i) {
            Fixture storage f = fixtures[ids[i]];
            // Skip unknown or already-settled fixtures so one bad entry can't block the batch.
            if (!f.exists || f.settled) continue;
            f.settled = true;
            f.homeGoals = home[i];
            f.awayGoals = away[i];
            emit FixtureSettled(ids[i], home[i], away[i]);
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ---------------------------------------------------------------------
    // Views (used by the CRE workflow and the frontend)
    // ---------------------------------------------------------------------

    /// @notice Fixtures that have kicked off but have no result yet. The CRE workflow polls this.
    function pendingFixtures() external view returns (uint256[] memory ids) {
        uint256 total = _fixtureIds.length;
        uint256 count;
        for (uint256 i; i < total; ++i) {
            Fixture storage f = fixtures[_fixtureIds[i]];
            if (!f.settled && f.kickoff <= block.timestamp) ++count;
        }
        ids = new uint256[](count);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            Fixture storage f = fixtures[_fixtureIds[i]];
            if (!f.settled && f.kickoff <= block.timestamp) ids[j++] = _fixtureIds[i];
        }
    }

    function contestCount() external view returns (uint256) {
        return _contests.length;
    }

    function getContest(uint256 contestId)
        external
        view
        returns (
            address creator,
            address prizeToken,
            uint256 prizePool,
            uint64 lockTime,
            bool finalized,
            uint256[] memory fixtureIds,
            address[] memory entrants
        )
    {
        Contest storage c = _contests[contestId];
        return (c.creator, address(c.prizeToken), c.prizePool, c.lockTime, c.finalized, c.fixtureIds, c.entrants);
    }

    function getPrediction(uint256 contestId, address player, uint256 fixtureId)
        external
        view
        returns (Prediction memory)
    {
        return _predictions[contestId][player][fixtureId];
    }

    /// @notice Live score for leaderboards; counts only fixtures already settled.
    function currentScore(uint256 contestId, address player) external view returns (uint256 s) {
        Contest storage c = _contests[contestId];
        for (uint256 i; i < c.fixtureIds.length; ++i) {
            uint256 fid = c.fixtureIds[i];
            if (!fixtures[fid].settled) continue;
            (uint256 pts,,) = _score(_predictions[contestId][player][fid], fixtures[fid]);
            s += pts;
        }
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Scores one player's predictions for a finished contest and updates their reputation.
    function _scoreAndRecord(uint256 contestId, address player, uint256[] storage fixtureIds)
        internal
        returns (uint256 total)
    {
        Reputation storage r = reputation[player];
        r.contestsPlayed += 1;
        for (uint256 i; i < fixtureIds.length; ++i) {
            uint256 fid = fixtureIds[i];
            (uint256 pts, bool correct, bool exact) = _score(_predictions[contestId][player][fid], fixtures[fid]);
            total += pts;
            r.predictions += 1;
            if (correct) {
                r.correctResults += 1;
                r.currentStreak += 1;
                if (r.currentStreak > r.bestStreak) r.bestStreak = r.currentStreak;
            } else {
                r.currentStreak = 0;
            }
            if (exact) r.exactScores += 1;
        }
        r.points += uint64(total);
    }

    function _score(Prediction memory p, Fixture memory f)
        internal
        pure
        returns (uint256 pts, bool correctResult, bool exact)
    {
        if (!p.set) return (0, false, false);
        exact = p.home == f.homeGoals && p.away == f.awayGoals;
        correctResult = _sign(p.home, p.away) == _sign(f.homeGoals, f.awayGoals);
        pts = exact ? 3 : (correctResult ? 1 : 0);
    }

    function _sign(uint8 h, uint8 a) internal pure returns (int8) {
        return h > a ? int8(1) : (h < a ? int8(-1) : int8(0));
    }
}

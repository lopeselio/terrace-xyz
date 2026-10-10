// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Answer, ITerraceOracle, ITerraceReportHandler} from "./interfaces/ITerraceOracle.sol";
import {TerraceReputation} from "./TerraceReputation.sol";

interface ITerraceMarketsView {
    function questionOf(uint256 marketId) external view returns (uint256);
    function backedWinner(uint256 marketId, address bettor) external view returns (bool);
}

/// @title TerraceLeagues
/// @notice Exact-score contests, and season-long leagues built from them.
///
///  Contests   Pick the exact score of every match in the set. Exact score = 3 points,
///             right result = 1. Picks lock at the first kickoff. The prize pool comes from
///             the creator and from entry fees; the top score takes it (ties split). If
///             nobody scores, the creator's pool and every entry fee go back.
///
///  Leagues    A named league for a season, with an optional entry fee and invite code.
///             The creator adds one contest per gameweek; only members can play them.
///             Gameweek points and market wins on that gameweek's matches add up to the
///             season table, and when the last gameweek is done the league prize pays out.
///
///  Sealed     Picks can be sealed: you post keccak256(contestId, you, home[], away[], salt)
///             plus the picks encrypted to the CRE reveal key. CRE opens them and the
///             contract checks every reveal against its commitment.
///             - Sealed contests open at kickoff, so nobody can copy your picks.
///             - Private leagues keep picks sealed until the whole gameweek has been played,
///               so the table stays hidden until the gameweek ends.
contract TerraceLeagues is ITerraceReportHandler, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant REPORT_REVEAL_PICKS = 17; // (uint256 contestId, address[] players, uint8[][] home, uint8[][] away, bytes32[] salts)

    uint256 public constant MAX_ENTRANTS = 200;
    uint256 public constant MAX_FIXTURES_PER_CONTEST = 20;
    uint256 public constant MAX_NAME_BYTES = 50;
    uint64 public constant REVEAL_WINDOW = 4 days; // longer than the oracle grace, so late results still leave time to reveal

    struct Contest {
        address creator;
        IERC20 token; // prize and entry-fee token (address(0) for free contests)
        uint256 leagueId; // 0 = standalone
        uint128 prizePool; // creator-funded part
        uint128 entryFee;
        uint64 lockTime; // earliest kickoff, fixed at creation
        bool sealed_;
        bool finalized;
        uint32 unrevealed;
        uint256[] fixtureIds;
        address[] entrants;
    }

    struct League {
        address creator;
        IERC20 token; // entry-fee token (address(0) for free leagues)
        bool governed; // true = members vote on gameweeks and featured takes; false = the creator runs it
        string name;
        uint16 season;
        uint8 gameweeks; // planned
        uint8 maxMembers;
        bool isPrivate; // hidden tables
        bool ended;
        uint128 entryFee;
        uint128 prizePool;
        bytes32 inviteCodeHash; // 0 = anyone can join
        uint256[] contestIds; // one per gameweek
        address[] members;
    }

    struct Pick {
        bool set;
        uint8 home;
        uint8 away;
    }

    ITerraceOracle public immutable oracle;
    TerraceReputation public immutable reputation;
    ITerraceMarketsView public immutable markets;
    /// @notice TerraceGovernance, set once after deployment.
    address public governance;
    address private immutable _deployer;

    Contest[] private _contests;
    mapping(uint256 => mapping(address => mapping(uint256 => Pick))) private _picks;
    mapping(uint256 => mapping(address => bool)) public hasEntered;
    mapping(uint256 => mapping(address => bytes32)) public pickCommitment;
    mapping(uint256 => mapping(address => bytes)) public sealedPicks;
    mapping(uint256 => mapping(address => uint256)) public contestScore;

    League[] private _leagues; // id = index + 1
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => uint256)) public seasonScore;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public marketWinCounted;
    /// @notice Takes a league voted to count towards its table: featuredMarket[leagueId][marketId]
    mapping(uint256 => mapping(uint256 => bool)) public featuredMarket;
    uint256 public constant FEATURED_TAKE_POINTS = 2;

    event ContestCreated(uint256 indexed contestId, address indexed creator, uint256 indexed leagueId, uint256 prizePool, uint256 entryFee, uint64 lockTime, bool sealed_);
    event PicksSubmitted(uint256 indexed contestId, address indexed player);
    event SealedPicksSubmitted(uint256 indexed contestId, address indexed player, bytes32 commitment, bytes ciphertext);
    event PicksRevealed(uint256 indexed contestId, address indexed player, bool valid);
    event ContestFinalized(uint256 indexed contestId, address[] winners, uint256 topScore, uint256 prizePerWinner);
    event LeagueCreated(uint256 indexed leagueId, address indexed creator, string name, uint16 season, uint8 gameweeks, uint256 entryFee, bool isPrivate);
    event LeagueJoined(uint256 indexed leagueId, address indexed member);
    event GameweekAdded(uint256 indexed leagueId, uint8 gameweek, uint256 contestId);
    event MarketWinCounted(uint256 indexed leagueId, uint256 indexed marketId, address indexed member, uint256 seasonScore);
    event TakeFeatured(uint256 indexed leagueId, uint256 indexed marketId);
    event GovernanceSet(address governance);
    event SeasonEnded(uint256 indexed leagueId, address[] champions, uint256 topScore, uint256 prizePerChampion);

    error BadInput();
    error UnknownFixture(uint256 fixtureId);
    error ContestLocked();
    error ContestFull();
    error NotReady();
    error AlreadyFinalized();
    error NotSealed();
    error SealedContest();
    error AlreadyEntered();
    error RevealNotOpen();
    error RevealsPending();
    error NotOracle();
    error UnknownLeague();
    error NotLeagueCreator();
    error NotMember();
    error AlreadyMember();
    error LeagueFull();
    error WrongInviteCode();
    error LeagueEnded();
    error TooManyGameweeks();
    error NotThisGameweek();
    error AlreadyCounted();
    error DidNotWin();
    error NotGovernance();

    constructor(ITerraceOracle oracle_, TerraceReputation reputation_, ITerraceMarketsView markets_) {
        oracle = oracle_;
        reputation = reputation_;
        markets = markets_;
        _deployer = msg.sender;
    }

    /// @notice Wire in TerraceGovernance once (it needs this contract's address first).
    function setGovernance(address governance_) external {
        if (msg.sender != _deployer || governance != address(0)) revert NotGovernance();
        governance = governance_;
        emit GovernanceSet(governance_);
    }

    // =====================================================================
    // Contests
    // =====================================================================

    /// @param prizePool tUSD the creator puts up front (0 for bragging rights)
    /// @param entryFee tUSD each player pays to enter (0 = free)
    function createContest(uint256[] calldata fixtureIds, IERC20 token, uint256 prizePool, uint256 entryFee, bool sealed_)
        external
        nonReentrant
        returns (uint256 contestId)
    {
        _checkToken(token, prizePool + entryFee);
        contestId = _newContest(fixtureIds, 0, token, prizePool, entryFee, sealed_);
        if (prizePool > 0) token.safeTransferFrom(msg.sender, address(this), prizePool);
    }

    /// @notice Enter (or change your picks) until the first kickoff.
    /// @param home predicted home goals, in the same order as the contest's fixtureIds
    /// @param away predicted away goals, in the same order as the contest's fixtureIds
    function submitPicks(uint256 contestId, uint8[] calldata home, uint8[] calldata away) external nonReentrant {
        Contest storage c = _contests[contestId];
        if (c.sealed_) revert SealedContest();
        uint256 n = c.fixtureIds.length;
        if (home.length != n || away.length != n) revert BadInput();
        _enter(contestId, c);

        for (uint256 i; i < n; ++i) {
            _picks[contestId][msg.sender][c.fixtureIds[i]] = Pick({set: true, home: home[i], away: away[i]});
        }
        emit PicksSubmitted(contestId, msg.sender);
    }

    /// @notice Sealed entry. You can re-seal until the first kickoff.
    function submitSealedPicks(uint256 contestId, bytes32 commitment, bytes calldata ciphertext) external nonReentrant {
        Contest storage c = _contests[contestId];
        if (!c.sealed_) revert NotSealed();
        if (commitment == bytes32(0) || ciphertext.length == 0) revert BadInput();
        bool first = !hasEntered[contestId][msg.sender];
        _enter(contestId, c);
        if (first) c.unrevealed += 1;

        pickCommitment[contestId][msg.sender] = commitment;
        sealedPicks[contestId][msg.sender] = ciphertext;
        emit SealedPicksSubmitted(contestId, msg.sender, commitment, ciphertext);
    }

    function picksCommitment(uint256 contestId, address player, uint8[] memory home, uint8[] memory away, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(contestId, player, home, away, salt));
    }

    /// @notice Batch reveal from the CRE reveal workflow, routed through TerraceOracle.
    function handleReport(uint8 kind, bytes calldata payload) external {
        if (msg.sender != address(oracle)) revert NotOracle();
        if (kind != REPORT_REVEAL_PICKS) revert BadInput();
        (uint256 contestId, address[] memory players, uint8[][] memory home, uint8[][] memory away, bytes32[] memory salts) =
            abi.decode(payload, (uint256, address[], uint8[][], uint8[][], bytes32[]));
        if (players.length != home.length || players.length != away.length || players.length != salts.length) revert BadInput();
        if (!revealOpen(contestId)) revert RevealNotOpen();
        for (uint256 i; i < players.length; ++i) {
            _reveal(contestId, players[i], home[i], away[i], salts[i]);
        }
    }

    /// @notice Reveal your own sealed picks (works even if CRE is down).
    function revealOwn(uint256 contestId, uint8[] calldata home, uint8[] calldata away, bytes32 salt) external {
        if (!revealOpen(contestId)) revert RevealNotOpen();
        _reveal(contestId, msg.sender, home, away, salt);
    }

    /// @notice Score everyone, pay the prize and update records once every match is done.
    function finalizeContest(uint256 contestId) external nonReentrant {
        Contest storage c = _contests[contestId];
        if (c.finalized) revert AlreadyFinalized();

        uint256 nFix = c.fixtureIds.length;
        uint8[] memory states = new uint8[](nFix);
        uint8[] memory hg = new uint8[](nFix);
        uint8[] memory ag = new uint8[](nFix);
        for (uint256 i; i < nFix; ++i) {
            (states[i], hg[i], ag[i]) = oracle.fixtureResult(c.fixtureIds[i]);
            if (states[i] == Answer.FIXTURE_PENDING) revert NotReady();
        }
        if (c.sealed_ && c.unrevealed != 0 && block.timestamp <= revealDeadline(contestId)) revert RevealsPending();
        c.finalized = true;

        uint256 nPlayers = c.entrants.length;
        uint256[] memory scores = new uint256[](nPlayers);
        uint256 top;
        for (uint256 p; p < nPlayers; ++p) {
            address player = c.entrants[p];
            (uint256 s, uint32 made, uint32 correct, uint32 exact) = _score(contestId, player, c.fixtureIds, states, hg, ag);
            scores[p] = s;
            contestScore[contestId][player] = s;
            if (s > top) top = s;
            if (made > 0) reputation.recordPredictions(player, made, correct, exact);
            if (c.leagueId != 0) seasonScore[c.leagueId][player] += s;
        }

        address[] memory winners = _winners(c.entrants, scores, top);
        for (uint256 i; i < winners.length; ++i) {
            reputation.recordTitle(winners[i], TerraceReputation.Source.Contest);
        }

        uint256 prizeEach = _payContest(c, winners);
        emit ContestFinalized(contestId, winners, top, prizeEach);
    }

    // =====================================================================
    // Leagues
    // =====================================================================

    /// @param inviteCodeHash keccak256 of the invite code shared in the link (0 = open league)
    /// @param governed true for a community league where members vote; false for a creator-run one
    function createLeague(
        string calldata name,
        uint16 season,
        uint8 gameweeks,
        uint8 maxMembers,
        IERC20 token,
        uint256 entryFee,
        bool isPrivate,
        bool governed,
        bytes32 inviteCodeHash
    ) external returns (uint256 leagueId) {
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_NAME_BYTES) revert BadInput();
        if (gameweeks == 0 || maxMembers < 2) revert BadInput();
        _checkToken(token, entryFee);

        League storage l = _leagues.push();
        l.creator = msg.sender;
        l.token = token;
        l.governed = governed;
        l.name = name;
        l.season = season;
        l.gameweeks = gameweeks;
        l.maxMembers = maxMembers;
        l.isPrivate = isPrivate;
        l.entryFee = uint128(entryFee);
        l.inviteCodeHash = inviteCodeHash;
        leagueId = _leagues.length;
        emit LeagueCreated(leagueId, msg.sender, name, season, gameweeks, entryFee, isPrivate);
    }

    function joinLeague(uint256 leagueId, string calldata inviteCode) external nonReentrant {
        League storage l = _league(leagueId);
        if (l.ended) revert LeagueEnded();
        if (isMember[leagueId][msg.sender]) revert AlreadyMember();
        if (l.members.length >= l.maxMembers) revert LeagueFull();
        if (l.inviteCodeHash != bytes32(0) && keccak256(bytes(inviteCode)) != l.inviteCodeHash) revert WrongInviteCode();

        isMember[leagueId][msg.sender] = true;
        l.members.push(msg.sender);
        if (l.entryFee > 0) {
            l.prizePool += l.entryFee;
            l.token.safeTransferFrom(msg.sender, address(this), l.entryFee);
        }
        emit LeagueJoined(leagueId, msg.sender);
    }

    /// @notice Set the matches for the next gameweek: the creator in a creator-run league,
    ///         a passed member vote (through TerraceGovernance) in a governed one.
    function addGameweek(uint256 leagueId, uint256[] calldata fixtureIds) external returns (uint256 contestId) {
        League storage l = _league(leagueId);
        if (msg.sender != governance && (l.governed || msg.sender != l.creator)) revert NotLeagueCreator();
        if (l.ended) revert LeagueEnded();
        if (l.contestIds.length >= l.gameweeks) revert TooManyGameweeks();

        contestId = _newContest(fixtureIds, leagueId, IERC20(address(0)), 0, 0, l.isPrivate);
        l.contestIds.push(contestId);
        emit GameweekAdded(leagueId, uint8(l.contestIds.length), contestId);
    }

    /// @notice A league vote made this take count towards the table. Only TerraceGovernance.
    function featureTake(uint256 leagueId, uint256 marketId) external {
        if (msg.sender != governance) revert NotGovernance();
        _league(leagueId);
        featuredMarket[leagueId][marketId] = true;
        emit TakeFeatured(leagueId, marketId);
    }

    /// @notice Count a member's winning market bet towards the season table. Anyone can call it.
    ///         Bets on one of a finished gameweek's matches score 1 point (as in the Solana league);
    ///         featured takes score FEATURED_TAKE_POINTS once the gameweek they belong to is done.
    function countMarketWin(uint256 leagueId, uint8 gameweek, uint256 marketId, address member) external {
        League storage l = _league(leagueId);
        if (l.ended) revert LeagueEnded();
        if (!isMember[leagueId][member]) revert NotMember();
        if (gameweek == 0 || gameweek > l.contestIds.length) revert NotThisGameweek();
        Contest storage c = _contests[l.contestIds[gameweek - 1]];
        // Waiting for the gameweek to finish keeps private tables hidden until then.
        if (!c.finalized) revert NotReady();
        if (marketWinCounted[leagueId][marketId][member]) revert AlreadyCounted();

        bool featured = featuredMarket[leagueId][marketId];
        if (!featured) {
            uint256 fixtureId = oracle.fixtureOfQuestion(markets.questionOf(marketId));
            if (!_contains(c.fixtureIds, fixtureId)) revert NotThisGameweek();
        }
        if (!markets.backedWinner(marketId, member)) revert DidNotWin();

        marketWinCounted[leagueId][marketId][member] = true;
        seasonScore[leagueId][member] += featured ? FEATURED_TAKE_POINTS : 1;
        emit MarketWinCounted(leagueId, marketId, member, seasonScore[leagueId][member]);
    }

    /// @notice Pay the season prize once every planned gameweek is finished.
    function endSeason(uint256 leagueId) external nonReentrant {
        League storage l = _league(leagueId);
        if (l.ended) revert LeagueEnded();
        if (l.contestIds.length < l.gameweeks) revert NotReady();
        for (uint256 i; i < l.contestIds.length; ++i) {
            if (!_contests[l.contestIds[i]].finalized) revert NotReady();
        }
        l.ended = true;

        uint256 n = l.members.length;
        uint256[] memory scores = new uint256[](n);
        uint256 top;
        for (uint256 i; i < n; ++i) {
            scores[i] = seasonScore[leagueId][l.members[i]];
            if (scores[i] > top) top = scores[i];
        }
        address[] memory champions = _winners(l.members, scores, top);
        for (uint256 i; i < champions.length; ++i) {
            reputation.recordTitle(champions[i], TerraceReputation.Source.League);
        }

        uint256 each;
        uint256 pool = l.prizePool;
        if (pool > 0) {
            // Nobody scored all season: everyone gets their entry back.
            address[] memory payees = champions.length > 0 ? champions : l.members;
            each = pool / payees.length;
            uint256 dust = pool - each * payees.length;
            for (uint256 i; i < payees.length; ++i) {
                l.token.safeTransfer(payees[i], each + (i == 0 ? dust : 0));
            }
        }
        emit SeasonEnded(leagueId, champions, top, each);
    }

    // =====================================================================
    // Views
    // =====================================================================

    function contestCount() external view returns (uint256) {
        return _contests.length;
    }

    function getContest(uint256 contestId) external view returns (Contest memory) {
        return _contests[contestId];
    }

    function getPick(uint256 contestId, address player, uint256 fixtureId) external view returns (Pick memory) {
        return _picks[contestId][player][fixtureId];
    }

    function memberCount(uint256 leagueId) external view returns (uint256) {
        return _league(leagueId).members.length;
    }

    function leagueCount() external view returns (uint256) {
        return _leagues.length;
    }

    function getLeague(uint256 leagueId) external view returns (League memory) {
        return _league(leagueId);
    }

    /// @notice Live score for tables; counts only matches already played.
    function currentScore(uint256 contestId, address player) external view returns (uint256 s) {
        Contest storage c = _contests[contestId];
        for (uint256 i; i < c.fixtureIds.length; ++i) {
            (uint8 state, uint8 h, uint8 a) = oracle.fixtureResult(c.fixtureIds[i]);
            if (state != Answer.FIXTURE_FINAL) continue;
            (uint256 pts,,) = _points(_picks[contestId][player][c.fixtureIds[i]], h, a);
            s += pts;
        }
    }

    /// @notice Sealed contests open at kickoff; private-league gameweeks once every match is played.
    function revealOpen(uint256 contestId) public view returns (bool) {
        Contest storage c = _contests[contestId];
        if (!c.sealed_) return false;
        if (c.leagueId == 0 || !_leagues[c.leagueId - 1].isPrivate) return block.timestamp >= c.lockTime;
        for (uint256 i; i < c.fixtureIds.length; ++i) {
            (uint8 state,,) = oracle.fixtureResult(c.fixtureIds[i]);
            if (state == Answer.FIXTURE_PENDING) return false;
        }
        return true;
    }

    /// @notice After this, unrevealed picks score nothing and the contest can be finalized.
    function revealDeadline(uint256 contestId) public view returns (uint256) {
        Contest storage c = _contests[contestId];
        uint64 last;
        for (uint256 i; i < c.fixtureIds.length; ++i) {
            uint64 k = oracle.fixtureKickoff(c.fixtureIds[i]);
            if (k > last) last = k;
        }
        return uint256(last) + REVEAL_WINDOW;
    }

    /// @notice Sealed entries the CRE reveal workflow still has to open.
    function unrevealedPlayers(uint256 contestId) external view returns (address[] memory out) {
        Contest storage c = _contests[contestId];
        address[] memory buf = new address[](c.entrants.length);
        uint256 n;
        for (uint256 i; i < c.entrants.length; ++i) {
            if (pickCommitment[contestId][c.entrants[i]] != bytes32(0)) buf[n++] = c.entrants[i];
        }
        out = new address[](n);
        for (uint256 i; i < n; ++i) out[i] = buf[i];
    }

    // =====================================================================
    // Internal
    // =====================================================================

    function _newContest(uint256[] calldata fixtureIds, uint256 leagueId, IERC20 token, uint256 prizePool, uint256 entryFee, bool sealed_)
        internal
        returns (uint256 contestId)
    {
        uint256 n = fixtureIds.length;
        if (n == 0 || n > MAX_FIXTURES_PER_CONTEST) revert BadInput();

        uint64 lock = type(uint64).max;
        for (uint256 i; i < n; ++i) {
            if (!oracle.fixtureExists(fixtureIds[i])) revert UnknownFixture(fixtureIds[i]);
            for (uint256 j; j < i; ++j) {
                if (fixtureIds[j] == fixtureIds[i]) revert BadInput();
            }
            uint64 k = oracle.fixtureKickoff(fixtureIds[i]);
            if (k < lock) lock = k;
        }
        if (lock <= block.timestamp) revert ContestLocked();

        contestId = _contests.length;
        Contest storage c = _contests.push();
        c.creator = msg.sender;
        c.token = token;
        c.leagueId = leagueId;
        c.prizePool = uint128(prizePool);
        c.entryFee = uint128(entryFee);
        c.lockTime = lock;
        c.sealed_ = sealed_;
        c.fixtureIds = fixtureIds;
        emit ContestCreated(contestId, msg.sender, leagueId, prizePool, entryFee, lock, sealed_);
    }

    function _enter(uint256 contestId, Contest storage c) internal {
        if (block.timestamp >= c.lockTime) revert ContestLocked();
        if (c.leagueId != 0 && !isMember[c.leagueId][msg.sender]) revert NotMember();
        if (hasEntered[contestId][msg.sender]) return;
        if (c.entrants.length >= MAX_ENTRANTS) revert ContestFull();
        hasEntered[contestId][msg.sender] = true;
        c.entrants.push(msg.sender);
        if (c.entryFee > 0) c.token.safeTransferFrom(msg.sender, address(this), c.entryFee);
    }

    function _reveal(uint256 contestId, address player, uint8[] memory home, uint8[] memory away, bytes32 salt) internal {
        bytes32 commitment = pickCommitment[contestId][player];
        if (commitment == bytes32(0)) return; // nothing sealed, or already opened
        if (block.timestamp > revealDeadline(contestId)) return;

        Contest storage c = _contests[contestId];
        bool valid = home.length == c.fixtureIds.length && away.length == c.fixtureIds.length
            && picksCommitment(contestId, player, home, away, salt) == commitment;
        delete pickCommitment[contestId][player];
        c.unrevealed -= 1;
        if (valid) {
            for (uint256 i; i < home.length; ++i) {
                _picks[contestId][player][c.fixtureIds[i]] = Pick({set: true, home: home[i], away: away[i]});
            }
        }
        emit PicksRevealed(contestId, player, valid);
    }

    function _score(
        uint256 contestId,
        address player,
        uint256[] storage fixtureIds,
        uint8[] memory states,
        uint8[] memory hg,
        uint8[] memory ag
    ) internal view returns (uint256 total, uint32 made, uint32 correct, uint32 exact) {
        for (uint256 i; i < fixtureIds.length; ++i) {
            if (states[i] != Answer.FIXTURE_FINAL) continue; // called-off matches don't count
            Pick memory p = _picks[contestId][player][fixtureIds[i]];
            if (!p.set) continue;
            (uint256 pts, bool isCorrect, bool isExact) = _points(p, hg[i], ag[i]);
            total += pts;
            made += 1;
            if (isCorrect) correct += 1;
            if (isExact) exact += 1;
        }
    }

    function _points(Pick memory p, uint8 h, uint8 a) internal pure returns (uint256 pts, bool correctResult, bool exact) {
        if (!p.set) return (0, false, false);
        exact = p.home == h && p.away == a;
        correctResult = _sign(p.home, p.away) == _sign(h, a);
        pts = exact ? 3 : (correctResult ? 1 : 0);
    }

    function _sign(uint8 h, uint8 a) internal pure returns (int8) {
        return h > a ? int8(1) : (h < a ? int8(-1) : int8(0));
    }

    /// @dev Everyone on the top score; nobody if the top score is 0.
    function _winners(address[] storage players, uint256[] memory scores, uint256 top)
        internal
        view
        returns (address[] memory winners)
    {
        if (top == 0) return new address[](0);
        uint256 n;
        for (uint256 i; i < scores.length; ++i) if (scores[i] == top) ++n;
        winners = new address[](n);
        uint256 w;
        for (uint256 i; i < scores.length; ++i) if (scores[i] == top) winners[w++] = players[i];
    }

    function _payContest(Contest storage c, address[] memory winners) internal returns (uint256 each) {
        uint256 entries = uint256(c.entryFee) * c.entrants.length;
        uint256 pool = uint256(c.prizePool) + entries;
        if (pool == 0) return 0;

        if (winners.length == 0) {
            // Nobody scored: the creator's pool and every entry fee go back.
            if (c.prizePool > 0) c.token.safeTransfer(c.creator, c.prizePool);
            if (c.entryFee > 0) {
                for (uint256 i; i < c.entrants.length; ++i) c.token.safeTransfer(c.entrants[i], c.entryFee);
            }
            return 0;
        }
        each = pool / winners.length;
        uint256 dust = pool - each * winners.length;
        for (uint256 i; i < winners.length; ++i) {
            c.token.safeTransfer(winners[i], each + (i == 0 ? dust : 0));
        }
    }

    /// @dev Money needs an allowed token; free contests and leagues may pass address(0).
    function _checkToken(IERC20 token, uint256 amount) internal view {
        if (amount > 0 && !oracle.isSettlementToken(address(token))) revert BadInput();
    }

    function _league(uint256 leagueId) internal view returns (League storage) {
        if (leagueId == 0 || leagueId > _leagues.length) revert UnknownLeague();
        return _leagues[leagueId - 1];
    }

    function _contains(uint256[] storage list, uint256 value) internal view returns (bool) {
        for (uint256 i; i < list.length; ++i) if (list[i] == value) return true;
        return false;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Answer, ITerraceOracle, ITerraceReportHandler} from "./interfaces/ITerraceOracle.sol";
import {TerraceReputation} from "./TerraceReputation.sol";

/// @title TerraceMarkets
/// @notice Yes/no pools on football questions. Backers of the right answer split the pool
///         in proportion to their stake (pari-mutuel), less the creator's fee on profit.
///
///  Settlement  Only TerraceOracle (Chainlink CRE) decides answers. There is no creator
///              settle button. A void answer, or nobody backing the right side, refunds
///              everyone. Anyone can settle any bet, so losses are always recorded.
///
///  Sealed      In a sealed market your side stays secret until the market closes, so
///              nobody can see which way the money is going. You post a commitment
///              keccak256(marketId, you, side, salt) plus the same (side, salt) encrypted to
///              the CRE reveal key. After close the CRE reveal workflow decrypts the batch
///              and reports it; the contract checks every reveal against its commitment.
///              You can also reveal your own bet. A bet that is never revealed, or whose
///              ciphertext doesn't match its commitment, is refunded.
///
///  Flash       In-match markets that must close within 90 minutes of being opened.
contract TerraceMarkets is ITerraceReportHandler, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant REPORT_REVEAL_BETS = 16; // (uint256 marketId, address[] bettors, uint8[] sides, bytes32[] salts)

    // Sides use the same codes as oracle answers, so `side == answer` means the bet won.
    uint8 public constant SIDE_NONE = 0;
    uint8 public constant SIDE_YES = 1;
    uint8 public constant SIDE_NO = 2;

    uint256 public constant MIN_STAKE = 100_000; // 0.10 tUSD
    uint16 public constant MAX_CREATOR_FEE_BPS = 500;
    uint64 public constant FLASH_WINDOW = 90 minutes;
    uint64 public constant REVEAL_WINDOW = 1 days;

    struct Market {
        uint256 questionId;
        address creator;
        uint16 feeBps;
        bool sealed_;
        bool flash;
        uint128 yesPool;
        uint128 noPool;
        uint128 sealedPool; // stakes whose side is still secret
        uint32 unrevealed;
    }

    struct Position {
        uint8 side; // SIDE_NONE while sealed
        bool settled;
        bool invalid; // sealed bet that failed its reveal
        uint128 stake;
        bytes32 commitment;
    }

    IERC20 public immutable token;
    ITerraceOracle public immutable oracle;
    TerraceReputation public immutable reputation;

    Market[] private _markets;
    mapping(uint256 => mapping(address => Position)) private _positions;
    mapping(uint256 => address[]) private _bettors;
    mapping(uint256 => mapping(address => bytes)) public sealedCiphertext;

    event MarketCreated(uint256 indexed marketId, uint256 indexed questionId, address indexed creator, uint16 feeBps, bool sealed_, bool flash);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, uint8 side, uint256 stake);
    event SealedBetPlaced(uint256 indexed marketId, address indexed bettor, uint256 stake, bytes32 commitment, bytes ciphertext);
    event BetRevealed(uint256 indexed marketId, address indexed bettor, uint8 side, bool valid);
    event BetSettled(uint256 indexed marketId, address indexed bettor, uint8 result, uint256 payout, uint256 fee);

    error BadInput();
    error UnknownMarket();
    error StakeTooSmall();
    error MarketClosed();
    error MarketStillOpen();
    error WrongSide();
    error SealedMarket();
    error NotSealed();
    error AlreadyBet();
    error NotResolved();
    error RevealsPending();
    error NothingToSettle();
    error NotOracle();

    constructor(IERC20 token_, ITerraceOracle oracle_, TerraceReputation reputation_) {
        token = token_;
        oracle = oracle_;
        reputation = reputation_;
    }

    // ---------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------

    function createMarket(uint256 questionId, uint16 feeBps, bool sealed_, bool flash) external returns (uint256 marketId) {
        if (!oracle.questionExists(questionId)) revert BadInput();
        if (feeBps > MAX_CREATOR_FEE_BPS) revert BadInput();
        uint64 close = oracle.closeTimeOf(questionId);
        if (close <= block.timestamp) revert MarketClosed();
        if (flash && close > block.timestamp + FLASH_WINDOW) revert BadInput();

        marketId = _markets.length;
        _markets.push(
            Market({questionId: questionId, creator: msg.sender, feeBps: feeBps, sealed_: sealed_, flash: flash, yesPool: 0, noPool: 0, sealedPool: 0, unrevealed: 0})
        );
        emit MarketCreated(marketId, questionId, msg.sender, feeBps, sealed_, flash);
    }

    // ---------------------------------------------------------------------
    // Bet
    // ---------------------------------------------------------------------

    /// @notice Back yes or no. You can add to your stake, on the same side, until close.
    function placeBet(uint256 marketId, uint8 side, uint256 stake) external nonReentrant {
        Market storage m = _open(marketId);
        if (m.sealed_) revert SealedMarket();
        if (side != SIDE_YES && side != SIDE_NO) revert BadInput();
        if (stake < MIN_STAKE) revert StakeTooSmall();

        Position storage p = _positions[marketId][msg.sender];
        if (p.stake == 0) {
            p.side = side;
            _bettors[marketId].push(msg.sender);
        } else if (p.side != side) {
            revert WrongSide();
        }
        p.stake += uint128(stake);
        if (side == SIDE_YES) m.yesPool += uint128(stake);
        else m.noPool += uint128(stake);

        token.safeTransferFrom(msg.sender, address(this), stake);
        emit BetPlaced(marketId, msg.sender, side, stake);
    }

    /// @notice One sealed bet per market. The stake is public; the side is not.
    function placeSealedBet(uint256 marketId, uint256 stake, bytes32 commitment, bytes calldata ciphertext)
        external
        nonReentrant
    {
        Market storage m = _open(marketId);
        if (!m.sealed_) revert NotSealed();
        if (stake < MIN_STAKE) revert StakeTooSmall();
        if (commitment == bytes32(0) || ciphertext.length == 0) revert BadInput();

        Position storage p = _positions[marketId][msg.sender];
        if (p.stake != 0) revert AlreadyBet();
        p.stake = uint128(stake);
        p.commitment = commitment;
        sealedCiphertext[marketId][msg.sender] = ciphertext;
        _bettors[marketId].push(msg.sender);
        m.sealedPool += uint128(stake);
        m.unrevealed += 1;

        token.safeTransferFrom(msg.sender, address(this), stake);
        emit SealedBetPlaced(marketId, msg.sender, stake, commitment, ciphertext);
    }

    // ---------------------------------------------------------------------
    // Reveal (sealed markets)
    // ---------------------------------------------------------------------

    /// @notice Batch reveal from the CRE reveal workflow, routed through TerraceOracle.
    ///         side = SIDE_NONE means the ciphertext could not be opened: the bet is refunded.
    function handleReport(uint8 kind, bytes calldata payload) external {
        if (msg.sender != address(oracle)) revert NotOracle();
        if (kind != REPORT_REVEAL_BETS) revert BadInput();
        (uint256 marketId, address[] memory bettors, uint8[] memory sides, bytes32[] memory salts) =
            abi.decode(payload, (uint256, address[], uint8[], bytes32[]));
        if (bettors.length != sides.length || bettors.length != salts.length) revert BadInput();
        if (marketId >= _markets.length) revert UnknownMarket();
        if (block.timestamp < _closeTime(marketId)) revert MarketStillOpen();

        for (uint256 i; i < bettors.length; ++i) {
            _reveal(marketId, bettors[i], sides[i], salts[i]);
        }
    }

    /// @notice Reveal your own sealed bet after close (works even if CRE is down).
    function revealOwn(uint256 marketId, uint8 side, bytes32 salt) external {
        if (marketId >= _markets.length) revert UnknownMarket();
        if (block.timestamp < _closeTime(marketId)) revert MarketStillOpen();
        if (side != SIDE_YES && side != SIDE_NO) revert BadInput();
        _reveal(marketId, msg.sender, side, salt);
    }

    function commitmentFor(uint256 marketId, address bettor, uint8 side, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(marketId, bettor, side, salt));
    }

    // ---------------------------------------------------------------------
    // Settle
    // ---------------------------------------------------------------------

    /// @notice Pays out (or records the loss for) one bet. Anyone can call it for anyone.
    function settleBet(uint256 marketId, address bettor) public nonReentrant returns (uint256 payout) {
        if (marketId >= _markets.length) revert UnknownMarket();
        Market storage m = _markets[marketId];
        Position storage p = _positions[marketId][bettor];
        if (p.stake == 0 || p.settled) revert NothingToSettle();

        uint8 answer = oracle.outcomeOf(m.questionId);
        if (answer == Answer.OPEN) revert NotResolved();
        bool revealsDone = m.unrevealed == 0 || block.timestamp > uint256(_closeTime(marketId)) + REVEAL_WINDOW;
        if (!revealsDone && answer != Answer.VOID) revert RevealsPending();

        p.settled = true;
        uint256 stake = p.stake;
        uint256 winningPool = answer == Answer.YES ? m.yesPool : m.noPool;
        uint256 fee;
        uint8 result; // 0 refund, 1 won, 2 lost

        if (answer == Answer.VOID || p.side == SIDE_NONE || p.invalid || winningPool == 0) {
            payout = stake; // refund
        } else if (p.side == answer) {
            uint256 gross = (stake * (uint256(m.yesPool) + m.noPool)) / winningPool;
            fee = ((gross - stake) * m.feeBps) / 10_000; // fee only on profit
            payout = gross - fee;
            result = 1;
        } else {
            result = 2;
        }

        if (result != 0) {
            reputation.recordResult(bettor, TerraceReputation.Source.Market, result == 1, 0);
        }
        if (payout > 0) token.safeTransfer(bettor, payout);
        if (fee > 0) token.safeTransfer(m.creator, fee);
        emit BetSettled(marketId, bettor, result, payout, fee);
    }

    /// @notice Settle a page of bets in one go (keepers, or the app after a match).
    function settleMany(uint256 marketId, uint256 from, uint256 count) external {
        address[] storage list = _bettors[marketId];
        uint256 end = from + count > list.length ? list.length : from + count;
        for (uint256 i = from; i < end; ++i) {
            if (!_positions[marketId][list[i]].settled) settleBet(marketId, list[i]);
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _markets[marketId];
    }

    function positionOf(uint256 marketId, address bettor) external view returns (Position memory) {
        return _positions[marketId][bettor];
    }

    function bettorsOf(uint256 marketId) external view returns (address[] memory) {
        return _bettors[marketId];
    }

    function closeTimeOf(uint256 marketId) external view returns (uint64) {
        return _closeTime(marketId);
    }

    /// @notice Whether a bettor backed the right answer (used by leagues).
    function backedWinner(uint256 marketId, address bettor) external view returns (bool) {
        Position storage p = _positions[marketId][bettor];
        if (p.stake == 0 || p.invalid || p.side == SIDE_NONE) return false;
        return oracle.outcomeOf(_markets[marketId].questionId) == p.side;
    }

    /// @notice Sealed bets the CRE reveal workflow still has to open.
    function unrevealedBettors(uint256 marketId) external view returns (address[] memory out) {
        address[] storage list = _bettors[marketId];
        uint256 n;
        address[] memory buf = new address[](list.length);
        for (uint256 i; i < list.length; ++i) {
            Position storage p = _positions[marketId][list[i]];
            if (p.commitment != bytes32(0) && p.side == SIDE_NONE && !p.invalid) buf[n++] = list[i];
        }
        out = new address[](n);
        for (uint256 i; i < n; ++i) out[i] = buf[i];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _open(uint256 marketId) internal view returns (Market storage m) {
        if (marketId >= _markets.length) revert UnknownMarket();
        m = _markets[marketId];
        if (block.timestamp >= oracle.closeTimeOf(m.questionId)) revert MarketClosed();
    }

    function _closeTime(uint256 marketId) internal view returns (uint64) {
        return oracle.closeTimeOf(_markets[marketId].questionId);
    }

    function _reveal(uint256 marketId, address bettor, uint8 side, bytes32 salt) internal {
        Position storage p = _positions[marketId][bettor];
        // Only sealed, still-secret, unsettled bets.
        if (p.commitment == bytes32(0) || p.side != SIDE_NONE || p.invalid || p.settled) return;
        // Payouts start once the window ends, so pools must be final by then.
        if (block.timestamp > uint256(_closeTime(marketId)) + REVEAL_WINDOW) return;

        Market storage m = _markets[marketId];
        bool valid = (side == SIDE_YES || side == SIDE_NO) && commitmentFor(marketId, bettor, side, salt) == p.commitment;
        m.sealedPool -= p.stake;
        m.unrevealed -= 1;
        if (valid) {
            p.side = side;
            if (side == SIDE_YES) m.yesPool += p.stake;
            else m.noPool += p.stake;
        } else {
            p.invalid = true;
        }
        emit BetRevealed(marketId, bettor, valid ? side : SIDE_NONE, valid);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Answer, ITerraceOracle, ITerraceReportHandler} from "./interfaces/ITerraceOracle.sol";

/// @notice Interface the Chainlink KeystoneForwarder calls to deliver CRE reports.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title TerraceOracle
/// @notice The single source of truth for results. Only Chainlink CRE writes here.
///
///  Fixtures   Real matches keyed by the data provider's match id. CRE schedules them,
///             moves kickoffs when matches are rescheduled, and writes final scores.
///  Questions  What markets, parlays and 1v1s are about. Standard questions (home win,
///             draw, over 2.5 goals, both teams score...) answer themselves from the final
///             score. Custom questions ("Will Saka score?") are answered by the CRE
///             questions workflow, which asks an AI model and needs every node to agree.
///  Handlers   Other report kinds (sealed-pick reveals, hidden tables) are routed to the
///             contract registered for that kind.
///
///  Trust      The production KeystoneForwarder verifies DON signatures itself. During the
///             hackathon we settle through `cre workflow simulate --broadcast`, which goes
///             through the MockKeystoneForwarder; that contract checks no signatures, so
///             simulated reports must also carry a signature from the workflow's attestor
///             key. `lockProduction()` removes the simulation path for good.
contract TerraceOracle is ITerraceOracle, IReceiver, Ownable {
    // Report kinds 1-15 are handled here; 16+ are routed to registered handlers.
    uint8 public constant REPORT_FIXTURES = 1; // (uint256[] ids, uint64[] kickoffs)
    uint8 public constant REPORT_RESULTS = 2; // (uint256[] ids, uint8[] states, uint8[] home, uint8[] away)
    uint8 public constant REPORT_ANSWERS = 3; // (uint256[] questionIds, uint8[] answers)

    /// @notice A question nobody answers within this window after it closes is void (refund).
    uint64 public constant RESOLVE_GRACE = 3 days;
    uint256 public constant MAX_QUESTION_BYTES = 200;

    enum Kind {
        Custom,
        HomeWin,
        Draw,
        AwayWin,
        OverGoals, // yes when total goals > line (line 2 = "over 2.5")
        BothTeamsScore
    }

    struct Fixture {
        uint64 kickoff;
        bool exists;
        uint8 state; // Answer.FIXTURE_*
        uint8 homeGoals;
        uint8 awayGoals;
    }

    struct Question {
        uint256 fixtureId; // 0 for custom questions not tied to a match
        uint64 closeTime; // custom questions: 0 = closes at kickoff (follows reschedules)
        Kind kind;
        uint8 line;
        uint8 answer; // custom questions only
        address creator;
        string text; // custom questions only
        bytes spec; // custom questions only: structured rule CRE settles from match events (empty = AI)
    }

    // Structured in-match questions. spec = abi.encode(uint8 rule, uint32 playerId, uint32 teamId, uint8 fromMinute, uint8 toMinute)
    // CRE answers YES as soon as a matching event happens in the window and NO once the window has passed.
    uint8 public constant RULE_PLAYER_GOAL = 1; // playerId scores
    uint8 public constant RULE_ANY_GOAL = 2; // anyone scores
    uint8 public constant RULE_TEAM_GOAL = 3; // teamId scores
    uint8 public constant RULE_RED_CARD = 4; // any red card (teamId optional, 0 = either side)
    uint8 public constant RULE_PLAYER_CARD = 5; // playerId is booked (yellow or red)
    uint256 public constant MAX_SPEC_BYTES = 160;

    /// @notice Tokens Terrace games settle in (test dollars and testnet USDC).
    mapping(address => bool) public isSettlementToken;
    event SettlementTokenSet(address indexed token, bool allowed);

    // --- forwarders -------------------------------------------------------
    address public productionForwarder;
    address public simulationForwarder;
    address public simAttestor;
    uint256 public simNonce;
    bool public productionLocked;

    // --- data -------------------------------------------------------------
    mapping(uint256 => Fixture) private _fixtures;
    uint256[] private _fixtureIds;

    Question[] private _questions; // id = index + 1, so 0 means "none"
    mapping(bytes32 => uint256) public standardQuestionId;
    uint256[] private _customQuestionIds;

    mapping(uint8 => address) public reportHandler;

    event ForwardersSet(address production, address simulation, address attestor);
    event ProductionLocked();
    event ReportHandlerSet(uint8 indexed kind, address handler);
    event FixtureScheduled(uint256 indexed fixtureId, uint64 kickoff);
    event FixtureSettled(uint256 indexed fixtureId, uint8 state, uint8 homeGoals, uint8 awayGoals);
    event QuestionCreated(uint256 indexed questionId, uint256 indexed fixtureId, Kind kind, uint8 line, uint64 closeTime, address creator, string text);
    event QuestionSpec(uint256 indexed questionId, bytes spec);
    event QuestionAnswered(uint256 indexed questionId, uint8 answer);

    error NotForwarder();
    error BadSignature();
    error BadInput();
    error UnknownFixture(uint256 fixtureId);
    error UnknownQuestion(uint256 questionId);
    error QuestionClosed();
    error NoHandler(uint8 kind);
    error Locked();

    constructor(address productionForwarder_, address simulationForwarder_, address simAttestor_) Ownable(msg.sender) {
        productionForwarder = productionForwarder_;
        simulationForwarder = simulationForwarder_;
        simAttestor = simAttestor_;
        emit ForwardersSet(productionForwarder_, simulationForwarder_, simAttestor_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setForwarders(address production, address simulation, address attestor) external onlyOwner {
        if (productionLocked) revert Locked();
        productionForwarder = production;
        simulationForwarder = simulation;
        simAttestor = attestor;
        emit ForwardersSet(production, simulation, attestor);
    }

    /// @notice One-way switch: after this only the production forwarder can deliver reports.
    function lockProduction() external onlyOwner {
        productionLocked = true;
        simulationForwarder = address(0);
        simAttestor = address(0);
        emit ProductionLocked();
    }

    function setReportHandler(uint8 kind, address handler) external onlyOwner {
        if (kind < 16) revert BadInput();
        reportHandler[kind] = handler;
        emit ReportHandlerSet(kind, handler);
    }

    function setSettlementToken(address token, bool allowed) external onlyOwner {
        isSettlementToken[token] = allowed;
        emit SettlementTokenSet(token, allowed);
    }

    /// @notice Manual scheduling for demos; CRE normally schedules fixtures itself.
    function scheduleFixtures(uint256[] calldata ids, uint64[] calldata kickoffs) external onlyOwner {
        _schedule(ids, kickoffs);
    }

    // ---------------------------------------------------------------------
    // Questions
    // ---------------------------------------------------------------------

    /// @notice Get or create a standard question that answers itself from the final score.
    function standardQuestion(uint256 fixtureId, Kind kind, uint8 line) public returns (uint256 questionId) {
        if (kind == Kind.Custom) revert BadInput();
        if (!_fixtures[fixtureId].exists) revert UnknownFixture(fixtureId);
        if (kind != Kind.OverGoals) line = 0;

        bytes32 key = keccak256(abi.encode(fixtureId, kind, line));
        questionId = standardQuestionId[key];
        if (questionId != 0) return questionId;

        _questions.push(Question({fixtureId: fixtureId, closeTime: 0, kind: kind, line: line, answer: 0, creator: msg.sender, text: "", spec: ""}));
        questionId = _questions.length;
        standardQuestionId[key] = questionId;
        emit QuestionCreated(questionId, fixtureId, kind, line, _fixtures[fixtureId].kickoff, msg.sender, "");
    }

    /// @notice Ask anything with a yes/no answer. CRE answers it after it closes.
    /// @param fixtureId optional match this question is about (0 = none)
    /// @param closeTime when betting stops; 0 = at the match's kickoff. A later time lets fans
    ///        open questions mid-match ("Will Haaland score in the next 20 minutes?").
    /// @param spec optional structured rule (see RULE_*) that CRE settles from match events;
    ///        empty means the AI layer answers from the text.
    function customQuestion(uint256 fixtureId, uint64 closeTime, string calldata text, bytes calldata spec)
        external
        returns (uint256 questionId)
    {
        uint256 len = bytes(text).length;
        if (len == 0 || len > MAX_QUESTION_BYTES || spec.length > MAX_SPEC_BYTES) revert BadInput();
        if (fixtureId != 0) {
            if (!_fixtures[fixtureId].exists) revert UnknownFixture(fixtureId);
        } else if (closeTime == 0 || spec.length != 0) {
            revert BadInput(); // a match-free question needs its own close time, and rules need a match
        }
        uint64 effectiveClose = closeTime == 0 ? _fixtures[fixtureId].kickoff : closeTime;
        if (effectiveClose <= block.timestamp) revert QuestionClosed();

        _questions.push(
            Question({fixtureId: fixtureId, closeTime: closeTime, kind: Kind.Custom, line: 0, answer: 0, creator: msg.sender, text: text, spec: spec})
        );
        questionId = _questions.length;
        _customQuestionIds.push(questionId);
        emit QuestionCreated(questionId, fixtureId, Kind.Custom, 0, effectiveClose, msg.sender, text);
        if (spec.length != 0) emit QuestionSpec(questionId, spec);
    }

    // ---------------------------------------------------------------------
    // Chainlink CRE receiver
    // ---------------------------------------------------------------------

    /// @dev Production: report = abi.encode(uint8 kind, bytes payload)
    ///      Simulation: report = abi.encode(bytes body, bytes signature) where body is the
    ///      production report and signature is the attestor's EIP-191 signature over
    ///      keccak256(chainid, this, simNonce, keccak256(body)).
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external override {
        bytes memory body;
        if (msg.sender == productionForwarder && msg.sender != address(0)) {
            body = report;
        } else if (msg.sender == simulationForwarder && msg.sender != address(0)) {
            bytes memory signature;
            (body, signature) = abi.decode(report, (bytes, bytes));
            bytes32 digest = keccak256(abi.encode(block.chainid, address(this), simNonce, keccak256(body)));
            address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature);
            if (signer != simAttestor || signer == address(0)) revert BadSignature();
            ++simNonce;
        } else {
            revert NotForwarder();
        }

        (uint8 kind, bytes memory payload) = abi.decode(body, (uint8, bytes));
        if (kind == REPORT_FIXTURES) {
            (uint256[] memory ids, uint64[] memory kickoffs) = abi.decode(payload, (uint256[], uint64[]));
            _schedule(ids, kickoffs);
        } else if (kind == REPORT_RESULTS) {
            _settle(payload);
        } else if (kind == REPORT_ANSWERS) {
            _answer(payload);
        } else {
            address handler = reportHandler[kind];
            if (handler == address(0)) revert NoHandler(kind);
            ITerraceReportHandler(handler).handleReport(kind, payload);
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ---------------------------------------------------------------------
    // ITerraceOracle
    // ---------------------------------------------------------------------

    function outcomeOf(uint256 questionId) public view returns (uint8) {
        Question storage q = _question(questionId);

        if (q.kind == Kind.Custom) {
            if (q.answer != Answer.OPEN) return q.answer;
            // Tied to a match that was called off: nothing to answer.
            if (q.fixtureId != 0 && _fixtureState(q.fixtureId) == Answer.FIXTURE_VOID) return Answer.VOID;
            if (block.timestamp > uint256(closeTimeOf(questionId)) + RESOLVE_GRACE) return Answer.VOID;
            return Answer.OPEN;
        }

        uint8 state = _fixtureState(q.fixtureId);
        if (state == Answer.FIXTURE_VOID) return Answer.VOID;
        if (state == Answer.FIXTURE_PENDING) return Answer.OPEN;

        Fixture storage f = _fixtures[q.fixtureId];
        bool yes;
        if (q.kind == Kind.HomeWin) yes = f.homeGoals > f.awayGoals;
        else if (q.kind == Kind.Draw) yes = f.homeGoals == f.awayGoals;
        else if (q.kind == Kind.AwayWin) yes = f.awayGoals > f.homeGoals;
        else if (q.kind == Kind.OverGoals) yes = uint256(f.homeGoals) + f.awayGoals > q.line;
        else yes = f.homeGoals > 0 && f.awayGoals > 0; // BothTeamsScore
        return yes ? Answer.YES : Answer.NO;
    }

    function closeTimeOf(uint256 questionId) public view returns (uint64) {
        Question storage q = _question(questionId);
        if (q.closeTime != 0) return q.closeTime;
        return _fixtures[q.fixtureId].kickoff; // standard questions and kickoff-close ones follow reschedules
    }

    function fixtureOfQuestion(uint256 questionId) external view returns (uint256) {
        return _question(questionId).fixtureId;
    }

    function questionExists(uint256 questionId) external view returns (bool) {
        return questionId != 0 && questionId <= _questions.length;
    }

    function fixtureExists(uint256 fixtureId) external view returns (bool) {
        return _fixtures[fixtureId].exists;
    }

    function fixtureKickoff(uint256 fixtureId) external view returns (uint64) {
        return _fixtures[fixtureId].kickoff;
    }

    function fixtureResult(uint256 fixtureId) external view returns (uint8 state, uint8 homeGoals, uint8 awayGoals) {
        Fixture storage f = _fixtures[fixtureId];
        return (_fixtureState(fixtureId), f.homeGoals, f.awayGoals);
    }

    // ---------------------------------------------------------------------
    // Views for the CRE workflows and the app
    // ---------------------------------------------------------------------

    function getQuestion(uint256 questionId) external view returns (Question memory) {
        return _question(questionId);
    }

    function questionCount() external view returns (uint256) {
        return _questions.length;
    }

    function fixtureIds() external view returns (uint256[] memory) {
        return _fixtureIds;
    }

    /// @notice Fixtures that have kicked off and still need a final score.
    function pendingFixtures() external view returns (uint256[] memory ids) {
        uint256 total = _fixtureIds.length;
        uint256[] memory buf = new uint256[](total);
        uint256 n;
        for (uint256 i; i < total; ++i) {
            uint256 id = _fixtureIds[i];
            Fixture storage f = _fixtures[id];
            if (_fixtureState(id) == Answer.FIXTURE_PENDING && f.kickoff <= block.timestamp) buf[n++] = id;
        }
        ids = _trim(buf, n);
    }

    /// @notice Custom questions that have closed and are waiting for the AI answer.
    function pendingQuestions() external view returns (uint256[] memory ids) {
        uint256 total = _customQuestionIds.length;
        uint256[] memory buf = new uint256[](total);
        uint256 n;
        for (uint256 i; i < total; ++i) {
            uint256 id = _customQuestionIds[i];
            if (closeTimeOf(id) <= block.timestamp && outcomeOf(id) == Answer.OPEN) {
                buf[n++] = id;
            }
        }
        ids = _trim(buf, n);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _schedule(uint256[] memory ids, uint64[] memory kickoffs) internal {
        if (ids.length != kickoffs.length) revert BadInput();
        for (uint256 i; i < ids.length; ++i) {
            if (ids[i] == 0) revert BadInput();
            Fixture storage f = _fixtures[ids[i]];
            if (!f.exists) {
                f.exists = true;
                _fixtureIds.push(ids[i]);
            } else if (f.state != Answer.FIXTURE_PENDING || f.kickoff <= block.timestamp) {
                continue; // already played or under way: kickoff is fixed
            }
            f.kickoff = kickoffs[i];
            emit FixtureScheduled(ids[i], kickoffs[i]);
        }
    }

    function _settle(bytes memory payload) internal {
        (uint256[] memory ids, uint8[] memory states, uint8[] memory home, uint8[] memory away) =
            abi.decode(payload, (uint256[], uint8[], uint8[], uint8[]));
        if (ids.length != states.length || ids.length != home.length || ids.length != away.length) revert BadInput();

        for (uint256 i; i < ids.length; ++i) {
            Fixture storage f = _fixtures[ids[i]];
            // Skip unknown or already-settled fixtures so one bad entry can't block the batch.
            if (!f.exists || f.state != Answer.FIXTURE_PENDING) continue;
            if (block.timestamp > uint256(f.kickoff) + RESOLVE_GRACE) continue; // already treated as void
            if (states[i] != Answer.FIXTURE_FINAL && states[i] != Answer.FIXTURE_VOID) continue;
            f.state = states[i];
            f.homeGoals = home[i];
            f.awayGoals = away[i];
            emit FixtureSettled(ids[i], states[i], home[i], away[i]);
        }
    }

    function _answer(bytes memory payload) internal {
        (uint256[] memory ids, uint8[] memory answers) = abi.decode(payload, (uint256[], uint8[]));
        if (ids.length != answers.length) revert BadInput();

        for (uint256 i; i < ids.length; ++i) {
            if (ids[i] == 0 || ids[i] > _questions.length) continue;
            Question storage q = _questions[ids[i] - 1];
            if (q.kind != Kind.Custom || q.answer != Answer.OPEN) continue;
            if (answers[i] < Answer.YES || answers[i] > Answer.VOID) continue;
            if (outcomeOf(ids[i]) != Answer.OPEN) continue; // void by grace or a called-off match
            if (closeTimeOf(ids[i]) > block.timestamp) continue; // can't answer before it closes
            q.answer = answers[i];
            emit QuestionAnswered(ids[i], answers[i]);
        }
    }

    /// @dev A match with no result long after kickoff counts as void so money never gets stuck.
    function _fixtureState(uint256 fixtureId) internal view returns (uint8) {
        Fixture storage f = _fixtures[fixtureId];
        if (f.state != Answer.FIXTURE_PENDING) return f.state;
        if (f.exists && block.timestamp > uint256(f.kickoff) + RESOLVE_GRACE) return Answer.FIXTURE_VOID;
        return Answer.FIXTURE_PENDING;
    }

    function _question(uint256 questionId) internal view returns (Question storage) {
        if (questionId == 0 || questionId > _questions.length) revert UnknownQuestion(questionId);
        return _questions[questionId - 1];
    }

    function _trim(uint256[] memory buf, uint256 n) internal pure returns (uint256[] memory out) {
        out = new uint256[](n);
        for (uint256 i; i < n; ++i) out[i] = buf[i];
    }
}

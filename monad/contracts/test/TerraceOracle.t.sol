// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceOracle} from "../src/TerraceOracle.sol";
import {Answer, ITerraceReportHandler} from "../src/interfaces/ITerraceOracle.sol";
import {OracleHarness} from "./utils/OracleHarness.sol";

contract RecordingHandler is ITerraceReportHandler {
    uint8 public lastKind;
    bytes public lastPayload;

    function handleReport(uint8 kind, bytes calldata payload) external {
        lastKind = kind;
        lastPayload = payload;
    }
}

contract TerraceOracleTest is OracleHarness {
    uint256 constant ARS_CHE = 501;

    function setUp() public {
        _deployOracle();
        _schedule(ARS_CHE, T0 + 1 hours);
    }

    function test_standardQuestionsAnswerFromTheScore() public {
        uint256 home = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.HomeWin, 0);
        uint256 draw = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.Draw, 0);
        uint256 over = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.OverGoals, 2);
        uint256 btts = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.BothTeamsScore, 0);

        // Same question twice returns the same id.
        assertEq(oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.HomeWin, 0), home);
        assertEq(oracle.closeTimeOf(home), T0 + 1 hours);
        assertEq(oracle.outcomeOf(home), Answer.OPEN);

        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 2, 1);

        assertEq(oracle.outcomeOf(home), Answer.YES);
        assertEq(oracle.outcomeOf(draw), Answer.NO);
        assertEq(oracle.outcomeOf(over), Answer.YES);
        assertEq(oracle.outcomeOf(btts), Answer.YES);
    }

    function test_customQuestionAnsweredAfterClose() public {
        uint256 q = oracle.customQuestion(ARS_CHE, 0, "Will Saka score?");
        assertEq(oracle.closeTimeOf(q), T0 + 1 hours);

        // Answers before close are ignored.
        _answer(q, Answer.YES);
        assertEq(oracle.outcomeOf(q), Answer.OPEN);

        vm.warp(T0 + 2 hours);
        uint256[] memory pending = oracle.pendingQuestions();
        assertEq(pending.length, 1);
        assertEq(pending[0], q);

        _answer(q, Answer.YES);
        assertEq(oracle.outcomeOf(q), Answer.YES);
        assertEq(oracle.pendingQuestions().length, 0);

        // Answers are final.
        _answer(q, Answer.NO);
        assertEq(oracle.outcomeOf(q), Answer.YES);
    }

    function test_unansweredQuestionsVoidAfterGrace() public {
        uint256 q = oracle.customQuestion(0, T0 + 1 days, "Will the transfer go through?");
        uint256 home = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.HomeWin, 0);

        vm.warp(T0 + 1 days + oracle.RESOLVE_GRACE() + 1);
        assertEq(oracle.outcomeOf(q), Answer.VOID);
        assertEq(oracle.outcomeOf(home), Answer.VOID);

        // A late result can't overturn refunds that already happened.
        _result(ARS_CHE, 1, 0);
        assertEq(oracle.outcomeOf(home), Answer.VOID);
        _answer(q, Answer.YES);
        assertEq(oracle.outcomeOf(q), Answer.VOID);
    }

    function test_calledOffMatchVoidsItsQuestions() public {
        uint256 home = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.HomeWin, 0);
        uint256 q = oracle.customQuestion(ARS_CHE, 0, "Red card in the first half?");
        vm.warp(T0 + 2 hours);
        _resultWithState(ARS_CHE, Answer.FIXTURE_VOID, 0, 0);
        assertEq(oracle.outcomeOf(home), Answer.VOID);
        assertEq(oracle.outcomeOf(q), Answer.VOID);
    }

    function test_rescheduleMovesCloseTimeUntilKickoff() public {
        uint256 home = oracle.standardQuestion(ARS_CHE, TerraceOracle.Kind.HomeWin, 0);
        _schedule(ARS_CHE, T0 + 1 days);
        assertEq(oracle.closeTimeOf(home), T0 + 1 days);

        vm.warp(T0 + 1 days);
        _schedule(ARS_CHE, T0 + 2 days); // already kicked off: ignored
        assertEq(oracle.closeTimeOf(home), T0 + 1 days);
    }

    function test_pendingFixturesListsKickedOffMatches() public {
        _schedule(502, T0 + 5 hours);
        assertEq(oracle.pendingFixtures().length, 0);
        vm.warp(T0 + 2 hours);
        uint256[] memory p = oracle.pendingFixtures();
        assertEq(p.length, 1);
        assertEq(p[0], ARS_CHE);
        _result(ARS_CHE, 0, 0);
        assertEq(oracle.pendingFixtures().length, 0);
    }

    function test_simulatedReportsNeedTheAttestor() public {
        vm.warp(T0 + 2 hours);
        uint256[] memory ids = new uint256[](1);
        uint8[] memory st = new uint8[](1);
        uint8[] memory h = new uint8[](1);
        uint8[] memory a = new uint8[](1);
        (ids[0], st[0], h[0], a[0]) = (ARS_CHE, 1, 3, 0);
        _simReport(oracle.REPORT_RESULTS(), abi.encode(ids, st, h, a));

        (uint8 state, uint8 hg,) = oracle.fixtureResult(ARS_CHE);
        assertEq(state, Answer.FIXTURE_FINAL);
        assertEq(hg, 3);
        assertEq(oracle.simNonce(), 1);

        // Unsigned report through the mock forwarder is rejected.
        vm.prank(simForwarder);
        vm.expectRevert();
        oracle.onReport("", abi.encode(abi.encode(uint8(2), bytes("")), bytes("")));
    }

    function test_strangersCannotReport() public {
        vm.expectRevert(TerraceOracle.NotForwarder.selector);
        oracle.onReport("", "");
    }

    function test_lockProductionRemovesSimulation() public {
        oracle.lockProduction();
        vm.expectRevert(TerraceOracle.Locked.selector);
        oracle.setForwarders(prodForwarder, simForwarder, attestor);

        vm.prank(simForwarder);
        vm.expectRevert(TerraceOracle.NotForwarder.selector);
        oracle.onReport("", "");
    }

    function test_otherKindsRouteToHandlers() public {
        RecordingHandler h = new RecordingHandler();
        oracle.setReportHandler(20, address(h));
        _report(20, hex"beef");
        assertEq(h.lastKind(), 20);
        assertEq(h.lastPayload(), hex"beef");

        vm.prank(prodForwarder);
        vm.expectRevert(abi.encodeWithSelector(TerraceOracle.NoHandler.selector, uint8(21)));
        oracle.onReport("", abi.encode(uint8(21), bytes("")));
    }
}

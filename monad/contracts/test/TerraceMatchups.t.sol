// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceMatchups} from "../src/TerraceMatchups.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";

contract TerraceMatchupsTest is TerraceHarness {
    TerraceMatchups matchups;
    uint256 q;

    function setUp() public {
        _deployCore();
        matchups = new TerraceMatchups(usd, oracle, rep);
        rep.setWriter(address(matchups), true);
        _fund(address(matchups));
        q = _homeWin(ARS_CHE);
    }

    function _challenge(address from, address to, uint8 side) internal returns (uint256 id) {
        vm.prank(from);
        id = matchups.challenge(to, q, side, 50e6);
    }

    function test_winnerTakesBothStakesAndRivalryUpdates() public {
        uint256 id = _challenge(alice, bob, Answer.YES);
        vm.prank(bob);
        matchups.accept(id);

        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 0, 1); // Bob's side (no home win) comes in
        matchups.settle(id);

        assertEq(usd.balanceOf(bob), 1_050e6);
        assertEq(usd.balanceOf(alice), 950e6);
        (uint32 bobWins, uint32 aliceWins) = matchups.rivalry(bob, alice);
        assertEq(bobWins, 1);
        assertEq(aliceWins, 0);
        assertEq(rep.pointsOf(bob), 3);
        assertEq(rep.recordOf(alice).total, 1);
    }

    function test_openChallengeGoesToWhoeverAccepts() public {
        uint256 id = _challenge(alice, address(0), Answer.YES);
        vm.prank(alice);
        vm.expectRevert(TerraceMatchups.NotYourChallenge.selector);
        matchups.accept(id);

        vm.prank(carol);
        matchups.accept(id);
        assertEq(matchups.getMatchup(id).opponent, carol);

        vm.prank(dave);
        vm.expectRevert(TerraceMatchups.NotPending.selector);
        matchups.accept(id);
    }

    function test_onlyTheNamedMateCanAccept() public {
        uint256 id = _challenge(alice, bob, Answer.YES);
        vm.prank(carol);
        vm.expectRevert(TerraceMatchups.NotYourChallenge.selector);
        matchups.accept(id);
    }

    function test_declineReturnsTheStake() public {
        uint256 id = _challenge(alice, bob, Answer.YES);
        vm.prank(bob);
        matchups.decline(id);
        assertEq(usd.balanceOf(alice), 1_000e6);
        assertEq(uint8(matchups.getMatchup(id).status), uint8(TerraceMatchups.Status.Declined));
    }

    function test_unacceptedChallengesExpireAtKickoff() public {
        uint256 id = _challenge(alice, bob, Answer.YES);
        vm.expectRevert(TerraceMatchups.StillOpen.selector);
        matchups.expire(id);

        vm.warp(T0 + 1 hours);
        vm.prank(bob);
        vm.expectRevert(TerraceMatchups.QuestionClosed.selector);
        matchups.accept(id);

        matchups.expire(id);
        assertEq(usd.balanceOf(alice), 1_000e6);
    }

    function test_voidQuestionRefundsBoth() public {
        uint256 id = _challenge(alice, bob, Answer.NO);
        vm.prank(bob);
        matchups.accept(id);
        vm.warp(T0 + 3 hours);
        _resultWithState(ARS_CHE, Answer.FIXTURE_VOID, 0, 0);
        matchups.settle(id);
        assertEq(usd.balanceOf(alice), 1_000e6);
        assertEq(usd.balanceOf(bob), 1_000e6);
        assertEq(rep.recordOf(alice).total, 0);
    }

    function test_cannotChallengeYourself() public {
        vm.prank(alice);
        vm.expectRevert(TerraceMatchups.BadInput.selector);
        matchups.challenge(alice, q, Answer.YES, 1e6);
    }
}

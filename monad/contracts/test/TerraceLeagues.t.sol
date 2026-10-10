// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceLeagues} from "../src/TerraceLeagues.sol";
import {TerraceUSD} from "../src/TerraceUSD.sol";

contract TerraceLeaguesTest is Test {
    TerraceLeagues leagues;
    TerraceUSD usd;
    address forwarder = makeAddr("forwarder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        leagues = new TerraceLeagues(forwarder);
        usd = new TerraceUSD();

        uint256[] memory ids = new uint256[](2);
        ids[0] = 501;
        ids[1] = 502;
        uint64[] memory kickoffs = new uint64[](2);
        kickoffs[0] = uint64(block.timestamp + 1 hours);
        kickoffs[1] = uint64(block.timestamp + 2 hours);
        leagues.addFixtures(ids, kickoffs);

        usd.mint(address(this), 300e6);
        usd.approve(address(leagues), 300e6);
        leagues.createContest(ids, usd, 300e6);
    }

    function _picks(address who, uint8 h0, uint8 a0, uint8 h1, uint8 a1) internal {
        uint8[] memory h = new uint8[](2);
        uint8[] memory a = new uint8[](2);
        (h[0], a[0], h[1], a[1]) = (h0, a0, h1, a1);
        vm.prank(who);
        leagues.submitPredictions(0, h, a);
    }

    function _settle(uint8 h0, uint8 a0, uint8 h1, uint8 a1) internal {
        uint256[] memory ids = new uint256[](2);
        uint8[] memory h = new uint8[](2);
        uint8[] memory a = new uint8[](2);
        (ids[0], ids[1]) = (501, 502);
        (h[0], a[0], h[1], a[1]) = (h0, a0, h1, a1);
        vm.prank(forwarder);
        leagues.onReport("", abi.encode(ids, h, a));
    }

    function test_fullContestFlow() public {
        _picks(alice, 2, 1, 1, 1); // exact + correct draw = 4
        _picks(bob, 1, 0, 0, 2);   // correct result only = 1
        _picks(carol, 2, 1, 1, 1); // ties alice

        vm.warp(block.timestamp + 3 hours);
        _settle(2, 1, 0, 0);

        assertEq(leagues.currentScore(0, alice), 4);
        leagues.finalizeContest(0);

        assertEq(usd.balanceOf(alice), 150e6);
        assertEq(usd.balanceOf(carol), 150e6);
        assertEq(usd.balanceOf(bob), 0);

        (uint32 played, uint32 won,,,,, uint32 best,) = leagues.reputation(alice);
        assertEq(played, 1);
        assertEq(won, 1);
        assertEq(best, 2);
    }

    function test_picksLockAtFirstKickoff() public {
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(TerraceLeagues.ContestLocked.selector);
        _picks(alice, 1, 0, 1, 0);
    }

    function test_onlyForwarderCanSettle() public {
        vm.expectRevert(TerraceLeagues.NotForwarder.selector);
        leagues.onReport("", "");
    }

    function test_cannotFinalizeBeforeResults() public {
        _picks(alice, 1, 0, 1, 0);
        vm.expectRevert(TerraceLeagues.NotReady.selector);
        leagues.finalizeContest(0);
    }
}

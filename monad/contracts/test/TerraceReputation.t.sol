// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceReputation} from "../src/TerraceReputation.sol";

contract TerraceReputationTest is Test {
    TerraceReputation rep;
    address game = makeAddr("game");
    address fan = makeAddr("fan");

    function setUp() public {
        rep = new TerraceReputation();
        rep.setWriter(game, true);
    }

    function _result(bool won) internal {
        vm.prank(game);
        rep.recordResult(fan, TerraceReputation.Source.Market, won, 0);
    }

    function test_streakGoesNegativeOnLosingRuns() public {
        _result(true);
        _result(true);
        _result(false);
        _result(false);
        _result(false);
        TerraceReputation.Record memory r = rep.recordOf(fan);
        assertEq(r.streak, -3);
        assertEq(r.bestStreak, 2);
        assertEq(r.winRateBps, 4_000);
        _result(true);
        assertEq(rep.recordOf(fan).streak, 1);
    }

    function test_badgesFollowTheThresholds() public {
        for (uint256 i; i < 6; ++i) _result(true);
        for (uint256 i; i < 4; ++i) _result(false);
        assertEq(uint8(rep.recordOf(fan).badge), uint8(TerraceReputation.Badge.Sharp)); // 10 at 60%

        for (uint256 i; i < 30; ++i) _result(true);
        for (uint256 i; i < 10; ++i) _result(false);
        assertEq(uint8(rep.recordOf(fan).badge), uint8(TerraceReputation.Badge.Legend)); // 50 at 72%

        for (uint256 i; i < 30; ++i) _result(false);
        assertEq(uint8(rep.recordOf(fan).badge), uint8(TerraceReputation.Badge.Casual)); // badges can drop
    }

    function test_pointsIgnoreStakeSize() public {
        vm.startPrank(game);
        rep.recordResult(fan, TerraceReputation.Source.Parlay, true, 4); // 8
        rep.recordResult(fan, TerraceReputation.Source.Matchup, true, 0); // 3
        rep.recordResult(fan, TerraceReputation.Source.Market, false, 0); // 0
        rep.recordPredictions(fan, 5, 3, 1); // 2 results + 1 exact = 5
        rep.recordTitle(fan, TerraceReputation.Source.Contest); // 5
        rep.recordTitle(fan, TerraceReputation.Source.League); // 10
        vm.stopPrank();
        assertEq(rep.pointsOf(fan), 31);
    }

    function test_onlyWritersRecord() public {
        vm.expectRevert(TerraceReputation.NotWriter.selector);
        rep.recordResult(fan, TerraceReputation.Source.Market, true, 0);
    }

    function test_agentsRegisterThemselves() public {
        address bot = makeAddr("bot");
        vm.prank(bot);
        rep.registerAgent(fan, "ipfs://pundit");
        TerraceReputation.Profile memory p = rep.profileOf(bot);
        assertTrue(p.isAgent);
        assertEq(p.operator, fan);
    }
}

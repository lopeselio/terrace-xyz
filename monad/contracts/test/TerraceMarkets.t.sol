// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceMarkets} from "../src/TerraceMarkets.sol";
import {TerraceReputation} from "../src/TerraceReputation.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";

contract TerraceMarketsTest is TerraceHarness {
    TerraceMarkets markets;
    address creator = makeAddr("creator");
    uint256 q;

    uint8 constant YES = 1;
    uint8 constant NO = 2;

    function setUp() public {
        _deployCore();
        markets = new TerraceMarkets(usd, oracle, rep);
        rep.setWriter(address(markets), true);
        oracle.setReportHandler(markets.REPORT_REVEAL_BETS(), address(markets));
        _fund(address(markets));
        q = _homeWin(ARS_CHE);
    }

    function _market(bool sealed_) internal returns (uint256 id) {
        vm.prank(creator);
        id = markets.createMarket(q, 500, sealed_, false);
    }

    function _bet(address who, uint256 id, uint8 side, uint256 amount) internal {
        vm.prank(who);
        markets.placeBet(id, side, amount);
    }

    function test_winnersSplitThePoolLessFeeOnProfit() public {
        uint256 id = _market(false);
        _bet(alice, id, YES, 100e6);
        _bet(bob, id, YES, 300e6);
        _bet(carol, id, NO, 400e6);

        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 2, 0);

        // Alice: gross 800*100/400 = 200, profit 100, fee 5% = 5 -> 195
        assertEq(markets.settleBet(id, alice), 195e6);
        // Bob: gross 600, profit 300, fee 15 -> 585
        assertEq(markets.settleBet(id, bob), 585e6);
        // Carol lost; anyone can settle her bet so the loss is recorded.
        vm.prank(dave);
        assertEq(markets.settleBet(id, carol), 0);

        assertEq(usd.balanceOf(creator), 20e6);
        assertEq(usd.balanceOf(address(markets)), 0);
        assertEq(rep.recordOf(carol).total, 1);
        assertEq(rep.recordOf(carol).wins, 0);
        assertEq(rep.recordOf(alice).wins, 1);

        vm.expectRevert(TerraceMarkets.NothingToSettle.selector);
        markets.settleBet(id, alice);
    }

    function test_nobodyOnTheWinningSideMeansRefunds() public {
        uint256 id = _market(false);
        _bet(alice, id, NO, 100e6);
        _bet(bob, id, NO, 50e6);
        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 1, 0);
        assertEq(markets.settleBet(id, alice), 100e6);
        assertEq(markets.settleBet(id, bob), 50e6);
        assertEq(rep.recordOf(alice).total, 0); // refunds don't count
    }

    function test_voidRefundsEveryone() public {
        uint256 id = _market(false);
        _bet(alice, id, YES, 100e6);
        _bet(bob, id, NO, 100e6);
        vm.warp(T0 + 1 hours + oracle.RESOLVE_GRACE() + 1);
        assertEq(markets.settleBet(id, alice), 100e6);
        assertEq(markets.settleBet(id, bob), 100e6);
    }

    function test_betsCloseAtKickoffAndStayOnOneSide() public {
        uint256 id = _market(false);
        _bet(alice, id, YES, 1e6);
        vm.prank(alice);
        vm.expectRevert(TerraceMarkets.WrongSide.selector);
        markets.placeBet(id, NO, 1e6);

        vm.prank(alice);
        vm.expectRevert(TerraceMarkets.StakeTooSmall.selector);
        markets.placeBet(id, YES, 1);

        vm.warp(T0 + 1 hours);
        vm.prank(bob);
        vm.expectRevert(TerraceMarkets.MarketClosed.selector);
        markets.placeBet(id, YES, 1e6);
    }

    function test_cannotSettleBeforeTheAnswer() public {
        uint256 id = _market(false);
        _bet(alice, id, YES, 1e6);
        vm.expectRevert(TerraceMarkets.NotResolved.selector);
        markets.settleBet(id, alice);
    }

    function test_flashMarketsMustCloseWithin90Minutes() public {
        uint256 later = _homeWin(LIV_MCI); // kicks off in 2 hours
        vm.expectRevert(TerraceMarkets.BadInput.selector);
        markets.createMarket(later, 0, false, true);
        markets.createMarket(q, 0, false, true); // 1 hour: fine
    }

    // --- sealed markets ---------------------------------------------------

    function _sealedBet(address who, uint256 id, uint8 side, bytes32 salt, uint256 amount) internal {
        bytes32 c = markets.commitmentFor(id, who, side, salt);
        vm.prank(who);
        markets.placeSealedBet(id, amount, c, hex"c1f3"); // ciphertext is opaque to the contract
    }

    function _creReveal(uint256 id, address[] memory who, uint8[] memory sides, bytes32[] memory salts) internal {
        _report(markets.REPORT_REVEAL_BETS(), abi.encode(id, who, sides, salts));
    }

    function test_sealedMarketRevealsThroughCre() public {
        uint256 id = _market(true);
        _sealedBet(alice, id, YES, "a", 100e6);
        _sealedBet(bob, id, NO, "b", 100e6);
        _sealedBet(carol, id, YES, "c", 100e6);

        TerraceMarkets.Market memory m = markets.getMarket(id);
        assertEq(m.yesPool + m.noPool, 0); // nobody can see which way the money went
        assertEq(m.sealedPool, 300e6);

        // Public bets aren't allowed in sealed markets, and reveals wait for close.
        vm.prank(dave);
        vm.expectRevert(TerraceMarkets.SealedMarket.selector);
        markets.placeBet(id, YES, 1e6);

        vm.warp(T0 + 1 hours);
        address[] memory who = new address[](3);
        uint8[] memory sides = new uint8[](3);
        bytes32[] memory salts = new bytes32[](3);
        (who[0], sides[0], salts[0]) = (alice, YES, "a");
        (who[1], sides[1], salts[1]) = (bob, NO, "b");
        // Carol's ciphertext claimed NO but she committed to YES: rejected and refunded.
        (who[2], sides[2], salts[2]) = (carol, NO, "c");
        _creReveal(id, who, sides, salts);

        m = markets.getMarket(id);
        assertEq(m.yesPool, 100e6);
        assertEq(m.noPool, 100e6);
        assertEq(m.unrevealed, 0);
        assertTrue(markets.positionOf(id, carol).invalid);

        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 1, 0);
        assertEq(markets.settleBet(id, alice), 195e6); // 200 gross, 5% of 100 profit
        assertEq(markets.settleBet(id, bob), 0);
        assertEq(markets.settleBet(id, carol), 100e6);
    }

    function test_payoutsWaitForRevealsThenRefundTheSilent() public {
        uint256 id = _market(true);
        _sealedBet(alice, id, YES, "a", 100e6);
        _sealedBet(bob, id, NO, "b", 100e6);

        vm.warp(T0 + 1 hours);
        vm.prank(alice);
        markets.revealOwn(id, YES, "a");
        assertEq(markets.unrevealedBettors(id).length, 1);

        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 1, 0);
        vm.expectRevert(TerraceMarkets.RevealsPending.selector);
        markets.settleBet(id, alice);

        // Bob never reveals: after the window his stake is refunded and he can't reveal late.
        vm.warp(T0 + 1 hours + markets.REVEAL_WINDOW() + 1);
        vm.prank(bob);
        markets.revealOwn(id, NO, "b");
        assertEq(markets.getMarket(id).noPool, 0);

        assertEq(markets.settleBet(id, alice), 100e6); // nobody else in the pool
        assertEq(markets.settleBet(id, bob), 100e6);
    }

    function test_onlyOracleDeliversReveals() public {
        vm.expectRevert(TerraceMarkets.NotOracle.selector);
        markets.handleReport(16, "");
    }
}

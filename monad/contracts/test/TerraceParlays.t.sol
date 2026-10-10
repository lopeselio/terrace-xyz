// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceParlays} from "../src/TerraceParlays.sol";
import {TerraceOracle} from "../src/TerraceOracle.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";

contract TerraceParlaysTest is TerraceHarness {
    TerraceParlays parlays;
    uint256 arsWin;
    uint256 livWin;
    uint256 livOver;

    function setUp() public {
        _deployCore();
        parlays = new TerraceParlays(oracle, rep);
        rep.setWriter(address(parlays), true);
        _fund(address(parlays));
        arsWin = _homeWin(ARS_CHE);
        livWin = _homeWin(LIV_MCI);
        livOver = oracle.standardQuestion(LIV_MCI, TerraceOracle.Kind.OverGoals, 2);
    }

    function _legs2(uint256 q0, uint8 s0, uint256 q1, uint8 s1) internal pure returns (TerraceParlays.Leg[] memory l) {
        l = new TerraceParlays.Leg[](2);
        l[0] = TerraceParlays.Leg(q0, s0);
        l[1] = TerraceParlays.Leg(q1, s1);
    }

    function _place(address who, TerraceParlays.Leg[] memory legs, uint256 stake) internal returns (uint256 id) {
        vm.prank(who);
        id = parlays.placeParlay(legs, usd, stake);
    }

    function _toPotEnd(uint256 id) internal {
        (TerraceParlays.Parlay memory p,) = parlays.getParlay(id);
        vm.warp(parlays.potEndsAt(p.potId));
    }

    function test_winnersSplitThePotByStakeTimesLegs() public {
        TerraceParlays.Leg[] memory three = new TerraceParlays.Leg[](3);
        three[0] = TerraceParlays.Leg(arsWin, Answer.YES);
        three[1] = TerraceParlays.Leg(livWin, Answer.YES);
        three[2] = TerraceParlays.Leg(livOver, Answer.YES);

        uint256 a = _place(alice, _legs2(arsWin, Answer.YES, livWin, Answer.YES), 100e6); // weight 200
        uint256 b = _place(bob, three, 100e6); // weight 300
        uint256 c = _place(carol, _legs2(arsWin, Answer.NO, livWin, Answer.YES), 300e6); // loses

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 3, 1);
        uint256[] memory ids = new uint256[](3);
        (ids[0], ids[1], ids[2]) = (a, b, c);
        parlays.settleMany(ids);

        vm.expectRevert(TerraceParlays.PotStillOpen.selector);
        parlays.claim(a);

        _toPotEnd(a);
        assertEq(parlays.claim(a), 200e6); // 500 * 200/500
        assertEq(parlays.claim(b), 300e6); // 500 * 300/500
        vm.expectRevert(TerraceParlays.NothingToPay.selector);
        parlays.claim(c);

        assertEq(rep.pointsOf(bob), 6); // 2 points per leg
        assertEq(rep.recordOf(carol).wins, 0);
        assertEq(rep.recordOf(carol).total, 1);
    }

    function test_voidLegsAreDroppedAndAllVoidRefunds() public {
        uint256 a = _place(alice, _legs2(arsWin, Answer.YES, livWin, Answer.YES), 100e6);
        uint256 b = _place(bob, _legs2(livWin, Answer.YES, livOver, Answer.YES), 50e6);

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 2, 0);
        _resultWithState(LIV_MCI, Answer.FIXTURE_VOID, 0, 0);

        parlays.settleParlay(a);
        parlays.settleParlay(b);
        (TerraceParlays.Parlay memory pa,) = parlays.getParlay(a);
        (TerraceParlays.Parlay memory pb,) = parlays.getParlay(b);
        assertEq(uint8(pa.status), uint8(TerraceParlays.Status.Won));
        assertEq(pa.liveLegs, 1);
        assertEq(uint8(pb.status), uint8(TerraceParlays.Status.Refunded));
        assertEq(usd.balanceOf(bob), 1_000e6);

        _toPotEnd(a);
        assertEq(parlays.claim(a), 100e6);
    }

    function test_nobodyWinsMeansStakesComeBack() public {
        uint256 a = _place(alice, _legs2(arsWin, Answer.NO, livWin, Answer.YES), 100e6);
        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 1, 0);
        parlays.settleParlay(a);
        _toPotEnd(a);
        assertEq(parlays.claim(a), 100e6);
    }

    function test_legsMustBeOpenAndDistinct() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TerraceParlays.DuplicateLeg.selector, arsWin));
        parlays.placeParlay(_legs2(arsWin, Answer.YES, arsWin, Answer.NO), usd, 1e6);

        vm.warp(T0 + 1 hours);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TerraceParlays.LegClosed.selector, arsWin));
        parlays.placeParlay(_legs2(arsWin, Answer.YES, livWin, Answer.YES), usd, 1e6);

        TerraceParlays.Leg[] memory one = new TerraceParlays.Leg[](1);
        one[0] = TerraceParlays.Leg(livWin, Answer.YES);
        vm.prank(alice);
        vm.expectRevert(TerraceParlays.BadInput.selector);
        parlays.placeParlay(one, usd, 1e6);
    }

    function test_cannotGradeBeforeAllLegsAnswer() public {
        uint256 a = _place(alice, _legs2(arsWin, Answer.YES, livWin, Answer.YES), 100e6);
        vm.warp(T0 + 90 minutes);
        _result(ARS_CHE, 1, 0);
        vm.expectRevert(TerraceParlays.LegsPending.selector);
        parlays.settleParlay(a);
    }
}

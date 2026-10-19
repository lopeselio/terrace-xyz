// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceLeagues, ITerraceMarketsView} from "../src/TerraceLeagues.sol";
import {TerraceMarkets} from "../src/TerraceMarkets.sol";
import {TerraceReputation} from "../src/TerraceReputation.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";
import {LeagueRules} from "../src/interfaces/LeagueRules.sol";

contract TerraceLeaguesTest is TerraceHarness {
    TerraceLeagues leagues;
    TerraceMarkets markets;
    uint256[] both;

    function setUp() public {
        _deployCore();
        markets = new TerraceMarkets(oracle, rep);
        leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(address(markets)), 0, 17);
        rep.setWriter(address(markets), true);
        rep.setWriter(address(leagues), true);
        oracle.setReportHandler(leagues.REPORT_REVEAL_PICKS(), address(leagues));
        _fund(address(leagues));
        for (uint256 i; i < 4; ++i) {
            address p = [alice, bob, carol, dave][i];
            vm.prank(p);
            usd.approve(address(markets), type(uint256).max);
        }
        both.push(ARS_CHE);
        both.push(LIV_MCI);
    }

    // --- helpers ---------------------------------------------------------

    function _arr(uint8 x, uint8 y) internal pure returns (uint8[] memory a) {
        a = new uint8[](2);
        (a[0], a[1]) = (x, y);
    }

    function _picks(uint256 contestId, address who, uint8 h0, uint8 a0, uint8 h1, uint8 a1) internal {
        vm.prank(who);
        leagues.submitPicks(contestId, _arr(h0, h1), _arr(a0, a1));
    }

    function _seal(uint256 contestId, address who, uint8 h0, uint8 a0, uint8 h1, uint8 a1, bytes32 salt) internal {
        bytes32 c = leagues.picksCommitment(contestId, who, _arr(h0, h1), _arr(a0, a1), salt);
        vm.prank(who);
        leagues.submitSealedPicks(contestId, c, hex"5ea1ed");
    }

    function _playBoth(uint8 h0, uint8 a0, uint8 h1, uint8 a1) internal {
        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, h0, a0);
        _result(LIV_MCI, h1, a1);
    }

    // --- contests --------------------------------------------------------

    function test_contestPaysTopScoreFromPoolAndEntries() public {
        usd.mint(address(this), 300e6);
        usd.approve(address(leagues), 300e6);
        uint256 id = leagues.createContest(both, usd, 300e6, 10e6, false);

        _picks(id, alice, 2, 1, 1, 1); // exact + right draw = 4
        _picks(id, bob, 1, 0, 0, 2); // right result only = 1
        _picks(id, carol, 2, 1, 1, 1); // ties alice

        _playBoth(2, 1, 0, 0);
        assertEq(leagues.currentScore(id, alice), 4);
        leagues.finalizeContest(id);

        // 300 pool + 3 x 10 entries = 330, split by alice and carol
        assertEq(usd.balanceOf(alice), 1_000e6 - 10e6 + 165e6);
        assertEq(usd.balanceOf(carol), 1_000e6 - 10e6 + 165e6);
        TerraceReputation.Record memory r = rep.recordOf(alice);
        assertEq(r.contestsWon, 1);
        assertEq(r.exactScores, 1);
        assertEq(r.points, 4 + 5); // picks + contest win
    }

    function test_nobodyScoringRefundsPoolAndEntries() public {
        usd.mint(address(this), 50e6);
        usd.approve(address(leagues), 50e6);
        uint256 id = leagues.createContest(both, usd, 50e6, 5e6, false);
        _picks(id, alice, 0, 3, 0, 3);
        _playBoth(2, 0, 2, 0);
        leagues.finalizeContest(id);
        assertEq(usd.balanceOf(alice), 1_000e6);
        assertEq(usd.balanceOf(address(this)), 50e6);
    }

    function test_picksLockAtFirstKickoff() public {
        uint256 id = leagues.createContest(both, usd, 0, 0, false);
        vm.warp(T0 + 1 hours);
        vm.expectRevert(TerraceLeagues.ContestLocked.selector);
        _picks(id, alice, 1, 0, 1, 0);
    }

    function test_cannotFinalizeBeforeResults() public {
        uint256 id = leagues.createContest(both, usd, 0, 0, false);
        _picks(id, alice, 1, 0, 1, 0);
        vm.expectRevert(TerraceLeagues.NotReady.selector);
        leagues.finalizeContest(id);
    }

    function test_calledOffMatchesDontCount() public {
        uint256 id = leagues.createContest(both, usd, 0, 0, false);
        _picks(id, alice, 1, 0, 1, 0);
        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _resultWithState(LIV_MCI, Answer.FIXTURE_VOID, 0, 0);
        leagues.finalizeContest(id);
        assertEq(leagues.contestScore(id, alice), 3);
        assertEq(rep.recordOf(alice).predictions, 1);
    }

    // --- sealed picks ----------------------------------------------------

    function test_sealedPicksOpenAtKickoffViaCre() public {
        uint256 id = leagues.createContest(both, usd, 0, 0, true);
        _seal(id, alice, 2, 1, 1, 1, "a");
        _seal(id, bob, 0, 0, 0, 0, "b");

        vm.prank(carol);
        vm.expectRevert(TerraceLeagues.SealedContest.selector);
        leagues.submitPicks(id, _arr(1, 1), _arr(0, 0));

        assertFalse(leagues.revealOpen(id));
        vm.warp(T0 + 1 hours);
        assertTrue(leagues.revealOpen(id));

        address[] memory who = new address[](2);
        uint8[][] memory home = new uint8[][](2);
        uint8[][] memory away = new uint8[][](2);
        bytes32[] memory salts = new bytes32[](2);
        (who[0], home[0], away[0], salts[0]) = (alice, _arr(2, 1), _arr(1, 1), bytes32("a"));
        // Bob's ciphertext doesn't match his commitment: his picks are thrown out.
        (who[1], home[1], away[1], salts[1]) = (bob, _arr(2, 1), _arr(1, 1), bytes32("b"));
        _report(leagues.REPORT_REVEAL_PICKS(), abi.encode(id, who, home, away, salts));

        assertEq(leagues.getContest(id).unrevealed, 0);
        _playBoth(2, 1, 1, 1);
        leagues.finalizeContest(id);
        assertEq(leagues.contestScore(id, alice), 6);
        assertEq(leagues.contestScore(id, bob), 0);
    }

    function test_unrevealedPicksHoldFinalizeUntilDeadline() public {
        uint256 id = leagues.createContest(both, usd, 0, 0, true);
        _seal(id, alice, 1, 0, 1, 0, "a");
        _playBoth(1, 0, 1, 0);
        vm.expectRevert(TerraceLeagues.RevealsPending.selector);
        leagues.finalizeContest(id);

        vm.warp(leagues.revealDeadline(id) + 1);
        leagues.finalizeContest(id);
        assertEq(leagues.contestScore(id, alice), 0);
    }

    // --- leagues ---------------------------------------------------------

    function _league(bool isPrivate) internal returns (uint256 leagueId) {
        LeagueRules memory rules = leagues.defaultRules();
        vm.prank(alice);
        leagueId = leagues.createLeague("Sunday League", 2026, 1, 10, usd, 20e6, isPrivate, false, keccak256("terrace"), rules);
        address[3] memory ps = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            vm.prank(ps[i]);
            leagues.joinLeague(leagueId, "terrace");
        }
    }

    function test_seasonPaysTheChampion() public {
        uint256 leagueId = _league(false);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, both);

        _picks(gw, alice, 1, 0, 0, 0);
        _picks(gw, bob, 1, 0, 1, 0);
        _picks(gw, carol, 0, 1, 0, 1);

        vm.prank(dave);
        vm.expectRevert(TerraceLeagues.NotMember.selector);
        leagues.submitPicks(gw, _arr(1, 1), _arr(0, 0));

        _playBoth(1, 0, 1, 0);
        leagues.finalizeContest(gw);
        leagues.endSeason(leagueId);

        assertEq(leagues.seasonScore(leagueId, bob), 6);
        assertEq(usd.balanceOf(bob), 1_000e6 - 20e6 + 60e6);
        assertEq(rep.recordOf(bob).leaguesWon, 1);
    }

    function test_joiningNeedsTheInviteCodeAndRoom() public {
        uint256 leagueId = _league(false);
        vm.prank(dave);
        vm.expectRevert(TerraceLeagues.WrongInviteCode.selector);
        leagues.joinLeague(leagueId, "guess");

        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.AlreadyMember.selector);
        leagues.joinLeague(leagueId, "terrace");
    }

    function test_onlyCreatorAddsGameweeksAndOnlyAsPlanned() public {
        uint256 leagueId = _league(false);
        vm.prank(bob);
        vm.expectRevert(TerraceLeagues.NotLeagueCreator.selector);
        leagues.addGameweek(leagueId, both);

        vm.startPrank(alice);
        leagues.addGameweek(leagueId, both);
        vm.expectRevert(TerraceLeagues.TooManyGameweeks.selector);
        leagues.addGameweek(leagueId, both);
        vm.stopPrank();

        vm.expectRevert(TerraceLeagues.NotReady.selector);
        leagues.endSeason(leagueId);
    }

    function test_privateLeagueKeepsPicksSealedUntilGameweekEnds() public {
        uint256 leagueId = _league(true);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, both);
        assertTrue(leagues.getContest(gw).sealed_);

        _seal(gw, alice, 1, 0, 2, 2, "a");
        _seal(gw, bob, 0, 0, 0, 0, "b");

        // Kicked off, first match played: still sealed, so no table yet.
        vm.warp(T0 + 3 hours);
        _result(ARS_CHE, 1, 0);
        assertFalse(leagues.revealOpen(gw));
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.RevealNotOpen.selector);
        leagues.revealOwn(gw, _arr(1, 2), _arr(0, 2), "a");

        _result(LIV_MCI, 2, 2);
        assertTrue(leagues.revealOpen(gw));
        vm.prank(alice);
        leagues.revealOwn(gw, _arr(1, 2), _arr(0, 2), "a");
        vm.prank(bob);
        leagues.revealOwn(gw, _arr(0, 0), _arr(0, 0), "b");

        leagues.finalizeContest(gw);
        assertEq(leagues.seasonScore(leagueId, alice), 6);
        assertEq(leagues.seasonScore(leagueId, bob), 1);
    }

    function test_marketWinsOnGameweekMatchesCountOnce() public {
        uint256 leagueId = _league(false);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, both);
        uint256 m = markets.createMarket(_homeWin(ARS_CHE), usd, 0, false, false);
        vm.prank(bob);
        markets.placeBet(m, Answer.YES, 5e6);

        _playBoth(1, 0, 0, 0);
        vm.expectRevert(TerraceLeagues.NotReady.selector);
        leagues.countMarketWin(leagueId, 1, m, bob);

        leagues.finalizeContest(gw);
        leagues.countMarketWin(leagueId, 1, m, bob);
        assertEq(leagues.seasonScore(leagueId, bob), 1);

        vm.expectRevert(TerraceLeagues.AlreadyCounted.selector);
        leagues.countMarketWin(leagueId, 1, m, bob);
    }
}

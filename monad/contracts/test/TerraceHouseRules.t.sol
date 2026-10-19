// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceLeagues, ITerraceMarketsView} from "../src/TerraceLeagues.sol";
import {TerraceMarkets} from "../src/TerraceMarkets.sol";
import {TerraceGovernance, ITerraceLeaguesGov} from "../src/TerraceGovernance.sol";
import {TerraceChat, ITerraceLeaguesMembership} from "../src/TerraceChat.sol";
import {LeagueRules} from "../src/interfaces/LeagueRules.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";

/// House rules, jokers and id bases, on a deployment that sits next to an earlier one (v3).
contract TerraceHouseRulesTest is TerraceHarness {
    uint256 constant BASE = 1_000_000;
    uint256 constant TOT_NEW = 503; // a match the next day, for a second gameweek

    TerraceLeagues leagues;
    TerraceMarkets markets;
    TerraceGovernance gov;
    TerraceChat chat;
    uint256[] gw1;
    uint256[] gw2;

    function setUp() public {
        _deployCore();
        _schedule(TOT_NEW, T0 + 26 hours);
        markets = new TerraceMarkets(oracle, rep);
        leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(address(markets)), BASE, 18);
        gov = new TerraceGovernance(ITerraceLeaguesGov(address(leagues)), BASE);
        chat = new TerraceChat(ITerraceLeaguesMembership(address(leagues)), BASE);
        leagues.setGovernance(address(gov));
        rep.setWriter(address(markets), true);
        rep.setWriter(address(leagues), true);
        oracle.setReportHandler(leagues.REPORT_REVEAL_PICKS(), address(leagues));
        _fund(address(markets));
        gw1.push(ARS_CHE);
        gw1.push(LIV_MCI);
        gw2.push(TOT_NEW);
    }

    // --- helpers ---------------------------------------------------------

    function _rules(uint8 exact, uint8 result) internal view returns (LeagueRules memory r) {
        r = leagues.defaultRules();
        (r.exactPoints, r.resultPoints) = (exact, result);
    }

    function _league(bool governed, LeagueRules memory r) internal returns (uint256 leagueId) {
        vm.prank(alice);
        leagueId = leagues.createLeague("House Rules FC", 2026, 2, 10, IERC20(address(0)), 0, false, governed, bytes32(0), r);
        address[3] memory ps = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            vm.prank(ps[i]);
            leagues.joinLeague(leagueId, "");
        }
    }

    function _arr(uint8 x, uint8 y) internal pure returns (uint8[] memory a) {
        a = new uint8[](2);
        (a[0], a[1]) = (x, y);
    }

    function _one(uint8 x) internal pure returns (uint8[] memory a) {
        a = new uint8[](1);
        a[0] = x;
    }

    // --- ids -------------------------------------------------------------

    function test_idsStartAtTheBaseSoTheyNeverCollide() public {
        uint256 leagueId = _league(false, leagues.defaultRules());
        assertEq(leagueId, BASE + 1);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, gw1);
        assertEq(gw, BASE);
        assertEq(leagues.REPORT_REVEAL_PICKS(), 18);

        vm.expectRevert(TerraceLeagues.UnknownLeague.selector);
        leagues.getLeague(1);

        vm.prank(alice);
        assertEq(chat.post(1, leagueId, "Rules are rules", 0), BASE + 1);
        vm.prank(dave);
        vm.expectRevert(TerraceChat.NotMember.selector);
        chat.post(1, leagueId, "Let me in", 0);
    }

    // --- scoring ---------------------------------------------------------

    function test_customScoringIsUsedForTheTable() public {
        uint256 leagueId = _league(false, _rules(5, 2));
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, gw1);

        vm.prank(alice);
        leagues.submitPicks(gw, _arr(1, 2), _arr(0, 0)); // exact, then right result
        vm.prank(bob);
        leagues.submitPicks(gw, _arr(0, 0), _arr(1, 1)); // both wrong

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 1, 0);
        assertEq(leagues.currentScore(gw, alice), 7);
        leagues.finalizeContest(gw);
        assertEq(leagues.seasonScore(leagueId, alice), 7);
        assertEq(leagues.seasonScore(leagueId, bob), 0);
    }

    function test_ruleChangesOnlyApplyToLaterGameweeks() public {
        uint256 leagueId = _league(false, leagues.defaultRules());
        vm.prank(alice);
        uint256 first = leagues.addGameweek(leagueId, gw1);

        LeagueRules memory r = _rules(10, 4);
        vm.prank(alice);
        leagues.setRules(leagueId, r);
        vm.prank(alice);
        uint256 second = leagues.addGameweek(leagueId, gw2);

        assertEq(leagues.scoringOf(first).exact, 3);
        assertEq(leagues.scoringOf(second).exact, 10);
        assertEq(leagues.scoringOf(second).result, 4);
    }

    function test_onlyTheCreatorChangesACreatorRunLeaguesRules() public {
        uint256 leagueId = _league(false, leagues.defaultRules());
        LeagueRules memory r = _rules(4, 1);
        vm.prank(bob);
        vm.expectRevert(TerraceLeagues.NotLeagueCreator.selector);
        leagues.setRules(leagueId, r);
    }

    function test_rulesOutsideTheLimitsAreRefused() public {
        LeagueRules memory r = leagues.defaultRules();
        r.resultPoints = 4; // more for the result than for the exact score
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.BadInput.selector);
        leagues.createLeague("Bad", 2026, 1, 10, IERC20(address(0)), 0, false, false, bytes32(0), r);

        r = leagues.defaultRules();
        r.votingPeriod = 10 minutes;
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.BadInput.selector);
        leagues.createLeague("Bad", 2026, 1, 10, IERC20(address(0)), 0, false, false, bytes32(0), r);

        r = leagues.defaultRules();
        r.quorumPct = 0;
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.BadInput.selector);
        leagues.createLeague("Bad", 2026, 1, 10, IERC20(address(0)), 0, false, false, bytes32(0), r);
    }

    // --- sealed picks ----------------------------------------------------

    function test_publicLeagueCanSealPicksUntilKickoff() public {
        LeagueRules memory r = leagues.defaultRules();
        r.sealedPicks = true;
        uint256 leagueId = _league(false, r);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, gw1);
        assertTrue(leagues.getContest(gw).sealed_);

        bytes32 c = leagues.picksCommitment(gw, alice, _arr(1, 0), _arr(0, 0), "a");
        vm.prank(alice);
        leagues.submitSealedPicks(gw, c, hex"5ea1ed");
        assertFalse(leagues.revealOpen(gw));
        vm.warp(T0 + 1 hours); // a public league opens at kickoff, not at the end of the gameweek
        assertTrue(leagues.revealOpen(gw));

        // CRE's reveal arrives through the oracle on this deployment's own report kind.
        address[] memory players = new address[](1);
        uint8[][] memory home = new uint8[][](1);
        uint8[][] memory away = new uint8[][](1);
        bytes32[] memory salts = new bytes32[](1);
        (players[0], home[0], away[0], salts[0]) = (alice, _arr(1, 0), _arr(0, 0), "a");
        _report(18, abi.encode(gw, players, home, away, salts));
        assertEq(leagues.getPick(gw, alice, ARS_CHE).home, 1);
    }

    // --- jokers ----------------------------------------------------------

    function test_jokerDoublesOneGameweek() public {
        LeagueRules memory r = leagues.defaultRules();
        r.jokers = true;
        uint256 leagueId = _league(false, r);
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, gw1);

        vm.startPrank(alice);
        leagues.submitPicks(gw, _arr(1, 1), _arr(0, 0));
        leagues.playJoker(gw);
        vm.stopPrank();
        vm.prank(bob);
        leagues.submitPicks(gw, _arr(1, 1), _arr(0, 0));

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 2, 0);
        leagues.finalizeContest(gw);
        assertEq(leagues.seasonScore(leagueId, alice), 8); // 3 + 1, doubled
        assertEq(leagues.seasonScore(leagueId, bob), 4);
    }

    function test_jokerMovesUntilItsGameweekKicksOff() public {
        LeagueRules memory r = leagues.defaultRules();
        r.jokers = true;
        uint256 leagueId = _league(false, r);
        vm.startPrank(alice);
        uint256 first = leagues.addGameweek(leagueId, gw1);
        uint256 second = leagues.addGameweek(leagueId, gw2);
        leagues.playJoker(first);
        leagues.playJoker(second); // moved: the first hasn't kicked off
        assertEq(leagues.jokerOf(leagueId, alice), second + 1);
        leagues.playJoker(first);

        vm.warp(T0 + 1 hours); // first gameweek kicked off with the joker on it
        vm.expectRevert(TerraceLeagues.JokerUsed.selector);
        leagues.playJoker(second);
        vm.stopPrank();
    }

    function test_noJokersUnlessTheLeaguePlaysThem() public {
        uint256 leagueId = _league(false, leagues.defaultRules());
        vm.prank(alice);
        uint256 gw = leagues.addGameweek(leagueId, gw1);
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.NoJokers.selector);
        leagues.playJoker(gw);
    }

    // --- voting on rules -------------------------------------------------

    function test_membersVoteInNewRules() public {
        uint256 leagueId = _league(true, leagues.defaultRules());
        LeagueRules memory r = _rules(5, 2);
        r.jokers = true;

        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.NotLeagueCreator.selector);
        leagues.setRules(leagueId, r);

        vm.prank(bob);
        uint256 id = gov.propose(leagueId, TerraceGovernance.Kind.Rules, abi.encode(r));
        assertEq(id, BASE);
        vm.prank(carol);
        gov.vote(id, true); // 2 of 3
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Executed));
        assertEq(leagues.rulesOf(leagueId).exactPoints, 5);
        assertTrue(leagues.rulesOf(leagueId).jokers);
    }

    function test_votedRulesThatBreakTheLimitsFail() public {
        uint256 leagueId = _league(true, leagues.defaultRules());
        LeagueRules memory r = _rules(0, 0);
        vm.prank(bob);
        uint256 id = gov.propose(leagueId, TerraceGovernance.Kind.Rules, abi.encode(r));
        vm.prank(carol);
        gov.vote(id, true);
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Failed));
        assertEq(leagues.rulesOf(leagueId).exactPoints, 3);
    }

    function test_votingPeriodAndQuorumComeFromTheLeague() public {
        LeagueRules memory r = leagues.defaultRules();
        r.votingPeriod = 3 hours;
        r.quorumPct = 100; // everyone has to vote
        uint256 leagueId = _league(true, r);

        vm.prank(alice);
        uint256 id = gov.propose(leagueId, TerraceGovernance.Kind.Gameweek, abi.encode(gw2));
        assertEq(gov.getProposal(id).deadline, T0 + 3 hours);
        vm.prank(bob);
        gov.vote(id, false); // 1-1, carol stays home

        vm.warp(T0 + 3 hours + 1);
        gov.execute(id);
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Rejected));
    }

    function test_featuredPointsAreFixedWhenTheTakeIsFeatured() public {
        LeagueRules memory r = leagues.defaultRules();
        r.featuredPoints = 5;
        uint256 leagueId = _league(true, r);

        vm.prank(alice);
        uint256 gwId = gov.propose(leagueId, TerraceGovernance.Kind.Gameweek, abi.encode(gw1));
        vm.prank(bob);
        gov.vote(gwId, true);
        uint256 contest = leagues.getLeague(leagueId).contestIds[0];

        vm.prank(bob);
        uint256 take = markets.createTakeMarket(1, 0, T0 + 90 minutes, "Pep wears the grey jumper", "", usd, 0, Answer.YES, 5e6);
        vm.prank(carol);
        uint256 featureId = gov.propose(leagueId, TerraceGovernance.Kind.FeatureTake, abi.encode(take));
        vm.prank(alice);
        gov.vote(featureId, true);
        assertEq(leagues.featuredPoints(leagueId, take), 5);

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 0, 0);
        _answer(markets.questionOf(take), Answer.YES);
        leagues.finalizeContest(contest);
        leagues.countMarketWin(leagueId, 1, take, bob);
        assertEq(leagues.seasonScore(leagueId, bob), 5);
    }
}

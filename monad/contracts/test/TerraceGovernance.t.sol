// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TerraceLeagues, ITerraceMarketsView} from "../src/TerraceLeagues.sol";
import {TerraceMarkets} from "../src/TerraceMarkets.sol";
import {TerraceGovernance, ITerraceLeaguesGov} from "../src/TerraceGovernance.sol";
import {Answer} from "../src/interfaces/ITerraceOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TerraceHarness} from "./utils/TerraceHarness.sol";
import {LeagueRules} from "../src/interfaces/LeagueRules.sol";

contract TerraceGovernanceTest is TerraceHarness {
    TerraceLeagues leagues;
    TerraceMarkets markets;
    TerraceGovernance gov;
    uint256 league;
    uint256[] both;

    function setUp() public {
        _deployCore();
        markets = new TerraceMarkets(oracle, rep);
        leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(address(markets)), 0, 17);
        gov = new TerraceGovernance(ITerraceLeaguesGov(address(leagues)), 0);
        leagues.setGovernance(address(gov));
        rep.setWriter(address(markets), true);
        rep.setWriter(address(leagues), true);
        _fund(address(markets));
        both.push(ARS_CHE);
        both.push(LIV_MCI);

        LeagueRules memory rules = leagues.defaultRules();
        vm.prank(alice);
        league = leagues.createLeague("The Kop End", 2026, 1, 10, IERC20(address(0)), 0, false, true, bytes32(0), rules);
        address[3] memory ps = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            vm.prank(ps[i]);
            leagues.joinLeague(league, "");
        }
    }

    function _proposeGameweek(address who) internal returns (uint256) {
        vm.prank(who);
        return gov.propose(league, TerraceGovernance.Kind.Gameweek, abi.encode(both));
    }

    function test_governedLeaguesOnlyAddGameweeksByVote() public {
        vm.prank(alice);
        vm.expectRevert(TerraceLeagues.NotLeagueCreator.selector);
        leagues.addGameweek(league, both);

        uint256 id = _proposeGameweek(bob); // bob's own yes: 1 of 3
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Open));

        vm.prank(carol);
        gov.vote(id, true); // 2 of 3: majority, runs immediately
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Executed));
        assertEq(leagues.getLeague(league).contestIds.length, 1);
    }

    function test_outsidersCannotProposeOrVote() public {
        vm.prank(dave);
        vm.expectRevert(TerraceGovernance.NotMember.selector);
        gov.propose(league, TerraceGovernance.Kind.Gameweek, abi.encode(both));

        uint256 id = _proposeGameweek(alice);
        vm.prank(dave);
        vm.expectRevert(TerraceGovernance.NotMember.selector);
        gov.vote(id, true);

        vm.prank(alice);
        vm.expectRevert(TerraceGovernance.AlreadyVoted.selector);
        gov.vote(id, true);
    }

    function test_closedVoteNeedsQuorumAndMoreYes() public {
        uint256 id = _proposeGameweek(alice);
        vm.prank(bob);
        gov.vote(id, false); // 1-1

        vm.expectRevert(TerraceGovernance.StillVoting.selector);
        gov.execute(id);

        vm.warp(block.timestamp + 1 days + 1);
        gov.execute(id);
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Rejected));
        assertEq(leagues.getLeague(league).contestIds.length, 0);
    }

    function test_passedVoteThatCanNoLongerRunIsMarkedFailed() public {
        uint256 id = _proposeGameweek(alice);
        vm.warp(T0 + 1 hours); // the first match kicked off before the vote finished
        vm.prank(bob);
        gov.vote(id, true);
        assertEq(uint8(gov.getProposal(id).status), uint8(TerraceGovernance.Status.Failed));
    }

    function test_featuredTakeCountsDoubleOnTheTable() public {
        uint256 gwId = _proposeGameweek(alice);
        vm.prank(bob);
        gov.vote(gwId, true);
        uint256 contest = leagues.getLeague(league).contestIds[0];

        // A take from the group chat about something outside the gameweek's fixtures.
        vm.prank(bob);
        uint256 take = markets.createTakeMarket(1, 0, T0 + 90 minutes, "Pep wears the grey jumper", "", usd, 0, Answer.YES, 5e6);

        vm.prank(carol);
        uint256 featureId = gov.propose(league, TerraceGovernance.Kind.FeatureTake, abi.encode(take));
        vm.prank(alice);
        gov.vote(featureId, true);
        assertTrue(leagues.featuredMarket(league, take));

        vm.warp(T0 + 4 hours);
        _result(ARS_CHE, 1, 0);
        _result(LIV_MCI, 0, 0);
        _answer(markets.questionOf(take), Answer.YES);
        leagues.finalizeContest(contest);

        leagues.countMarketWin(league, 1, take, bob);
        assertEq(leagues.seasonScore(league, bob), 2);
    }
}

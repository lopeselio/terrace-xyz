// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OracleHarness} from "./OracleHarness.sol";
import {TerraceUSD} from "../../src/TerraceUSD.sol";
import {TerraceReputation} from "../../src/TerraceReputation.sol";
import {TerraceOracle} from "../../src/TerraceOracle.sol";

/// @notice Oracle + test dollars + reputation, with funded players.
abstract contract TerraceHarness is OracleHarness {
    TerraceUSD usd;
    TerraceReputation rep;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");

    uint256 constant ARS_CHE = 501;
    uint256 constant LIV_MCI = 502;

    function _deployCore() internal {
        _deployOracle();
        usd = new TerraceUSD();
        rep = new TerraceReputation();
        _schedule(ARS_CHE, T0 + 1 hours);
        _schedule(LIV_MCI, T0 + 2 hours);
    }

    function _fund(address spender) internal {
        address[4] memory players = [alice, bob, carol, dave];
        for (uint256 i; i < players.length; ++i) {
            usd.mint(players[i], 1_000e6);
            vm.prank(players[i]);
            usd.approve(spender, type(uint256).max);
        }
    }

    function _homeWin(uint256 fixtureId) internal returns (uint256) {
        return oracle.standardQuestion(fixtureId, TerraceOracle.Kind.HomeWin, 0);
    }
}

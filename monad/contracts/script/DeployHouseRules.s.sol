// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TerraceOracle} from "../src/TerraceOracle.sol";
import {TerraceReputation} from "../src/TerraceReputation.sol";
import {TerraceLeagues, ITerraceMarketsView} from "../src/TerraceLeagues.sol";
import {TerraceGovernance, ITerraceLeaguesGov} from "../src/TerraceGovernance.sol";
import {TerraceChat, ITerraceLeaguesMembership} from "../src/TerraceChat.sol";

/// Adds leagues with house rules next to the v2 deployment (v3). The v2 oracle, reputation and
/// markets stay; new leagues, their votes and their league chat live in fresh contracts whose ids
/// start at ID_BASE, so nothing collides with v2 ids. v2 leagues keep working on the v2 contracts.
///
///   ORACLE, REPUTATION, MARKETS   v2 addresses (deployments/10143.json)
///   ID_BASE                       first id for the new contracts (default 1,000,000)
///
/// forge script script/DeployHouseRules.s.sol --rpc-url monad_alchemy --account terrace-deployer --broadcast --slow
contract DeployHouseRules is Script {
    uint8 constant REVEAL_KIND = 18; // 16 = sealed bets, 17 = v2 league picks

    function run() external {
        TerraceOracle oracle = TerraceOracle(vm.envAddress("ORACLE"));
        TerraceReputation rep = TerraceReputation(vm.envAddress("REPUTATION"));
        address markets = vm.envAddress("MARKETS");
        uint256 base = vm.envOr("ID_BASE", uint256(1_000_000));

        vm.startBroadcast();
        TerraceLeagues leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(markets), base, REVEAL_KIND);
        TerraceGovernance gov = new TerraceGovernance(ITerraceLeaguesGov(address(leagues)), base);
        TerraceChat chat = new TerraceChat(ITerraceLeaguesMembership(address(leagues)), base);
        leagues.setGovernance(address(gov));
        rep.setWriter(address(leagues), true);
        oracle.setReportHandler(REVEAL_KIND, address(leagues));
        vm.stopBroadcast();

        console.log("TerraceLeagues    ", address(leagues));
        console.log("TerraceGovernance ", address(gov));
        console.log("TerraceChat       ", address(chat));
    }
}

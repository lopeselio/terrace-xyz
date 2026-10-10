// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TerraceUSD} from "../src/TerraceUSD.sol";
import {TerraceOracle} from "../src/TerraceOracle.sol";
import {TerraceReputation} from "../src/TerraceReputation.sol";
import {TerraceMarkets} from "../src/TerraceMarkets.sol";
import {TerraceParlays} from "../src/TerraceParlays.sol";
import {TerraceMatchups} from "../src/TerraceMatchups.sol";
import {TerraceLeagues, ITerraceMarketsView} from "../src/TerraceLeagues.sol";

/// Deploys and wires every Terrace contract.
///
///   CRE_PRODUCTION_FORWARDER  KeystoneForwarder for monad-testnet (cre workflow supported-chains)
///   CRE_SIMULATION_FORWARDER  MockKeystoneForwarder used by `cre workflow simulate --broadcast`
///   CRE_SIM_ATTESTOR          address of the workflow's attestor key
///   ONBOARDING_MINTER         address the onboarding server mints test dollars from (optional)
///
/// forge script script/Deploy.s.sol --rpc-url monad_testnet --account terrace-deployer --broadcast
contract Deploy is Script {
    function run() external {
        address prodForwarder = vm.envAddress("CRE_PRODUCTION_FORWARDER");
        address simForwarder = vm.envAddress("CRE_SIMULATION_FORWARDER");
        address attestor = vm.envAddress("CRE_SIM_ATTESTOR");
        address minter = vm.envOr("ONBOARDING_MINTER", address(0));

        vm.startBroadcast();
        TerraceUSD usd = new TerraceUSD();
        TerraceOracle oracle = new TerraceOracle(prodForwarder, simForwarder, attestor);
        TerraceReputation rep = new TerraceReputation();
        TerraceMarkets markets = new TerraceMarkets(oracle, rep);
        TerraceParlays parlays = new TerraceParlays(oracle, rep);
        TerraceMatchups matchups = new TerraceMatchups(oracle, rep);
        TerraceLeagues leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(address(markets)));

        rep.setWriter(address(markets), true);
        rep.setWriter(address(parlays), true);
        rep.setWriter(address(matchups), true);
        rep.setWriter(address(leagues), true);
        oracle.setReportHandler(markets.REPORT_REVEAL_BETS(), address(markets));
        oracle.setReportHandler(leagues.REPORT_REVEAL_PICKS(), address(leagues));
        if (minter != address(0)) usd.setMinter(minter, true);
        vm.stopBroadcast();

        console.log("TerraceUSD        ", address(usd));
        console.log("TerraceOracle     ", address(oracle));
        console.log("TerraceReputation ", address(rep));
        console.log("TerraceMarkets    ", address(markets));
        console.log("TerraceParlays    ", address(parlays));
        console.log("TerraceMatchups   ", address(matchups));
        console.log("TerraceLeagues    ", address(leagues));
    }
}

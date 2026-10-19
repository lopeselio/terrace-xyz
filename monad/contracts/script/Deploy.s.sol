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
import {TerraceGovernance, ITerraceLeaguesGov} from "../src/TerraceGovernance.sol";
import {TerraceChat, ITerraceLeaguesMembership} from "../src/TerraceChat.sol";

/// Deploys and wires every Terrace contract (v2: multi-token, take markets, governance, chat).
///
///   CRE_PRODUCTION_FORWARDER  KeystoneForwarder for monad-testnet (cre workflow supported-chains)
///   CRE_SIMULATION_FORWARDER  MockKeystoneForwarder used by `cre workflow simulate --broadcast`
///   CRE_SIM_ATTESTOR          address of the workflow's attestor key
///   ONBOARDING_MINTER         address the onboarding server mints test dollars from (optional)
///   TESTNET_USDC              Circle's testnet USDC to allow as a settlement token (optional)
///
/// forge script script/Deploy.s.sol --rpc-url monad_testnet --account terrace-deployer --broadcast
contract Deploy is Script {
    function run() external {
        address prodForwarder = vm.envAddress("CRE_PRODUCTION_FORWARDER");
        address simForwarder = vm.envAddress("CRE_SIMULATION_FORWARDER");
        address attestor = vm.envAddress("CRE_SIM_ATTESTOR");
        address minter = vm.envOr("ONBOARDING_MINTER", address(0));
        address usdc = vm.envOr("TESTNET_USDC", address(0));

        vm.startBroadcast();
        TerraceUSD usd = new TerraceUSD();
        TerraceOracle oracle = new TerraceOracle(prodForwarder, simForwarder, attestor);
        TerraceReputation rep = new TerraceReputation();
        TerraceMarkets markets = new TerraceMarkets(oracle, rep);
        TerraceParlays parlays = new TerraceParlays(oracle, rep);
        TerraceMatchups matchups = new TerraceMatchups(oracle, rep);
        TerraceLeagues leagues = new TerraceLeagues(oracle, rep, ITerraceMarketsView(address(markets)), 0, 17);
        TerraceGovernance gov = new TerraceGovernance(ITerraceLeaguesGov(address(leagues)), 0);
        TerraceChat chat = new TerraceChat(ITerraceLeaguesMembership(address(leagues)), 0);

        leagues.setGovernance(address(gov));
        oracle.setSettlementToken(address(usd), true);
        if (usdc != address(0)) oracle.setSettlementToken(usdc, true);

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
        console.log("TerraceGovernance ", address(gov));
        console.log("TerraceChat       ", address(chat));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TerraceLeagues} from "../src/TerraceLeagues.sol";
import {TestUSD} from "../src/TestUSD.sol";

/// forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
/// Set CRE_FORWARDER to the MockKeystoneForwarder for monad-testnet
/// (confirm with `cre workflow supported-chains` after `cre login`).
contract Deploy is Script {
    function run() external {
        address forwarder = vm.envAddress("CRE_FORWARDER");
        vm.startBroadcast();
        TerraceLeagues leagues = new TerraceLeagues(forwarder);
        TestUSD usd = new TestUSD();
        vm.stopBroadcast();
        console.log("TerraceLeagues", address(leagues));
        console.log("TestUSD", address(usd));
    }
}

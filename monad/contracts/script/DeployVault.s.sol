// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TerraceVault} from "../src/TerraceVault.sol";

/// forge script script/DeployVault.s.sol --rpc-url monad_alchemy --account terrace-deployer --broadcast --slow
contract DeployVault is Script {
    function run() external {
        vm.startBroadcast();
        TerraceVault vault = new TerraceVault();
        vm.stopBroadcast();
        console.log("TerraceVault", address(vault));
    }
}

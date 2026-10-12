// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TerraceFollows} from "../src/TerraceFollows.sol";

/// forge script script/DeployFollows.s.sol --rpc-url monad_alchemy --account terrace-deployer --broadcast --slow
contract DeployFollows is Script {
    function run() external {
        vm.startBroadcast();
        TerraceFollows follows = new TerraceFollows();
        vm.stopBroadcast();
        console.log("TerraceFollows", address(follows));
    }
}

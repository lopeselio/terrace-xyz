// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceUSD} from "../src/TerraceUSD.sol";

contract TerraceUSDTest is Test {
    TerraceUSD usd;
    address player = makeAddr("player");
    address drip = makeAddr("drip");

    function setUp() public {
        vm.warp(1_700_000_000);
        usd = new TerraceUSD();
    }

    function test_claimHasCooldown() public {
        vm.startPrank(player);
        usd.claim();
        assertEq(usd.balanceOf(player), 1_000e6);

        vm.expectRevert(abi.encodeWithSelector(TerraceUSD.ClaimTooSoon.selector, block.timestamp + 1 hours));
        usd.claim();

        vm.warp(block.timestamp + 1 hours);
        usd.claim();
        assertEq(usd.balanceOf(player), 2_000e6);
    }

    function test_onlyMintersMint() public {
        vm.prank(drip);
        vm.expectRevert(TerraceUSD.NotMinter.selector);
        usd.mint(player, 50e6);

        usd.setMinter(drip, true);
        vm.prank(drip);
        usd.mint(player, 50e6);
        assertEq(usd.balanceOf(player), 50e6);
    }
}

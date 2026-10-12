// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceFollows} from "../src/TerraceFollows.sol";

contract TerraceFollowsTest is Test {
    TerraceFollows f;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        f = new TerraceFollows();
    }

    function test_followAndUnfollow() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit TerraceFollows.Followed(alice, bob);
        f.follow(bob);
        assertTrue(f.isFollowing(alice, bob));
        assertEq(f.followers(bob), 1);
        assertEq(f.following(alice), 1);

        // following twice changes nothing
        vm.prank(alice);
        f.follow(bob);
        assertEq(f.followers(bob), 1);

        vm.prank(alice);
        f.unfollow(bob);
        assertFalse(f.isFollowing(alice, bob));
        assertEq(f.followers(bob), 0);
        assertEq(f.following(alice), 0);

        // unfollowing someone you don't follow is a no-op, not an underflow
        vm.prank(alice);
        f.unfollow(bob);
        assertEq(f.followers(bob), 0);
    }

    function test_cannotFollowSelf() public {
        vm.prank(alice);
        vm.expectRevert(TerraceFollows.CannotFollowSelf.selector);
        f.follow(alice);
    }
}

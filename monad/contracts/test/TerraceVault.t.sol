// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceVault} from "../src/TerraceVault.sol";

contract TerraceVaultTest is Test {
    TerraceVault v;
    address fan = address(0xFA11);
    address mallory = address(0xBAD);
    uint256 unlockerKey = 0xE11A11;
    address unlocker;
    bytes wrapped = hex"01aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344556677";

    function setUp() public {
        v = new TerraceVault();
        unlocker = vm.addr(unlockerKey);
    }

    function sign(uint256 key, address account, bytes memory blob, uint256 nonce) internal view returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, v.linkDigest(account, blob, nonce));
        return abi.encodePacked(r, s, vv);
    }

    function test_linkThenRead() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        vm.expectEmit(true, true, false, false);
        emit TerraceVault.Linked(fan, unlocker);
        v.link(unlocker, wrapped, sig);

        (address account, bytes memory blob) = v.entryOf(unlocker);
        assertEq(account, fan);
        assertEq(blob, wrapped);
        assertEq(v.nonces(unlocker), 1);
    }

    function test_unlockerMustAgree() public {
        // A blob signed for the fan can't be stored by someone else, or replayed after use.
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(mallory);
        vm.expectRevert(TerraceVault.BadSignature.selector);
        v.link(unlocker, wrapped, sig);

        vm.prank(fan);
        v.link(unlocker, wrapped, sig);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSignature.selector);
        v.link(unlocker, wrapped, sig);
    }

    function test_signatureCoversTheBlob() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSignature.selector);
        v.link(unlocker, hex"02", sig);
    }

    function test_relinkWithFreshSignature() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, wrapped, sig);
        bytes memory next = hex"01ff";
        bytes memory nextSig = sign(unlockerKey, fan, next, 1);
        vm.prank(fan);
        v.link(unlocker, next, nextSig);
        (, bytes memory blob) = v.entryOf(unlocker);
        assertEq(blob, next);
    }

    function test_onlyTheAccountUnlinks() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, wrapped, sig);

        vm.prank(mallory);
        vm.expectRevert(TerraceVault.NotYours.selector);
        v.unlink(unlocker);

        vm.prank(fan);
        v.unlink(unlocker);
        (address account, bytes memory blob) = v.entryOf(unlocker);
        assertEq(account, address(0));
        assertEq(blob.length, 0);
    }

    function test_sizeLimits() public {
        bytes memory emptySig = sign(unlockerKey, fan, "", 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSize.selector);
        v.link(unlocker, "", emptySig);

        bytes memory huge = new bytes(257);
        bytes memory hugeSig = sign(unlockerKey, fan, huge, 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSize.selector);
        v.link(unlocker, huge, hugeSig);
    }
}

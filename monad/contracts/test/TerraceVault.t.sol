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
        vm.expectEmit(true, true, false, true);
        emit TerraceVault.Linked(fan, unlocker, 1);
        v.link(unlocker, 1, wrapped, sig, false);

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
        v.link(unlocker, 1, wrapped, sig, false);

        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, false);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSignature.selector);
        v.link(unlocker, 1, wrapped, sig, false);
    }

    function test_signatureCoversTheBlob() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSignature.selector);
        v.link(unlocker, 1, hex"02", sig, false);
    }

    function test_relinkWithFreshSignature() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, false);
        bytes memory next = hex"01ff";
        bytes memory nextSig = sign(unlockerKey, fan, next, 1);
        vm.prank(fan);
        v.link(unlocker, 1, next, nextSig, false);
        (, bytes memory blob) = v.entryOf(unlocker);
        assertEq(blob, next);
    }

    function test_onlyTheAccountUnlinks() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, false);

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
        v.link(unlocker, 1, "", emptySig, false);

        bytes memory huge = new bytes(257);
        bytes memory hugeSig = sign(unlockerKey, fan, huge, 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadSize.selector);
        v.link(unlocker, 1, huge, hugeSig, false);
    }

    function test_listsEachAccountsSignIns() public {
        uint256 passkeyKey = 0xFACE1D;
        address passkey = vm.addr(passkeyKey);
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        bytes memory passkeySig = sign(passkeyKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, false);
        vm.prank(fan);
        v.link(passkey, 2, wrapped, passkeySig, false);

        (address[] memory list, uint8[] memory kinds) = v.unlockersOf(fan);
        assertEq(list.length, 2);
        assertEq(list[0], unlocker);
        assertEq(kinds[0], 1);
        assertEq(list[1], passkey);
        assertEq(kinds[1], 2);

        // Relinking the same unlocker doesn't list it twice.
        bytes memory again = sign(unlockerKey, fan, wrapped, 1);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, again, false);
        (list,) = v.unlockersOf(fan);
        assertEq(list.length, 2);

        vm.prank(fan);
        v.unlink(unlocker);
        (list, kinds) = v.unlockersOf(fan);
        assertEq(list.length, 1);
        assertEq(list[0], passkey);
        assertEq(kinds[0], 2);
    }

    function test_movingASignInToAnotherAccount() public {
        // The unlocker agrees to open a different account: it leaves the old account's list.
        address other = address(0x07E7);
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, false);
        bytes memory moveSig = sign(unlockerKey, other, wrapped, 1);
        vm.prank(other);
        v.link(unlocker, 1, wrapped, moveSig, false);

        (address[] memory fanList,) = v.unlockersOf(fan);
        (address[] memory otherList,) = v.unlockersOf(other);
        assertEq(fanList.length, 0);
        assertEq(otherList.length, 1);
        (address account,) = v.entryOf(unlocker);
        assertEq(account, other);
    }

    function test_ownPasskeyIsRecorded() public {
        assertFalse(v.ownPasskey(fan));
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        v.link(unlocker, 1, wrapped, sig, true);
        assertTrue(v.ownPasskey(fan));
    }

    function test_kindMustBeKnown() public {
        bytes memory sig = sign(unlockerKey, fan, wrapped, 0);
        vm.prank(fan);
        vm.expectRevert(TerraceVault.BadKind.selector);
        v.link(unlocker, 3, wrapped, sig, false);
    }
}

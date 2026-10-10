// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceOracle} from "../../src/TerraceOracle.sol";

/// @notice Shared setup: an oracle plus helpers that deliver CRE reports the way the forwarder would.
abstract contract OracleHarness is Test {
    TerraceOracle oracle;
    address prodForwarder = makeAddr("prodForwarder");
    address simForwarder = makeAddr("simForwarder");
    uint256 attestorKey = 0xA77E57;
    address attestor;

    uint64 constant T0 = 1_760_000_000;

    function _deployOracle() internal {
        vm.warp(T0);
        attestor = vm.addr(attestorKey);
        oracle = new TerraceOracle(prodForwarder, simForwarder, attestor);
    }

    function _report(uint8 kind, bytes memory payload) internal {
        vm.prank(prodForwarder);
        oracle.onReport("", abi.encode(kind, payload));
    }

    function _simReport(uint8 kind, bytes memory payload) internal {
        bytes memory body = abi.encode(kind, payload);
        bytes32 digest = keccak256(abi.encode(block.chainid, address(oracle), oracle.simNonce(), keccak256(body)));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, ethDigest);
        vm.prank(simForwarder);
        oracle.onReport("", abi.encode(body, abi.encodePacked(r, s, v)));
    }

    function _schedule(uint256 id, uint64 kickoff) internal {
        uint256[] memory ids = new uint256[](1);
        uint64[] memory ks = new uint64[](1);
        (ids[0], ks[0]) = (id, kickoff);
        _report(oracle.REPORT_FIXTURES(), abi.encode(ids, ks));
    }

    function _result(uint256 id, uint8 home, uint8 away) internal {
        _resultWithState(id, 1, home, away);
    }

    function _resultWithState(uint256 id, uint8 state, uint8 home, uint8 away) internal {
        uint256[] memory ids = new uint256[](1);
        uint8[] memory st = new uint8[](1);
        uint8[] memory h = new uint8[](1);
        uint8[] memory a = new uint8[](1);
        (ids[0], st[0], h[0], a[0]) = (id, state, home, away);
        _report(oracle.REPORT_RESULTS(), abi.encode(ids, st, h, a));
    }

    function _answer(uint256 questionId, uint8 answer) internal {
        uint256[] memory ids = new uint256[](1);
        uint8[] memory ans = new uint8[](1);
        (ids[0], ans[0]) = (questionId, answer);
        _report(oracle.REPORT_ANSWERS(), abi.encode(ids, ans));
    }
}

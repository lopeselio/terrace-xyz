// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title TerraceVault
/// @notice More ways into one Terrace account. Every key a fan has (account, agent, sealed picks) comes
///         from one 32-byte root secret. The vault stores that root encrypted ("wrapped") under another
///         unlocker, such as the wallet behind an email sign-in, so the unlocker opens the same account
///         on any device. The contract only ever holds ciphertext.
contract TerraceVault is EIP712 {
    struct Entry {
        address account;
        bytes wrapped;
    }

    bytes32 public constant LINK_TYPEHASH = keccak256("Link(address account,bytes32 wrappedHash,uint256 nonce)");
    uint256 public constant MAX_WRAPPED = 256;

    mapping(address unlocker => Entry) private entries;
    mapping(address unlocker => uint256) public nonces;

    event Linked(address indexed account, address indexed unlocker);
    event Unlinked(address indexed account, address indexed unlocker);

    error BadSize();
    error BadSignature();
    error NotYours();

    constructor() EIP712("TerraceVault", "1") {}

    /// @notice The account (the sender) stores its wrapped root under `unlocker`. The unlocker signs a
    ///         Link to agree, so nobody can park a blob under someone else's sign-in.
    function link(address unlocker, bytes calldata wrapped, bytes calldata unlockerSig) external {
        if (wrapped.length == 0 || wrapped.length > MAX_WRAPPED) revert BadSize();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(LINK_TYPEHASH, msg.sender, keccak256(wrapped), nonces[unlocker])));
        if (ECDSA.recover(digest, unlockerSig) != unlocker) revert BadSignature();
        nonces[unlocker] += 1;
        entries[unlocker] = Entry(msg.sender, wrapped);
        emit Linked(msg.sender, unlocker);
    }

    /// @notice The account removes one of its unlockers (say, an email it no longer uses).
    function unlink(address unlocker) external {
        if (entries[unlocker].account != msg.sender) revert NotYours();
        delete entries[unlocker];
        emit Unlinked(msg.sender, unlocker);
    }

    function entryOf(address unlocker) external view returns (address account, bytes memory wrapped) {
        Entry storage e = entries[unlocker];
        return (e.account, e.wrapped);
    }

    /// @notice The digest an unlocker signs for `link` (also exposed so clients can check their typed data).
    function linkDigest(address account, bytes calldata wrapped, uint256 nonce) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LINK_TYPEHASH, account, keccak256(wrapped), nonce)));
    }
}

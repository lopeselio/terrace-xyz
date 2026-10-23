// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title TerraceVault
/// @notice More ways into one Terrace account. Every key a fan has (account, agent, sealed picks) comes
///         from one 32-byte root secret. The vault stores that root encrypted ("wrapped") under another
///         unlocker, such as the wallet behind an email sign-in, so the unlocker opens the same account
///         on any device. The contract only ever holds ciphertext, plus which kinds of sign-in an
///         account has, so the app can show them.
contract TerraceVault is EIP712 {
    /// @notice What an unlocker is, for display only: it never changes what the unlocker can open.
    uint8 public constant EMAIL = 1;
    uint8 public constant PASSKEY = 2;

    struct Entry {
        address account;
        uint8 kind;
        bytes wrapped;
    }

    bytes32 public constant LINK_TYPEHASH = keccak256("Link(address account,bytes32 wrappedHash,uint256 nonce)");
    uint256 public constant MAX_WRAPPED = 256;

    mapping(address unlocker => Entry) private entries;
    mapping(address unlocker => uint256) public nonces;
    mapping(address account => address[]) private unlockers;
    /// @notice The account's root is its own passkey's: that passkey opens it without the vault.
    mapping(address account => bool) public ownPasskey;

    event Linked(address indexed account, address indexed unlocker, uint8 kind);
    event Unlinked(address indexed account, address indexed unlocker);

    error BadSize();
    error BadKind();
    error BadSignature();
    error NotYours();

    constructor() EIP712("TerraceVault", "1") {}

    /// @notice The account (the sender) stores its wrapped root under `unlocker`. The unlocker signs a
    ///         Link to agree, so nobody can park a blob under someone else's sign-in. `senderHasPasskey`
    ///         records that the account was made with a passkey, which the vault otherwise can't see.
    function link(address unlocker, uint8 kind, bytes calldata wrapped, bytes calldata unlockerSig, bool senderHasPasskey) external {
        if (wrapped.length == 0 || wrapped.length > MAX_WRAPPED) revert BadSize();
        if (kind != EMAIL && kind != PASSKEY) revert BadKind();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(LINK_TYPEHASH, msg.sender, keccak256(wrapped), nonces[unlocker])));
        if (ECDSA.recover(digest, unlockerSig) != unlocker) revert BadSignature();
        nonces[unlocker] += 1;

        address previous = entries[unlocker].account;
        if (previous != msg.sender) {
            if (previous != address(0)) _drop(previous, unlocker);
            unlockers[msg.sender].push(unlocker);
        }
        entries[unlocker] = Entry(msg.sender, kind, wrapped);
        if (senderHasPasskey) ownPasskey[msg.sender] = true;
        emit Linked(msg.sender, unlocker, kind);
    }

    /// @notice The account removes one of its unlockers (say, an email it no longer uses).
    function unlink(address unlocker) external {
        if (entries[unlocker].account != msg.sender) revert NotYours();
        delete entries[unlocker];
        _drop(msg.sender, unlocker);
        emit Unlinked(msg.sender, unlocker);
    }

    function entryOf(address unlocker) external view returns (address account, bytes memory wrapped) {
        Entry storage e = entries[unlocker];
        return (e.account, e.wrapped);
    }

    /// @notice Every sign-in that opens `account` through the vault, and what kind each is.
    function unlockersOf(address account) external view returns (address[] memory list, uint8[] memory kinds) {
        list = unlockers[account];
        kinds = new uint8[](list.length);
        for (uint256 i; i < list.length; i++) kinds[i] = entries[list[i]].kind;
    }

    /// @notice The digest an unlocker signs for `link` (also exposed so clients can check their typed data).
    function linkDigest(address account, bytes calldata wrapped, uint256 nonce) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LINK_TYPEHASH, account, keccak256(wrapped), nonce)));
    }

    function _drop(address account, address unlocker) private {
        address[] storage list = unlockers[account];
        for (uint256 i; i < list.length; i++) {
            if (list[i] == unlocker) {
                list[i] = list[list.length - 1];
                list.pop();
                return;
            }
        }
    }
}

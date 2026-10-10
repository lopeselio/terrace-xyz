// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TerraceUSD
/// @notice Testnet dollars for Terrace. No monetary value.
///         - Anyone can claim a small amount once per cooldown.
///         - Minters (the onboarding server) top up new players so they can play straight away.
contract TerraceUSD is ERC20, Ownable {
    uint256 public constant CLAIM_AMOUNT = 1_000e6;
    uint256 public constant CLAIM_COOLDOWN = 1 hours;

    mapping(address => bool) public isMinter;
    mapping(address => uint256) public lastClaim;

    event MinterSet(address indexed minter, bool allowed);

    error NotMinter();
    error ClaimTooSoon(uint256 nextClaimAt);

    constructor() ERC20("Terrace Dollar", "tUSD") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (!isMinter[msg.sender] && msg.sender != owner()) revert NotMinter();
        _mint(to, amount);
    }

    /// @notice Self-serve top-up for players and agents.
    function claim() external {
        uint256 next = lastClaim[msg.sender] + CLAIM_COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < next) revert ClaimTooSoon(next);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, CLAIM_AMOUNT);
    }
}

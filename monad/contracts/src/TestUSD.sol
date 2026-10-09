// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only prize token with an open faucet. No monetary value.
contract TestUSD is ERC20 {
    constructor() ERC20("Terrace Test USD", "tUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(address to, uint256 amount) external {
        require(amount <= 1_000e6, "max 1000 per call");
        _mint(to, amount);
    }
}

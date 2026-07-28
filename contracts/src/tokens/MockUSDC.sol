// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DemoERC20} from "./DemoERC20.sol";

/// @notice 6-decimal mock USDC for local Anvil demos.
contract MockUSDC is DemoERC20 {
    constructor(address owner_) DemoERC20("USD Coin", "USDC", 6, owner_) {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISentinelAchievements {
    function recordCheck(address user) external;
    function recordSafeSwap(address user, address tokenIn, uint256 amountIn) external;
}

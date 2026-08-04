// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISentinelAchievements} from "../achievements/ISentinelAchievements.sol";

/// @notice Product ledger: per-user stats + trade events (replaces legacy achievements on new deploys).
interface ISentinelLedger is ISentinelAchievements {
    enum ExecutionMode {
        Safe,
        Force,
        Sda
    }

    function recordTrade(
        address user,
        bytes32 routeId,
        ExecutionMode mode,
        uint8 poolLabel,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut
    ) external;
}

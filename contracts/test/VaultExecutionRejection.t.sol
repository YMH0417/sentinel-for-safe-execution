// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultExecution} from "../src/VaultExecution.sol";
import {VaultExecutionTestBase} from "./VaultExecutionTestBase.sol";

/**
 * @notice ALLOW / REJECT / FALLBACK 决策测试
 */
contract VaultExecutionRejectionTest is VaultExecutionTestBase {
    function test_Reject_WhenAgentDecisionIsReject() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory signature = signPermit(
            user,
            "route-b",
            1000,
            999,
            deadline,
            60,
            VaultExecution.Decision.REJECT,
            0
        );

        vm.expectEmit(true, true, false, true);
        emit VaultExecution.VaultRejected(
            user,
            "route-b",
            "Agent decision is REJECT",
            60,
            block.timestamp
        );

        vm.prank(user);
        bool executed = vault.executeRoute(
            user,
            "route-b",
            1000,
            999,
            deadline,
            60,
            VaultExecution.Decision.REJECT,
            0,
            signature
        );

        assertFalse(executed);
        assertEq(vault.nonces(user), 1);
    }

    function test_Reject_WhenRiskScoreIsHigh() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory signature = signPermit(
            user,
            "route-b",
            1000,
            999,
            deadline,
            84,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.expectEmit(true, true, false, true);
        emit VaultExecution.VaultRejected(
            user,
            "route-b",
            "Risk score exceeds threshold",
            84,
            block.timestamp
        );

        vm.prank(relayer);
        bool executed = vault.executeRoute(
            user,
            "route-b",
            1000,
            999,
            deadline,
            84,
            VaultExecution.Decision.ALLOW,
            0,
            signature
        );

        assertFalse(executed);
    }

    function test_Allow_FallbackDecision() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory signature = signPermit(
            user,
            "route-a",
            1000,
            999,
            deadline,
            60,
            VaultExecution.Decision.FALLBACK_TO_SAFE_ROUTE,
            0
        );

        vm.prank(relayer);
        bool executed = vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            60,
            VaultExecution.Decision.FALLBACK_TO_SAFE_ROUTE,
            0,
            signature
        );

        assertTrue(executed);
    }
}

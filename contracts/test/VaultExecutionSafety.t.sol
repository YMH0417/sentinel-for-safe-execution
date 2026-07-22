// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VaultExecution} from "../src/VaultExecution.sol";

/**
 * @notice 安全约束测试 — maxLossBps, deadline, paused
 */
contract VaultExecutionSafetyTest is Test {
    VaultExecution public vault;
    address public user = address(0x1234);

    function setUp() public {
        vault = new VaultExecution(100); // 1%
    }

    function test_Revert_WhenDeadlineExpired() public {
        uint256 pastDeadline = block.timestamp - 1;

        vm.expectRevert();
        vm.prank(user);
        vault.executeRoute(
            "route-a",
            1000,
            999,
            pastDeadline,
            10,
            "ALLOW"
        );
    }

    function test_Revert_WhenLossExceedsMax() public {
        // amountOutQuoted=800 → loss=2000 bps > 100 bps
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert();
        vm.prank(user);
        vault.executeRoute(
            "route-b",
            1000,
            800,
            deadline,
            84,
            "REJECT"
        );
    }

    function test_Reject_WhenRiskScoreHigh() public {
        uint256 deadline = block.timestamp + 3600;

        // riskScore=85 >= 70 → VaultRejected 事件，不 revert
        vm.expectEmit(true, true, true, true);
        emit VaultExecution.VaultRejected(
            user,
            "route-b",
            "Risk score 85 exceeds threshold. Decision: REJECT",
            85,
            block.timestamp
        );

        vm.prank(user);
        vault.executeRoute(
            "route-b",
            1000,
            999, // loss 很小，但 riskScore 高
            deadline,
            85,
            "REJECT"
        );
    }

    function test_Allow_WhenAllPass() public {
        uint256 deadline = block.timestamp + 3600;

        vm.expectEmit(true, true, true, true);
        emit VaultExecution.VaultExecuted(
            user,
            "route-a",
            1000,
            999,
            block.timestamp
        );

        vm.prank(user);
        vault.executeRoute(
            "route-a",
            1000,
            999,
            deadline,
            20,
            "ALLOW"
        );
    }
}

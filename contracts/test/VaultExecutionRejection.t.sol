// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VaultExecution} from "../src/VaultExecution.sol";

/**
 * @notice 拒绝路径测试 — route-b 被拒绝的场景
 */
contract VaultExecutionRejectionTest is Test {
    VaultExecution public vault;
    address public user = address(0x1234);

    function setUp() public {
        vault = new VaultExecution(100); // 1%
    }

    /**
     * @dev route-b: quotedOut=800, expectedOut=1000
     * lossBps = (1000-800)*10000/1000 = 2000 bps >> 100 → Revert
     */
    function test_Reject_RouteB_LossExceeds() public {
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

    /**
     * @dev route-b 高 riskScore 触发 VaultRejected 事件
     */
    function test_Reject_RouteB_HighRiskScore() public {
        uint256 deadline = block.timestamp + 3600;

        vm.expectEmit(true, true, true, true);
        emit VaultExecution.VaultRejected(
            user,
            "route-b",
            "Risk score 84 exceeds threshold. Decision: REJECT",
            84,
            block.timestamp
        );

        vm.prank(user);
        vault.executeRoute(
            "route-b",
            1000,
            999, // loss 低但 riskScore 高
            deadline,
            84,
            "REJECT"
        );
    }

    /**
     * @dev paused + 任何 route → Revert
     */
    function test_Reject_WhenVaultPaused() public {
        vault.setPaused(true);
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(VaultExecution.VaultIsPaused.selector);
        vm.prank(user);
        vault.executeRoute(
            "route-a",
            1000,
            999,
            deadline,
            10,
            "ALLOW"
        );
    }
}

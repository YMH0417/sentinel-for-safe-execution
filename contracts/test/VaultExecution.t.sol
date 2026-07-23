// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultExecution} from "../src/VaultExecution.sol";
import {VaultExecutionTestBase} from "./VaultExecutionTestBase.sol";

/**
 * @notice 基础功能测试 — 正常执行路径
 */
contract VaultExecutionTest is VaultExecutionTestBase {
    function test_NormalExecution() public {
        uint256 deadline = block.timestamp + 3600;
        bytes32 routeId = "route-a";
        bytes memory signature = signPermit(
            user,
            routeId,
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.expectEmit(true, true, false, true);
        emit VaultExecution.VaultExecuted(
            user,
            routeId,
            1000,
            999,
            20,
            VaultExecution.Decision.ALLOW,
            block.timestamp
        );

        vm.prank(relayer);
        bool executed = vault.executeRoute(
            user,
            routeId,
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            signature
        );

        assertTrue(executed);
        assertEq(vault.nonces(user), 1);
    }

    function test_computeLossBps_ZeroLoss() public view {
        assertEq(vault.computeLossBps(1000, 1000), 0);
    }

    function test_computeLossBps_SomeLoss() public view {
        // (1000 - 990) / 1000 * 10000 = 100 bps
        assertEq(vault.computeLossBps(1000, 990), 100);
    }

    function test_computeLossBps_LargeLoss() public view {
        // (1000 - 800) / 1000 * 10000 = 2000 bps
        assertEq(vault.computeLossBps(1000, 800), 2000);
    }

    function test_computeLossBps_NoLoss() public view {
        assertEq(vault.computeLossBps(1000, 1100), 0);
    }

    function test_SetPaused() public {
        assertEq(vault.paused(), false);
        vm.startPrank(owner);
        vault.setPaused(true);
        assertEq(vault.paused(), true);
        vault.setPaused(false);
        vm.stopPrank();
        assertEq(vault.paused(), false);
    }

    function test_SetMaxLossBps() public {
        assertEq(vault.maxLossBps(), 100);
        vm.prank(owner);
        vault.setMaxLossBps(200);
        assertEq(vault.maxLossBps(), 200);
    }

    function test_RevertWhenNonOwnerUpdatesConfig() public {
        vm.expectRevert(
            abi.encodeWithSelector(VaultExecution.Unauthorized.selector, user)
        );
        vm.prank(user);
        vault.setMaxLossBps(200);
    }

    function test_RevertWhenPaused() public {
        vm.prank(owner);
        vault.setPaused(true);
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(VaultExecution.VaultIsPaused.selector);
        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            10,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VaultExecution} from "../src/VaultExecution.sol";

/**
 * @notice 基础功能测试 — 正常执行路径
 */
contract VaultExecutionTest is Test {
    VaultExecution public vault;
    address public user = address(0x1234);

    function setUp() public {
        vault = new VaultExecution(100); // 1% max loss
    }

    function test_NormalExecution() public {
        // amountIn=1000, amountOutQuoted=999 → loss=10 bps < 100 bps
        uint256 deadline = block.timestamp + 3600;

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
        vault.setPaused(true);
        assertEq(vault.paused(), true);
        vault.setPaused(false);
        assertEq(vault.paused(), false);
    }

    function test_SetMaxLossBps() public {
        assertEq(vault.maxLossBps(), 100);
        vault.setMaxLossBps(200);
        assertEq(vault.maxLossBps(), 200);
    }

    function test_RevertWhenPaused() public {
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

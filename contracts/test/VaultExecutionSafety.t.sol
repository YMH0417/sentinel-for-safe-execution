// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultExecution} from "../src/VaultExecution.sol";
import {VaultExecutionTestBase} from "./VaultExecutionTestBase.sol";

/**
 * @notice 安全约束测试 — maxLossBps, deadline, signature, nonce
 */
contract VaultExecutionSafetyTest is VaultExecutionTestBase {
    function test_Revert_WhenDeadlineExpired() public {
        uint256 pastDeadline = block.timestamp - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                VaultExecution.DeadlineExpired.selector,
                pastDeadline,
                block.timestamp
            )
        );
        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            pastDeadline,
            10,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );
    }

    function test_Revert_WhenLossExceedsMax() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory signature = signPermit(
            user,
            "route-b",
            1000,
            800,
            deadline,
            60,
            VaultExecution.Decision.FALLBACK_TO_SAFE_ROUTE,
            0
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                VaultExecution.LossExceedsMax.selector,
                2000,
                100
            )
        );
        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-b",
            1000,
            800,
            deadline,
            60,
            VaultExecution.Decision.FALLBACK_TO_SAFE_ROUTE,
            0,
            signature
        );
    }

    function test_Revert_WhenSignatureIsNotFromAgent() public {
        uint256 deadline = block.timestamp + 3600;
        bytes32 digest = vault.getExecutionDigest(
            user,
            "route-b",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, digest);

        vm.expectRevert(VaultExecution.InvalidSignature.selector);
        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-b",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            abi.encodePacked(r, s, v)
        );
    }

    function test_Revert_WhenNonceIsReplayed() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory signature = signPermit(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            signature
        );

        vm.expectRevert(
            abi.encodeWithSelector(VaultExecution.InvalidNonce.selector, 1, 0)
        );
        vm.prank(relayer);
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            signature
        );
    }
}

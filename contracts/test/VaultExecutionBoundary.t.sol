// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultExecution} from "../src/VaultExecution.sol";
import {VaultExecutionTestBase} from "./VaultExecutionTestBase.sol";

/**
 * @notice 管理权限、非法输入和 EIP-712 domain 边界测试
 */
contract VaultExecutionBoundaryTest is VaultExecutionTestBase {
    function test_TransferOwnership() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        vault.transferOwnership(newOwner);

        assertEq(vault.owner(), newOwner);

        vm.expectRevert(
            abi.encodeWithSelector(VaultExecution.Unauthorized.selector, owner)
        );
        vm.prank(owner);
        vault.setPaused(true);

        vm.prank(newOwner);
        vault.setPaused(true);
        assertTrue(vault.paused());
    }

    function test_SetAgentSigner() public {
        address newSigner = vm.addr(0xBEEF);

        vm.prank(owner);
        vault.setAgentSigner(newSigner);

        assertEq(vault.agentSigner(), newSigner);
    }

    function test_Revert_OldSignerAfterRotation() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory oldSignature = signPermit(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.prank(owner);
        vault.setAgentSigner(vm.addr(0xBEEF));

        vm.expectRevert(VaultExecution.InvalidSignature.selector);
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
            oldSignature
        );
    }

    function test_Revert_WhenMaxLossBpsExceedsDenominator() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultExecution.InvalidMaxLossBps.selector,
                10_001
            )
        );
        vm.prank(owner);
        vault.setMaxLossBps(10_001);
    }

    function test_Revert_ConstructorWithInvalidConfig() public {
        vm.expectRevert(VaultExecution.ZeroAddress.selector);
        new VaultExecution(100, address(0), agentSigner);

        vm.expectRevert(VaultExecution.ZeroAddress.selector);
        new VaultExecution(100, owner, address(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                VaultExecution.InvalidMaxLossBps.selector,
                10_001
            )
        );
        new VaultExecution(10_001, owner, agentSigner);
    }

    function test_Revert_InvalidExecutionInputs() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.expectRevert(VaultExecution.ZeroAddress.selector);
        vault.executeRoute(
            address(0),
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );

        vm.expectRevert(VaultExecution.InvalidRouteId.selector);
        vault.executeRoute(
            user,
            bytes32(0),
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );

        vm.expectRevert(VaultExecution.InvalidAmountIn.selector);
        vault.executeRoute(
            user,
            "route-a",
            0,
            0,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                VaultExecution.InvalidRiskScore.selector,
                101
            )
        );
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            101,
            VaultExecution.Decision.ALLOW,
            0,
            hex""
        );
    }

    function test_Revert_CrossContractSignatureReplay() public {
        VaultExecution otherVault = new VaultExecution(
            100,
            owner,
            agentSigner
        );
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signatureForOriginalVault = signPermit(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.expectRevert(VaultExecution.InvalidSignature.selector);
        otherVault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            signatureForOriginalVault
        );
    }

    function test_Revert_CrossChainSignatureReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signatureForOriginalChain = signPermit(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0
        );

        vm.chainId(10_143);

        vm.expectRevert(VaultExecution.InvalidSignature.selector);
        vault.executeRoute(
            user,
            "route-a",
            1000,
            999,
            deadline,
            20,
            VaultExecution.Decision.ALLOW,
            0,
            signatureForOriginalChain
        );
    }
}

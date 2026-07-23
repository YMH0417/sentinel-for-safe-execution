// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultExecution} from "../src/VaultExecution.sol";

abstract contract VaultExecutionTestBase is Test {
    uint256 internal constant AGENT_PRIVATE_KEY = 0xA11CE;

    VaultExecution public vault;
    address public owner;
    address public agentSigner;
    address public user;
    address public relayer;

    function setUp() public virtual {
        owner = makeAddr("owner");
        agentSigner = vm.addr(AGENT_PRIVATE_KEY);
        user = makeAddr("user");
        relayer = makeAddr("relayer");
        vault = new VaultExecution(100, owner, agentSigner);
    }

    function signPermit(
        address permitUser,
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 deadline,
        uint256 riskScore,
        VaultExecution.Decision decision,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 digest = vault.getExecutionDigest(
            permitUser,
            routeId,
            amountIn,
            amountOutQuoted,
            deadline,
            riskScore,
            decision,
            nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_PRIVATE_KEY, digest);
        return abi.encodePacked(r, s, v);
    }
}

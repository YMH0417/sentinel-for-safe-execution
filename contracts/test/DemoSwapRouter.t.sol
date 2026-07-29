// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoSwapRouter} from "../src/demo/DemoSwapRouter.sol";
import {VaultExecution} from "../src/VaultExecution.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";

contract DemoSwapRouterTest is Test {
    DemoScenarioDeployer internal scenarioDeployer;
    DemoScenarioDeployer.Scenario internal scenario;
    VaultExecution internal vault;
    DemoSwapRouter internal router;

    address internal agent;
    address internal user = makeAddr("user");
    uint256 internal agentPrivateKey = 0xA11CE;

    function setUp() public {
        agent = vm.addr(agentPrivateKey);

        scenarioDeployer = new DemoScenarioDeployer();
        scenario = scenarioDeployer.deploy();

        vault = new VaultExecution(100, address(this), agent);
        router = new DemoSwapRouter(address(vault), address(scenario.registry), address(scenarioDeployer));
        scenarioDeployer.authorizeFunder(address(router), true);
        scenarioDeployer.authorizeFunder(address(this), true);
    }

    function test_swapWithPermit_executesVaultAndSwap() public {
        DemoPoolRegistry.PoolEntry memory pool = scenario.registry.getPoolByRouteId(
            scenarioDeployer.routeId("route-usdc-good-safe")
        );

        uint256 amountIn = 1e6;
        uint256 amountOutQuoted = 1e6; // loss bps check passes when quoted >= out for vault
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        scenarioDeployer.fundSwapper(pool.tokenIn, user, amountIn);
        vm.prank(user);
        DemoERC20(pool.tokenIn).approve(address(router), amountIn);

        bytes memory sig = _signPermit(
            user,
            pool.routeId,
            amountIn,
            amountOutQuoted,
            deadline,
            0,
            VaultExecution.Decision.ALLOW,
            nonce
        );

        uint256 goodBefore = DemoERC20(pool.tokenOut).balanceOf(user);
        uint256 usdcBefore = DemoERC20(pool.tokenIn).balanceOf(user);

        uint256 amountOut = router.swapWithPermit(
            user,
            pool.routeId,
            amountIn,
            amountOutQuoted,
            1,
            deadline,
            0,
            VaultExecution.Decision.ALLOW,
            nonce,
            sig,
            user
        );

        assertGt(amountOut, 0);
        assertEq(DemoERC20(pool.tokenIn).balanceOf(user), usdcBefore - amountIn);
        assertGt(DemoERC20(pool.tokenOut).balanceOf(user) - goodBefore, 0);
        assertEq(vault.nonces(user), 1);
    }

    function _signPermit(
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
            permitUser, routeId, amountIn, amountOutQuoted, deadline, riskScore, decision, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}

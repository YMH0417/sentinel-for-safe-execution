// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {DemoPair} from "../src/dex/DemoPair.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";

/// @notice Swap 1 unit tokenIn on all pools of an already-deployed scenario.
/// Env: SCENARIO_DEPLOYER, DEMO_REGISTRY
contract Verify36SwapsDeployed is Script {
    uint256 internal constant ANVIL_DEFAULT_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", ANVIL_DEFAULT_KEY);
        address trader = vm.addr(pk);
        address scenarioDeployer = vm.envAddress("SCENARIO_DEPLOYER");
        address registryAddr = vm.envAddress("DEMO_REGISTRY");

        DemoPoolRegistry registry = DemoPoolRegistry(registryAddr);
        DemoPoolRegistry.PoolEntry[] memory pools = registry.getAllPools();
        require(pools.length == 36, "expected 36 pools");

        console2.log("Registry:", registryAddr);
        console2.log("ScenarioDeployer:", scenarioDeployer);
        console2.log("Trader:", trader);

        vm.startBroadcast(pk);

        uint256 passed;
        for (uint256 i = 0; i < pools.length; i++) {
            if (_trySwap(scenarioDeployer, pools[i], trader)) passed++;
        }

        vm.stopBroadcast();

        console2.log("Passed:", passed);
        console2.log("Failed:", pools.length - passed);
        require(passed == pools.length, "swap verification failed");
    }

    function _trySwap(address scenarioDeployer, DemoPoolRegistry.PoolEntry memory entry, address trader)
        private
        returns (bool)
    {
        uint8 decIn = DemoERC20(entry.tokenIn).decimals();
        uint256 amountIn = 10 ** uint256(decIn);

        DemoScenarioDeployer(scenarioDeployer).fundSwapper(entry.tokenIn, trader, amountIn);

        DemoPair pair = DemoPair(entry.pair);
        address token0 = pair.token0();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, token0, entry.tokenIn);
        uint256 quotedOut = UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);

        uint256 amount0Out = entry.tokenOut == token0 ? quotedOut : 0;
        uint256 amount1Out = entry.tokenOut == token0 ? 0 : quotedOut;

        uint256 balBefore = DemoERC20(entry.tokenOut).balanceOf(trader);
        DemoERC20(entry.tokenIn).transfer(entry.pair, amountIn);
        pair.swap(amount0Out, amount1Out, trader);
        uint256 received = DemoERC20(entry.tokenOut).balanceOf(trader) - balBefore;

        bool ok = received == quotedOut && received > 0;
        console2.log(ok ? "PASS" : "FAIL", entry.pair, "out", received);
        return ok;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {DemoPair} from "../src/dex/DemoPair.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";

/// @notice Deploy on Anvil and swap 1 unit tokenIn on all 48 routes; logs pair addresses + results.
contract TestAll36Swaps is Script {
    uint256 internal constant ANVIL_DEFAULT_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    string[4] internal symbols = ["USDC", "GOOD", "BAD", "BAIT"];

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", ANVIL_DEFAULT_KEY);
        address trader = vm.addr(pk);

        vm.startBroadcast(pk);

        DemoScenarioDeployer scenarioDeployer = new DemoScenarioDeployer();
        DemoScenarioDeployer.Scenario memory scenario = scenarioDeployer.deploy();
        scenarioDeployer.authorizeFunder(trader, true);

        console2.log("=== Deployed ===");
        console2.log("Registry:", address(scenario.registry));
        console2.log("Trader:", trader);
        console2.log("");

        DemoPoolRegistry.PoolEntry[] memory pools = scenario.registry.getAllPools();
        uint256 passed;
        uint256 failed;

        for (uint256 i = 0; i < pools.length; i++) {
            bool ok = _trySwap(
                scenarioDeployer, scenario, pools[i], vm.toString(i + 1), trader, i + 1
            );
            if (ok) passed++;
            else failed++;
        }

        console2.log("");
        console2.log("=== Summary ===");
        console2.log("Passed:", passed);
        console2.log("Failed:", failed);
        console2.log("Total:", pools.length);

        vm.stopBroadcast();

        require(failed == 0, "some routes failed");
    }

    function _trySwap(
        DemoScenarioDeployer scenarioDeployer,
        DemoScenarioDeployer.Scenario memory scenario,
        DemoPoolRegistry.PoolEntry memory entry,
        string memory routeName,
        address trader,
        uint256 index
    ) private returns (bool) {
        uint256 amountIn = _amountIn(entry.tokenIn, scenario);

        scenarioDeployer.fundSwapper(entry.tokenIn, trader, amountIn);

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

        console2.log(ok ? "PASS" : "FAIL", index, routeName);
        console2.log("  pair:", entry.pair);
        console2.log("  tokenIn:", entry.tokenIn);
        console2.log("  tokenOut:", entry.tokenOut);
        console2.log("  amountIn:", amountIn);
        console2.log("  received:", received);
        console2.log("  expected:", quotedOut);

        return ok;
    }

    function _amountIn(address tokenIn, DemoScenarioDeployer.Scenario memory scenario)
        private
        pure
        returns (uint256)
    {
        if (tokenIn == address(scenario.tokens.usdc)) return 1e6;
        return 1 ether;
    }
}

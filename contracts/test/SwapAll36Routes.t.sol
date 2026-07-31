// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {DemoPair} from "../src/dex/DemoPair.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";

/// @notice Swap 1 unit of tokenIn on every registered route (48 total).
contract SwapAll36RoutesTest is Test {
    DemoScenarioDeployer internal deployer;
    DemoScenarioDeployer.Scenario internal scenario;
    address internal trader = address(0xBEEF);

    function setUp() public {
        deployer = new DemoScenarioDeployer();
        scenario = deployer.deploy();
        deployer.authorizeFunder(address(this), true);
    }

    function test_all48RoutesSwapSuccessfully() public {
        DemoPoolRegistry.PoolEntry[] memory pools = scenario.registry.getAllPools();
        assertEq(pools.length, 48);

        for (uint256 i = 0; i < pools.length; i++) {
            _assertSwapWorks(pools[i], i + 1);
        }
    }

    function _assertSwapWorks(DemoPoolRegistry.PoolEntry memory entry, uint256 index) private {
        uint256 amountIn = _amountIn(entry.tokenIn);
        deployer.fundSwapper(entry.tokenIn, trader, amountIn);

        DemoPair pair = DemoPair(entry.pair);
        address token0 = pair.token0();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, token0, entry.tokenIn);
        uint256 quotedOut = UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
        assertGt(quotedOut, 0, "quotedOut zero");

        uint256 amount0Out = entry.tokenOut == token0 ? quotedOut : 0;
        uint256 amount1Out = entry.tokenOut == token0 ? 0 : quotedOut;

        uint256 balBefore = DemoERC20(entry.tokenOut).balanceOf(trader);

        vm.startPrank(trader);
        DemoERC20(entry.tokenIn).transfer(entry.pair, amountIn);
        pair.swap(amount0Out, amount1Out, trader);
        vm.stopPrank();

        uint256 received = DemoERC20(entry.tokenOut).balanceOf(trader) - balBefore;
        assertEq(received, quotedOut, "swap output mismatch");
        assertGt(received, 0, "no tokens received");

        console2.log("PASS route", index);
        console2.log("  pair:", entry.pair);
        console2.log("  out:", received);
    }

    function _amountIn(address tokenIn) private view returns (uint256) {
        if (tokenIn == address(scenario.tokens.usdc)) return 1e6;
        return 1 ether;
    }
}

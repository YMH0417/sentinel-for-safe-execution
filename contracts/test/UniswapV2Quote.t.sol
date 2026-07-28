// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";

contract UniswapV2QuoteTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant TOKEN = 1 ether;

    function test_safePool_quote100Usdc() public pure {
        uint256 out = UniswapV2Quote.getAmountOut(100 * USDC, 1_000_000 * USDC, 1_000_000 * TOKEN);
        assertApproxEqRel(out, 99.1 ether, 0.02e18);
    }

    function test_shallowPool_quote100Usdc() public pure {
        uint256 out = UniswapV2Quote.getAmountOut(100 * USDC, 500 * USDC, 500 * TOKEN);
        assertApproxEqRel(out, 83.1 ether, 0.02e18);
    }

    function test_toxicPool_quote100Usdc() public pure {
        uint256 out = UniswapV2Quote.getAmountOut(100 * USDC, 40_000 * USDC, 50_000 * TOKEN);
        assertApproxEqRel(out, 124.3 ether, 0.03e18);
    }

    function test_toxicOut_gt_safeOut() public pure {
        uint256 safeOut = UniswapV2Quote.getAmountOut(100 * USDC, 1_000_000 * USDC, 1_000_000 * TOKEN);
        uint256 toxicOut = UniswapV2Quote.getAmountOut(100 * USDC, 40_000 * USDC, 50_000 * TOKEN);
        assertGt(toxicOut, safeOut);
    }

    function test_safe_lowImpact() public pure {
        uint256 impact = UniswapV2Quote.getPriceImpactBps(100 * USDC, 1_000_000 * USDC, 1_000_000 * TOKEN);
        assertLt(impact, 100);
    }

    function test_shallow_highImpact() public pure {
        uint256 impact = UniswapV2Quote.getPriceImpactBps(100 * USDC, 500 * USDC, 500 * TOKEN);
        assertGt(impact, 1000);
    }
}

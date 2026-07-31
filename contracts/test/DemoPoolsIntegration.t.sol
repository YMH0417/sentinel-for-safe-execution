// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";
import {IDemoPair} from "../src/dex/interfaces/IDemoPair.sol";

contract DemoPoolsIntegrationTest is Test {
    uint256 internal constant QUOTE_USDC = 100 * 1e6;
    uint256 internal constant QUOTE_TOKEN = 100 ether;

    DemoScenarioDeployer internal deployer;
    DemoScenarioDeployer.Scenario internal scenario;

    function setUp() public {
        deployer = new DemoScenarioDeployer();
        scenario = deployer.deploy();
    }

    function test_allPoolsHaveLiquidity() public view {
        DemoPoolRegistry.PoolEntry[] memory pools = scenario.registry.getAllPools();
        assertEq(pools.length, 48);
        for (uint256 i = 0; i < pools.length; i++) {
            (uint112 r0, uint112 r1,) = IDemoPair(pools[i].pair).getReserves();
            assertGt(uint256(r0), 0);
            assertGt(uint256(r1), 0);
        }
    }

    function test_registryPoolCountIs48() public view {
        assertEq(scenario.registry.poolCount(), 48);
        assertTrue(scenario.registry.isSealed());
    }

    function test_eachDirectedPairHasSafeReferencePool() public view {
        assertTrue(
            scenario.registry.getReferencePool(address(scenario.tokens.usdc), address(scenario.tokens.good))
                != address(0)
        );
        assertTrue(
            scenario.registry.getReferencePool(address(scenario.tokens.good), address(scenario.tokens.bad))
                != address(0)
        );
    }

    function test_usdcGoodSafe_lowImpact() public view {
        uint256 impact = _impactForRoute("route-usdc-good-safe");
        assertLt(impact, 100);
    }

    function test_usdcGoodShallow_highImpact() public view {
        uint256 impact = _impactForRoute("route-usdc-good-shallow");
        assertGt(impact, 1000);
    }

    function test_usdcGoodSda_nearSafeQuote() public view {
        uint256 safeOut = _quoteForRoute("route-usdc-good-safe");
        uint256 sdaOut = _quoteForRoute("route-usdc-good-sda");
        assertApproxEqRel(sdaOut, safeOut, 0.01e18);
    }

    function test_usdcGoodSda_lowImpact() public view {
        uint256 impact = _impactForRoute("route-usdc-good-sda");
        assertLt(impact, 100);
    }

    function test_usdcGoodOrdering_toxic_gt_safe_gt_shallow() public view {
        _assertPoolPattern("route-usdc-good-safe", "route-usdc-good-shallow", "route-usdc-good-toxic");
    }

    function test_goodBadOrdering_toxic_gt_safe_gt_shallow() public view {
        _assertPoolPattern("route-good-bad-safe", "route-good-bad-shallow", "route-good-bad-toxic");
    }

    function test_tokenRiskTags() public view {
        assertEq(
            uint256(scenario.registry.tokenRiskTag(address(scenario.tokens.usdc))),
            uint256(DemoPoolRegistry.TokenRiskTag.NONE)
        );
        assertEq(
            uint256(scenario.registry.tokenRiskTag(address(scenario.tokens.bad))),
            uint256(DemoPoolRegistry.TokenRiskTag.HIGH)
        );
        assertEq(
            uint256(scenario.registry.tokenRiskTag(address(scenario.tokens.bait))),
            uint256(DemoPoolRegistry.TokenRiskTag.BAIT)
        );
    }

    function _assertPoolPattern(string memory safeRoute, string memory shallowRoute, string memory toxicRoute)
        private
        view
    {
        uint256 safeOut = _quoteForRoute(safeRoute);
        uint256 shallowOut = _quoteForRoute(shallowRoute);
        uint256 toxicOut = _quoteForRoute(toxicRoute);
        assertGt(toxicOut, safeOut);
        assertGt(safeOut, shallowOut);
    }

    function _quoteForRoute(string memory routeName) private view returns (uint256) {
        DemoPoolRegistry.PoolEntry memory entry = _findRoute(routeName);
        return _quoteEntry(entry, _amountInForRoute(routeName));
    }

    function _impactForRoute(string memory routeName) private view returns (uint256) {
        DemoPoolRegistry.PoolEntry memory entry = _findRoute(routeName);
        return _impactEntry(entry, _amountInForRoute(routeName));
    }

    function _amountInForRoute(string memory routeName) private pure returns (uint256) {
        if (_startsWith(routeName, "route-usdc-")) return QUOTE_USDC;
        if (_startsWith(routeName, "route-good-")) return QUOTE_TOKEN;
        if (_startsWith(routeName, "route-bad-")) return QUOTE_TOKEN;
        if (_startsWith(routeName, "route-bait-")) return QUOTE_TOKEN;
        revert("unknown route prefix");
    }

    function _startsWith(string memory s, string memory prefix) private pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; i++) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }

    function _findRoute(string memory routeName) private view returns (DemoPoolRegistry.PoolEntry memory found) {
        bytes32 id = deployer.routeId(routeName);
        DemoPoolRegistry.PoolEntry[] memory pools = scenario.registry.getAllPools();
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i].routeId == id) return pools[i];
        }
        revert("route not found");
    }

    function _quoteEntry(DemoPoolRegistry.PoolEntry memory entry, uint256 amountIn)
        private
        view
        returns (uint256)
    {
        IDemoPair pair = IDemoPair(entry.pair);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, pair.token0(), entry.tokenIn);
        return UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function _impactEntry(DemoPoolRegistry.PoolEntry memory entry, uint256 amountIn)
        private
        view
        returns (uint256)
    {
        IDemoPair pair = IDemoPair(entry.pair);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, pair.token0(), entry.tokenIn);
        return UniswapV2Quote.getPriceImpactBps(amountIn, reserveIn, reserveOut);
    }
}

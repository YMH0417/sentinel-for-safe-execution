// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPair} from "../src/dex/DemoPair.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";

contract DemoTokenSupplyTest is Test {
    address internal constant TEST_USER = 0x881915BE66Be800Cc180b6244809A1D188Bc1b2c;
    address internal other = address(0xCAFE);

    DemoScenarioDeployer internal scenarioDeployer;
    DemoScenarioDeployer.Scenario internal scenario;

    function setUp() public {
        scenarioDeployer = new DemoScenarioDeployer();
        scenario = scenarioDeployer.deploy();
        scenarioDeployer.authorizeMinter(TEST_USER, true);
    }

    function test_mintToken_toSelf_byAuthorizedMinter() public {
        vm.prank(TEST_USER);
        scenarioDeployer.mintToken(address(scenario.tokens.usdc), TEST_USER, 1_000 * 1e6);
        assertEq(scenario.tokens.usdc.balanceOf(TEST_USER), 1_000 * 1e6);
    }

    function test_mintToken_revertsForThirdPartyRecipient() public {
        vm.prank(TEST_USER);
        vm.expectRevert(DemoScenarioDeployer.UnauthorizedMinter.selector);
        scenarioDeployer.mintToken(address(scenario.tokens.usdc), other, 1_000 * 1e6);
    }

    function test_mintToken_revertsForUnauthorized() public {
        vm.prank(other);
        vm.expectRevert(DemoScenarioDeployer.UnauthorizedMinter.selector);
        scenarioDeployer.mintToken(address(scenario.tokens.good), other, 1 ether);
    }

    function test_mintTokenToPool_increasesReserve() public {
        DemoPoolRegistry.PoolEntry memory pool = scenario.registry.getPoolByRouteId(
            scenarioDeployer.routeId("route-usdc-good-safe")
        );
        DemoPair pair = DemoPair(pool.pair);
        (uint112 r0Before, uint112 r1Before,) = pair.getReserves();
        address usdc = address(scenario.tokens.usdc);
        bool usdcIsToken0 = pair.token0() == usdc;

        vm.prank(TEST_USER);
        scenarioDeployer.mintTokenToPool(usdc, pool.pair, 1_000 * 1e6);

        (uint112 r0After, uint112 r1After,) = pair.getReserves();
        if (usdcIsToken0) {
            assertEq(r0After, r0Before + uint112(1_000 * 1e6));
            assertEq(r1After, r1Before);
        } else {
            assertEq(r1After, r1Before + uint112(1_000 * 1e6));
            assertEq(r0After, r0Before);
        }
    }

    function test_burnTokenFromPool_reducesReserveAndSupply() public {
        DemoPoolRegistry.PoolEntry memory pool = scenario.registry.getPoolByRouteId(
            scenarioDeployer.routeId("route-usdc-good-safe")
        );
        DemoPair pair = DemoPair(pool.pair);
        address usdc = address(scenario.tokens.usdc);
        bool usdcIsToken0 = pair.token0() == usdc;
        (uint112 r0Before, uint112 r1Before,) = pair.getReserves();
        uint256 supplyBefore = scenario.tokens.usdc.totalSupply();

        vm.prank(TEST_USER);
        scenarioDeployer.burnTokenFromPool(usdc, pool.pair, 500 * 1e6);

        (uint112 r0After, uint112 r1After,) = pair.getReserves();
        if (usdcIsToken0) {
            assertEq(r0After, r0Before - uint112(500 * 1e6));
            assertEq(r1After, r1Before);
        } else {
            assertEq(r1After, r1Before - uint112(500 * 1e6));
            assertEq(r0After, r0Before);
        }
        assertEq(scenario.tokens.usdc.totalSupply(), supplyBefore - 500 * 1e6);
    }

    function test_authorizeMinter_onlyBootstrapOwner() public {
        vm.prank(other);
        vm.expectRevert(DemoScenarioDeployer.UnauthorizedFunder.selector);
        scenarioDeployer.authorizeMinter(other, true);
    }
}

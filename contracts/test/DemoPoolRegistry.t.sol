// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";

contract DemoPoolRegistryTest is Test {
    address internal deployer = address(this);
    DemoPoolRegistry internal registry;

    function setUp() public {
        registry = new DemoPoolRegistry(deployer);
    }

    function test_registerAndSeal() public {
        address good = address(0x1001);
        address bad = address(0x1002);
        address bait = address(0x1003);
        address usdc = address(0x1004);

        registry.registerToken(usdc, "USDC", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(good, "GOOD", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(bad, "BAD", DemoPoolRegistry.TokenRiskTag.HIGH);
        registry.registerToken(bait, "BAIT", DemoPoolRegistry.TokenRiskTag.BAIT);

        address[4] memory tokens = [usdc, good, bad, bait];
        uint256 index;
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < 4; j++) {
                if (i == j) continue;
                for (uint256 p = 0; p < 4; p++) {
                    registry.registerPool(
                        keccak256(abi.encodePacked("route", index)),
                        address(uint160(0x2000 + index)),
                        tokens[i],
                        tokens[j],
                        DemoPoolRegistry.PoolLabel(p)
                    );
                    index++;
                }
            }
        }

        registry.seal();
        assertTrue(registry.isSealed());
        assertEq(registry.poolCount(), 48);
        assertEq(registry.getReferencePool(usdc, good), address(0x2000));
        assertEq(uint256(registry.tokenRiskTag(bad)), uint256(DemoPoolRegistry.TokenRiskTag.HIGH));
    }

    function test_getPoolsByTokenOut() public {
        address good = address(0x1001);
        address usdc = address(0x1004);
        registry.registerToken(good, "GOOD", DemoPoolRegistry.TokenRiskTag.NONE);

        registry.registerPool(keccak256("a"), address(0xA1), usdc, good, DemoPoolRegistry.PoolLabel.SAFE);
        registry.registerPool(keccak256("b"), address(0xA2), usdc, good, DemoPoolRegistry.PoolLabel.SHALLOW);
        registry.registerPool(keccak256("c"), address(0xA3), usdc, good, DemoPoolRegistry.PoolLabel.TOXIC);

        registry.registerPool(keccak256("d"), address(0xA4), usdc, good, DemoPoolRegistry.PoolLabel.SDA);

        for (uint256 i = 0; i < 44; i++) {
            registry.registerPool(
                keccak256(abi.encodePacked("x", i)),
                address(uint160(0xB0 + i)),
                usdc,
                address(uint160(0x2000 + i)),
                DemoPoolRegistry.PoolLabel.SAFE
            );
        }

        registry.seal();
        DemoPoolRegistry.PoolEntry[] memory goodPools = registry.getPoolsByTokenOut(good);
        assertEq(goodPools.length, 4);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SentinelAchievements} from "../src/achievements/SentinelAchievements.sol";
import {MockUSDC} from "../src/tokens/MockUSDC.sol";

contract SentinelAchievementsTest is Test {
    SentinelAchievements internal achievements;
    MockUSDC internal usdc;
    address internal reporter = address(0xBEEF);
    address internal user = address(0xCAFE);

    function setUp() public {
        usdc = new MockUSDC(address(this));
        achievements = new SentinelAchievements(address(usdc), address(this));
        achievements.setReporter(reporter, true);
    }

    function test_firstSwapBadgeRequiresCheckAndSwap() public {
        vm.startPrank(reporter);
        achievements.recordSafeSwap(user, address(usdc), 100e6);
        vm.stopPrank();
        assertEq(achievements.badgeFlagsOf(user), 0);

        vm.prank(reporter);
        achievements.recordCheck(user);
        assertEq(achievements.badgeFlagsOf(user), uint8(1));
    }

    function test_volumeAndCheckTiers() public {
        vm.startPrank(reporter);
        for (uint256 i = 0; i < 10; i++) {
            achievements.recordCheck(user);
        }
        achievements.recordSafeSwap(user, address(usdc), 1_000_000e6);
        vm.stopPrank();

        uint8 flags = achievements.badgeFlagsOf(user);
        assertTrue(flags & uint8(1) != 0);
        assertTrue(flags & uint8(2) != 0);
        assertTrue(flags & uint8(4) != 0);
        assertTrue(flags & uint8(8) != 0);
        assertTrue(flags & uint8(16) != 0);
    }

    function test_nonUsdcSwapDoesNotIncreaseVolume() public {
        address good = makeAddr("good");
        vm.startPrank(reporter);
        for (uint256 i = 0; i < 3; i++) {
            achievements.recordCheck(user);
        }
        achievements.recordSafeSwap(user, good, 100_000 ether);
        vm.stopPrank();

        (uint128 volume,,,) = achievements.stats(user);
        assertEq(volume, 0);
    }
}

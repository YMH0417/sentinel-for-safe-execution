// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SentinelLedger} from "../src/ledger/SentinelLedger.sol";
import {ISentinelLedger} from "../src/ledger/ISentinelLedger.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";

contract SentinelLedgerTest is Test {
    SentinelLedger internal ledger;
    DemoERC20 internal usdc;
    address internal reporter;
    address internal user;

    function setUp() public {
        user = makeAddr("user");
        reporter = makeAddr("reporter");
        usdc = new DemoERC20("USDC", "USDC", 6, address(this));
        ledger = new SentinelLedger(address(usdc), address(this));
        ledger.setReporter(reporter, true);
    }

    function testRecordTradeUnlocksFirstBadge() public {
        vm.prank(reporter);
        ledger.recordTrade(user, bytes32(uint256(1)), ISentinelLedger.ExecutionMode.Force, 0, address(usdc), 100e6, 95e6);

        assertEq(ledger.badgeFlagsOf(user), uint8(1));
        (uint128 volume,, uint64 tradeCount, uint64 safeCount,) = ledger.stats(user);
        assertEq(volume, uint128(100e6));
        assertEq(tradeCount, 1);
        assertEq(safeCount, 0);
    }

    function testRecordCheckIsLegacyNoOpForCheckCount() public {
        vm.prank(reporter);
        ledger.recordCheck(user);
        (,,, uint64 safeCount, uint8 flags) = ledger.stats(user);
        assertEq(safeCount, 0);
        assertEq(flags, 0);
    }

    function testSafeTradeIncrementsCheckCount() public {
        vm.prank(reporter);
        ledger.recordTrade(
            user,
            bytes32(uint256(2)),
            ISentinelLedger.ExecutionMode.Safe,
            0,
            address(usdc),
            10_000e6,
            9_900e6
        );
        (uint128 volume, uint64 checks, uint64 tradeCount, uint64 safeCount,) = ledger.stats(user);
        assertEq(checks, 1);
        assertEq(tradeCount, 1);
        assertEq(safeCount, 1);
        assertEq(volume, uint128(10_000e6));
    }

    function testDashboardSnapshotUpdatesOnTrade() public {
        ledger.seedPoolHealth(36, 48);
        vm.prank(reporter);
        ledger.recordTrade(
            user,
            bytes32(uint256(3)),
            ISentinelLedger.ExecutionMode.Force,
            1,
            address(usdc),
            50e6,
            0
        );

        (
            uint64 tradeCount,
            uint16 abnormalPools,
            uint16 poolCount,
            uint128 safeVolume,
            uint64 safeSwaps,
            uint128 shallowVolume,
            uint64 shallowSwaps,
            ,
            ,
            ,
            
        ) = ledger.dashboardSnapshot();

        assertEq(tradeCount, 1);
        assertEq(abnormalPools, 36);
        assertEq(poolCount, 48);
        assertEq(safeVolume, 0);
        assertEq(safeSwaps, 0);
        assertEq(shallowVolume, uint128(50e6));
        assertEq(shallowSwaps, 1);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SentinelLedger} from "../src/ledger/SentinelLedger.sol";
import {ISentinelLedger} from "../src/ledger/ISentinelLedger.sol";

/// @notice Seed Anvil SentinelLedger: user badges + dashboard label volumes + pool health.
contract SeedAnvilLedger is Script {
    uint256 internal constant ANVIL_DEFAULT_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    address internal constant DEFAULT_TEST_USER = 0x881915BE66Be800Cc180b6244809A1D188Bc1b2c;

    function run() external {
        uint256 chainId = block.chainid;
        bool allowRemote = vm.envOr("ALLOW_SEED_ON_REMOTE", false);
        if (chainId != 31337 && !allowRemote) {
            revert("SeedAnvilLedger: local Anvil only (set ALLOW_SEED_ON_REMOTE=true to override)");
        }

        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", ANVIL_DEFAULT_KEY);
        address deployer = vm.addr(deployerPrivateKey);
        address ledgerAddr = vm.envAddress("DEMO_LEDGER_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address user = vm.envOr("TEST_USER_ADDRESS", DEFAULT_TEST_USER);

        SentinelLedger ledger = SentinelLedger(ledgerAddr);

        vm.startBroadcast(deployerPrivateKey);
        ledger.setReporter(deployer, true);

        // SAFE — 8 checked router trades
        for (uint64 i = 0; i < 8; i++) {
            ledger.recordTrade(
                user,
                bytes32(uint256(i + 1)),
                ISentinelLedger.ExecutionMode.Safe,
                0,
                usdc,
                100 * 1e6,
                0
            );
        }
        // SHALLOW — 3 force trades
        for (uint64 i = 0; i < 3; i++) {
            ledger.recordTrade(
                user,
                bytes32(uint256(0x10 + i)),
                ISentinelLedger.ExecutionMode.Force,
                1,
                usdc,
                50 * 1e6,
                0
            );
        }
        // TOXIC — 2 trades
        for (uint64 i = 0; i < 2; i++) {
            ledger.recordTrade(
                user,
                bytes32(uint256(0x20 + i)),
                ISentinelLedger.ExecutionMode.Force,
                2,
                usdc,
                30 * 1e6,
                0
            );
        }
        // SDA — 1 trade
        ledger.recordTrade(
            user,
            bytes32(uint256(0x30)),
            ISentinelLedger.ExecutionMode.Sda,
            3,
            usdc,
            25 * 1e6,
            0
        );

        // Demo pool health: 36 degraded/empty of 48 pools (75%)
        ledger.seedPoolHealth(36, 48);

        vm.stopBroadcast();

        (
            uint64 tradeCount,
            uint16 abnormalPools,
            uint16 poolCount,
            uint128 safeVolume,
            uint64 safeSwaps,
            ,
            ,
            ,
            ,
            ,
            
        ) = ledger.dashboardSnapshot();
        console2.log("Seeded SentinelLedger dashboard for", user);
        console2.log("  globalTradeCount:", tradeCount);
        console2.log("  abnormal/total pools:", abnormalPools, poolCount);
        console2.log("  SAFE volume/swaps:", safeVolume, safeSwaps);
    }
}

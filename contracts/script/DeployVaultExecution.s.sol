// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultExecution} from "../src/VaultExecution.sol";

/**
 * @notice 部署脚本 — 本地 anvil 链上部署 VaultExecution 合约
 */
contract DeployVaultExecution is Script {
    // Week 3 默认 maxLossBps = 100 (1%)
    uint256 public constant DEFAULT_MAX_LOSS_BPS = 100;

    function run() external returns (address) {
        vm.startBroadcast();

        VaultExecution vault = new VaultExecution(DEFAULT_MAX_LOSS_BPS);

        console.log("VaultExecution deployed at:", address(vault));
        console.log("Max loss bps:", vault.maxLossBps());
        console.log("Paused:", vault.paused());

        vm.stopBroadcast();

        return address(vault);
    }
}

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
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("VAULT_ADMIN", deployer);
        address agentSigner = vm.envAddress("AGENT_SIGNER");

        vm.startBroadcast(deployerPrivateKey);

        VaultExecution vault = new VaultExecution(
            DEFAULT_MAX_LOSS_BPS,
            admin,
            agentSigner
        );

        console.log("VaultExecution deployed at:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("Agent signer:", vault.agentSigner());
        console.log("Max loss bps:", vault.maxLossBps());
        console.log("Paused:", vault.paused());

        vm.stopBroadcast();

        return address(vault);
    }
}

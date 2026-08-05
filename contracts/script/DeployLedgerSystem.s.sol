// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2, stdJson} from "forge-std/Script.sol";
import {SentinelLedger} from "../src/ledger/SentinelLedger.sol";
import {DemoSwapRouter} from "../src/demo/DemoSwapRouter.sol";
import {VaultExecution} from "../src/VaultExecution.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";

/// @notice Deploy SentinelLedger + wired Vault/Router against an existing demo manifest (no pool redeploy).
contract DeployLedgerSystem is Script {
    uint256 internal constant DEFAULT_MAX_LOSS_BPS = 100;

    struct Manifest {
        uint256 chainId;
        address registry;
        address scenarioDeployer;
        address usdc;
        address agentSigner;
        address deployer;
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        string memory profile = _demoProfile();
        string memory manifestPath = _manifestPath(profile);
        Manifest memory manifest = _readManifest(manifestPath);

        console2.log("Using manifest:", manifestPath);
        console2.log("Registry:", manifest.registry);
        console2.log("USDC:", manifest.usdc);

        vm.startBroadcast(deployerPrivateKey);

        SentinelLedger ledger = new SentinelLedger(manifest.usdc, deployer);
        VaultExecution vault = new VaultExecution(DEFAULT_MAX_LOSS_BPS, deployer, manifest.agentSigner);
        vault.setAchievements(address(ledger));

        DemoSwapRouter router = new DemoSwapRouter(
            address(vault), manifest.registry, manifest.scenarioDeployer, address(ledger)
        );

        ledger.setReporter(address(vault), true);
        ledger.setReporter(address(router), true);
        ledger.setReporter(deployer, true);

        DemoScenarioDeployer(manifest.scenarioDeployer).authorizeFunder(address(router), true);

        vm.stopBroadcast();

        _writePatch(ledger, vault, router);

        console2.log("=== Ledger system deployed ===");
        console2.log("SentinelLedger:", address(ledger));
        console2.log("VaultExecution:", address(vault));
        console2.log("DemoSwapRouter:", address(router));
    }

    function _readManifest(string memory path) private view returns (Manifest memory manifest) {
        string memory json = vm.readFile(path);
        manifest.chainId = stdJson.readUint(json, ".chainId");
        manifest.registry = stdJson.readAddress(json, ".registry");
        manifest.scenarioDeployer = stdJson.readAddress(json, ".scenarioDeployer");
        manifest.usdc = stdJson.readAddress(json, ".tokens.USDC");
        manifest.agentSigner = stdJson.readAddress(json, ".agentSigner");
        manifest.deployer = stdJson.readAddress(json, ".deployer");
    }

    function _writePatch(SentinelLedger ledger, VaultExecution vault, DemoSwapRouter router) private {
        string memory profile = _demoProfile();
        string memory patchPath;
        if (keccak256(bytes(profile)) == keccak256("monad-testnet")) {
            patchPath = "deployments/monad-10143-ledger-patch.json";
        } else if (keccak256(bytes(profile)) == keccak256("anvil-fork-monad")) {
            patchPath = "deployments/local-10143-ledger-patch.json";
        } else {
            patchPath = "deployments/local-31337-ledger-patch.json";
        }
        string memory patch = string.concat(
            "{\n",
            '  "ledger": "',
            vm.toString(address(ledger)),
            '",\n',
            '  "vaultExecution": "',
            vm.toString(address(vault)),
            '",\n',
            '  "swapRouter": "',
            vm.toString(address(router)),
            '"\n',
            "}\n"
        );
        vm.writeFile(patchPath, patch);
        console2.log("Wrote patch file:", patchPath);
    }

    function _demoProfile() private view returns (string memory) {
        try vm.envString("DEMO_PROFILE") returns (string memory profile) {
            return profile;
        } catch {
            return "anvil-local";
        }
    }

    function _manifestPath(string memory profile) private pure returns (string memory) {
        if (keccak256(bytes(profile)) == keccak256("monad-testnet")) {
            return "deployments/monad-10143-demo.json";
        }
        if (keccak256(bytes(profile)) == keccak256("anvil-fork-monad")) {
            return "deployments/local-10143-demo.json";
        }
        return "deployments/local-31337-demo.json";
    }
}

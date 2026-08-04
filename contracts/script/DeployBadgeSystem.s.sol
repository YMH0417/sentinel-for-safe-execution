// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2, stdJson} from "forge-std/Script.sol";
import {SentinelAchievements} from "../src/achievements/SentinelAchievements.sol";
import {DemoSwapRouter} from "../src/demo/DemoSwapRouter.sol";
import {VaultExecution} from "../src/VaultExecution.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";

/// @notice Deploy achievements + wired Vault/Router against an existing demo manifest (no pool redeploy).
contract DeployBadgeSystem is Script {
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

        SentinelAchievements achievements = new SentinelAchievements(manifest.usdc, deployer);
        VaultExecution vault = new VaultExecution(DEFAULT_MAX_LOSS_BPS, deployer, manifest.agentSigner);
        vault.setAchievements(address(achievements));

        DemoSwapRouter router = new DemoSwapRouter(
            address(vault), manifest.registry, manifest.scenarioDeployer, address(achievements)
        );

        achievements.setReporter(address(vault), true);
        achievements.setReporter(address(router), true);

        DemoScenarioDeployer(manifest.scenarioDeployer).authorizeFunder(address(router), true);

        vm.stopBroadcast();

        _writePatch(achievements, vault, router);

        console2.log("=== Badge system deployed ===");
        console2.log("SentinelAchievements:", address(achievements));
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

    function _writePatch(
        SentinelAchievements achievements,
        VaultExecution vault,
        DemoSwapRouter router
    ) private {
        string memory profile = _demoProfile();
        string memory patchPath = keccak256(bytes(profile)) == keccak256("monad-testnet")
            ? "deployments/monad-10143-badge-patch.json"
            : "deployments/local-badge-patch.json";
        string memory patch = string.concat(
            "{\n",
            '  "achievements": "',
            vm.toString(address(achievements)),
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
            return "monad-testnet";
        }
    }

    function _manifestPath(string memory profile) private pure returns (string memory) {
        if (keccak256(bytes(profile)) == keccak256("monad-testnet")) {
            return "deployments/monad-10143-demo.json";
        }
        return "deployments/local-31337-demo.json";
    }
}

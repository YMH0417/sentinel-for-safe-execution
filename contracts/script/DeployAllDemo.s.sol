// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoSwapRouter} from "../src/demo/DemoSwapRouter.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";
import {IDemoPair} from "../src/dex/interfaces/IDemoPair.sol";
import {VaultExecution} from "../src/VaultExecution.sol";
import {SentinelLedger} from "../src/ledger/SentinelLedger.sol";

/// @notice Deploy demo scenario in Monad-safe batches (≤30M gas per transaction).
contract DeployAllDemo is Script {
    uint256 internal constant QUOTE_AMOUNT_USDC = 100 * 1e6;
    uint256 internal constant DEFAULT_MAX_LOSS_BPS = 100;
    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;

    uint256 internal constant ANVIL_DEFAULT_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    address internal constant DEFAULT_TEST_USER = 0x881915BE66Be800Cc180b6244809A1D188Bc1b2c;

    uint256 internal constant TEST_USER_USDC = 100_000 * 1e6;
    uint256 internal constant TEST_USER_TOKEN = 10_000 ether;
    uint256 internal constant TEST_USER_NATIVE = 10 ether;

    struct DeploymentArtifacts {
        DemoScenarioDeployer.Scenario scenario;
        address vaultExecution;
        address swapRouter;
        address ledger;
        address scenarioDeployer;
        address deployer;
        uint256 chainId;
    }

    function run() external returns (DeploymentArtifacts memory artifacts) {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", ANVIL_DEFAULT_KEY);
        address deployer = vm.addr(deployerPrivateKey);
        address agentSigner = vm.envOr("AGENT_SIGNER", deployer);

        vm.startBroadcast(deployerPrivateKey);

        DemoScenarioDeployer scenarioDeployer = new DemoScenarioDeployer();
        artifacts.scenarioDeployer = address(scenarioDeployer);
        artifacts.scenario = _deployScenarioPhased(scenarioDeployer);
        artifacts.deployer = deployer;
        artifacts.chainId = block.chainid;

        VaultExecution vault = new VaultExecution(DEFAULT_MAX_LOSS_BPS, deployer, agentSigner);
        artifacts.vaultExecution = address(vault);

        SentinelLedger ledger = new SentinelLedger(
            address(artifacts.scenario.tokens.usdc), deployer
        );

        DemoSwapRouter router = new DemoSwapRouter(
            address(vault), address(artifacts.scenario.registry), address(scenarioDeployer), address(ledger)
        );
        artifacts.swapRouter = address(router);
        artifacts.ledger = address(ledger);
        vault.setAchievements(address(ledger));
        ledger.setReporter(address(vault), true);
        ledger.setReporter(address(router), true);
        scenarioDeployer.authorizeFunder(address(router), true);
        scenarioDeployer.authorizeFunder(deployer, true);

        address testUser = vm.envOr("TEST_USER_ADDRESS", DEFAULT_TEST_USER);
        scenarioDeployer.authorizeMinter(testUser, true);
        _fundTestUser(scenarioDeployer, artifacts.scenario, testUser);

        vm.stopBroadcast();

        _writeDeploymentJson(artifacts, agentSigner);
        _logSummary(artifacts);
    }

    /// @dev Each external call becomes its own broadcast transaction (Monad 30M gas cap safe).
    function _deployScenarioPhased(DemoScenarioDeployer scenarioDeployer)
        private
        returns (DemoScenarioDeployer.Scenario memory scenario)
    {
        console2.log("Phase 1/3: beginScenario (tokens + registry)");
        scenarioDeployer.beginScenario();

        uint256 batchSize = scenarioDeployer.POOLS_PER_BATCH();
        uint256 batches = scenarioDeployer.expectedPoolBatches();
        for (uint256 i = 0; i < batches; i++) {
            console2.log("Phase 2/3: deployPoolBatch", i + 1, "/", batches);
            uint256 deployed = scenarioDeployer.deployPoolBatch(batchSize);
            console2.log("  pools deployed in tx:", deployed);
            console2.log("  cumulative pools:", scenarioDeployer.poolsDeployed());
        }

        console2.log("Phase 3/3: sealScenario");
        scenarioDeployer.sealScenario();
        scenario = scenarioDeployer.getScenario();
    }

    function _fundTestUser(
        DemoScenarioDeployer scenarioDeployer,
        DemoScenarioDeployer.Scenario memory scenario,
        address testUser
    ) private {
        if (testUser == address(0)) return;

        scenarioDeployer.fundSwapper(address(scenario.tokens.usdc), testUser, TEST_USER_USDC);
        scenarioDeployer.fundSwapper(address(scenario.tokens.good), testUser, TEST_USER_TOKEN);
        scenarioDeployer.fundSwapper(address(scenario.tokens.bad), testUser, TEST_USER_TOKEN);
        scenarioDeployer.fundSwapper(address(scenario.tokens.bait), testUser, TEST_USER_TOKEN);

        (bool sent,) = testUser.call{value: TEST_USER_NATIVE}("");
        require(sent, "test user native transfer failed");

        console2.log("Funded test user:", testUser);
        console2.log("  Native:", TEST_USER_NATIVE);
        console2.log("  USDC:", TEST_USER_USDC);
        console2.log("  GOOD/BAD/BAIT:", TEST_USER_TOKEN);
    }

    function _demoProfile() private view returns (string memory) {
        try vm.envString("DEMO_PROFILE") returns (string memory profile) {
            return profile;
        } catch {
            return "anvil-local";
        }
    }

    function _stringsEqual(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _deploymentManifestName(uint256 chainId) private view returns (string memory) {
        if (_stringsEqual(_demoProfile(), "monad-testnet")) {
            return "monad-10143-demo.json";
        }
        return string.concat("local-", vm.toString(chainId), "-demo.json");
    }

    function _networkLabel(uint256 /* chainId */) private view returns (string memory) {
        string memory profile = _demoProfile();
        if (_stringsEqual(profile, "monad-testnet")) return "monad-testnet";
        if (_stringsEqual(profile, "anvil-fork-monad")) return "anvil-fork-monad";
        return "anvil-local";
    }

    function _deploymentTarget(uint256 /* chainId */) private view returns (string memory) {
        if (_stringsEqual(_demoProfile(), "monad-testnet")) {
            return "remote";
        }
        return "local";
    }

    function _writeDeploymentJson(DeploymentArtifacts memory artifacts, address agentSigner) private {
        DemoScenarioDeployer.Scenario memory scenario = artifacts.scenario;
        string memory path = string.concat(
            "deployments/",
            _deploymentManifestName(artifacts.chainId)
        );
        vm.writeFile(path, string.concat(_manifestJsonHead(artifacts, agentSigner, scenario), _manifestJsonTail(scenario)));
        console2.log("Wrote deployment manifest:", path);
    }

    function _manifestJsonHead(
        DeploymentArtifacts memory artifacts,
        address agentSigner,
        DemoScenarioDeployer.Scenario memory scenario
    ) private view returns (string memory) {
        return string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(artifacts.chainId),
            ",\n",
            '  "network": "',
            _networkLabel(artifacts.chainId),
            '",\n',
            '  "deploymentTarget": "',
            _deploymentTarget(artifacts.chainId),
            '",\n',
            '  "profile": "',
            _demoProfile(),
            '",\n',
            '  "deployer": "',
            vm.toString(artifacts.deployer),
            '",\n',
            '  "agentSigner": "',
            vm.toString(agentSigner),
            '",\n',
            '  "registry": "',
            vm.toString(address(scenario.registry)),
            '",\n',
            '  "vaultExecution": "',
            vm.toString(artifacts.vaultExecution),
            '",\n',
            '  "swapRouter": "',
            vm.toString(artifacts.swapRouter),
            '",\n',
            '  "ledger": "',
            vm.toString(artifacts.ledger),
            '",\n',
            '  "achievements": null,\n',
            '  "scenarioDeployer": "',
            vm.toString(artifacts.scenarioDeployer),
            '",\n',
            '  "testUser": "',
            vm.toString(vm.envOr("TEST_USER_ADDRESS", DEFAULT_TEST_USER)),
            '",\n',
            '  "deploymentMode": "initial",\n',
            '  "poolsPerBatch": 12,\n',
            '  "tokens": {\n'
        );
    }

    function _manifestJsonTail(DemoScenarioDeployer.Scenario memory scenario) private view returns (string memory) {
        return string.concat(
            '    "USDC": "',
            vm.toString(address(scenario.tokens.usdc)),
            '",\n',
            '    "GOOD": "',
            vm.toString(address(scenario.tokens.good)),
            '",\n',
            '    "BAD": "',
            vm.toString(address(scenario.tokens.bad)),
            '",\n',
            '    "BAIT": "',
            vm.toString(address(scenario.tokens.bait)),
            '"',
            "\n  },\n",
            '  "pools": []\n',
            "}\n"
        );
    }

    function _logSummary(DeploymentArtifacts memory artifacts) private view {
        DemoScenarioDeployer.Scenario memory scenario = artifacts.scenario;
        console2.log("=== Demo Scenario Deployed (phased) ===");
        console2.log("Deployer:", artifacts.deployer);
        console2.log("Chain ID:", artifacts.chainId);
        console2.log("USDC:", address(scenario.tokens.usdc));
        console2.log("GOOD:", address(scenario.tokens.good));
        console2.log("BAD:", address(scenario.tokens.bad));
        console2.log("BAIT:", address(scenario.tokens.bait));
        console2.log("Registry:", address(scenario.registry));
        console2.log("VaultExecution:", artifacts.vaultExecution);
        console2.log("DemoSwapRouter:", artifacts.swapRouter);
        console2.log("SentinelLedger:", artifacts.ledger);
        console2.log("ScenarioDeployer:", artifacts.scenarioDeployer);
        console2.log("Pool count:", scenario.registry.poolCount());

        for (uint256 i = 0; i < scenario.registry.poolCount(); i++) {
            _logRouteQuote(artifacts, i);
        }
    }

    function _logRouteQuote(DeploymentArtifacts memory artifacts, uint256 index) private view {
        DemoScenarioDeployer.Scenario memory scenario = artifacts.scenario;
        DemoPoolRegistry.PoolEntry[] memory pools = scenario.registry.getAllPools();
        DemoPoolRegistry.PoolEntry memory entry = pools[index];
        IDemoPair pair = IDemoPair(entry.pair);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, pair.token0(), entry.tokenIn);
        uint256 amountIn = entry.tokenIn == address(scenario.tokens.usdc) ? QUOTE_AMOUNT_USDC : 100 ether;
        uint256 amountOut = UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 impact = UniswapV2Quote.getPriceImpactBps(amountIn, reserveIn, reserveOut);

        console2.log("---");
        console2.log("Pool index:", index);
        console2.log("Pair:", entry.pair);
        console2.log("QuotedOut (100 USDC):", amountOut);
        console2.log("Impact bps:", impact);
    }
}

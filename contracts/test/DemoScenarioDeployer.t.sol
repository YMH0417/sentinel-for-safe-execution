// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";

contract DemoScenarioDeployerTest is Test {
    DemoScenarioDeployer internal scenarioDeployer;

    function setUp() public {
        scenarioDeployer = new DemoScenarioDeployer();
    }

    function test_phasedDeploy_produces48SealedPools() public {
        scenarioDeployer.beginScenario();
        assertEq(scenarioDeployer.poolsRemaining(), 48);

        uint256 batches = scenarioDeployer.expectedPoolBatches();
        assertEq(batches, 4);

        for (uint256 i = 0; i < batches; i++) {
            uint256 deployed = scenarioDeployer.deployPoolBatch(scenarioDeployer.POOLS_PER_BATCH());
            assertEq(deployed, scenarioDeployer.POOLS_PER_BATCH());
        }

        assertEq(scenarioDeployer.poolsDeployed(), 48);
        assertEq(scenarioDeployer.poolsRemaining(), 0);

        scenarioDeployer.sealScenario();
        DemoScenarioDeployer.Scenario memory scenario = scenarioDeployer.getScenario();

        assertEq(scenario.registry.poolCount(), 48);
        assertTrue(scenario.registry.isSealed());
    }

    function test_deploy_matchesPhasedSteps() public {
        DemoScenarioDeployer.Scenario memory scenario = scenarioDeployer.deploy();
        assertEq(scenario.registry.poolCount(), 48);
        assertTrue(scenario.registry.isSealed());
        assertTrue(scenarioDeployer.scenarioSealed());
    }

    function test_deployPoolBatch_revertsWhenNotBegun() public {
        vm.expectRevert(DemoScenarioDeployer.ScenarioNotBegun.selector);
        scenarioDeployer.deployPoolBatch(12);
    }

    function test_sealScenario_revertsWhenIncomplete() public {
        scenarioDeployer.beginScenario();
        vm.expectRevert(DemoScenarioDeployer.PoolsIncomplete.selector);
        scenarioDeployer.sealScenario();
    }

    function test_phasedDeploy_gasPerBatch_underMonadCap() public {
        scenarioDeployer.beginScenario();
        uint256 gasBefore = gasleft();
        scenarioDeployer.deployPoolBatch(scenarioDeployer.POOLS_PER_BATCH());
        uint256 gasUsed = gasBefore - gasleft();
        assertLt(gasUsed, scenarioDeployer.MONAD_MAX_TX_GAS());
    }
}

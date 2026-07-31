// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoScenarioDeployer} from "../src/demo/DemoScenarioDeployer.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";
import {IDemoPair} from "../src/dex/interfaces/IDemoPair.sol";

/// @notice Deploy demo matrix and print 3 quote tables (SAFE / SHALLOW / TOXIC), 12 rows each.
contract GenerateQuoteTables is Script {
    uint256 internal constant QUOTE_HUMAN = 100;

    string[4] internal symbols = ["USDC", "GOOD", "BAD", "BAIT"];
    string[4] internal keys = ["usdc", "good", "bad", "bait"];
    uint8[4] internal decimals = [6, 18, 18, 18];
    string[3] internal labelNames = ["SAFE", "SHALLOW", "TOXIC"];

    function run() external {
        DemoScenarioDeployer deployer = new DemoScenarioDeployer();
        DemoScenarioDeployer.Scenario memory scenario = deployer.deploy();

        console2.log("=== 4-Token Demo: 12 pairs x 4 pools = 48 routes ===");
        console2.log("Registry:", address(scenario.registry));
        console2.log("Quote amount: 100 units of tokenIn per row");
        console2.log("");

        for (uint256 label = 0; label < 3; label++) {
            _printTable(scenario, deployer, label);
        }
    }

    function _printTable(
        DemoScenarioDeployer.Scenario memory scenario,
        DemoScenarioDeployer deployer,
        uint256 label
    ) private view {
        console2.log("========================================");
        console2.log(string(abi.encodePacked("TABLE: ", labelNames[label], " POOL")));
        console2.log("========================================");
        console2.log("| # | tokenIn | tokenOut | routeId | amountIn | quotedOut | impactBps |");
        console2.log("|---|---------|----------|---------|----------|-----------|-----------|");

        uint256 row;
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < 4; j++) {
                if (i == j) continue;
                row++;
                string memory routeName = _routeName(keys[i], keys[j], label);
                bytes32 id = deployer.routeId(routeName);
                DemoPoolRegistry.PoolEntry memory entry = _findPool(scenario.registry, id);
                uint256 amountIn = QUOTE_HUMAN * (10 ** uint256(decimals[i]));
                (uint256 quotedOut, uint256 impact) = _quote(entry, amountIn);

                console2.log(
                    string(
                        abi.encodePacked(
                            "| ",
                            _u(row),
                            " | ",
                            symbols[i],
                            " | ",
                            symbols[j],
                            " | ",
                            routeName,
                            " | ",
                            _u(QUOTE_HUMAN),
                            " | ",
                            _formatOut(quotedOut, decimals[j]),
                            " | ",
                            _u(impact),
                            " |"
                        )
                    )
                );
            }
        }
        console2.log("");
    }

    function _findPool(DemoPoolRegistry registry, bytes32 id)
        private
        view
        returns (DemoPoolRegistry.PoolEntry memory found)
    {
        DemoPoolRegistry.PoolEntry[] memory pools = registry.getAllPools();
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i].routeId == id) return pools[i];
        }
        revert("pool not found");
    }

    function _quote(DemoPoolRegistry.PoolEntry memory entry, uint256 amountIn)
        private
        view
        returns (uint256 quotedOut, uint256 impactBps)
    {
        IDemoPair pair = IDemoPair(entry.pair);
        address token0 = pair.token0();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, token0, entry.tokenIn);
        quotedOut = UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
        impactBps = UniswapV2Quote.getPriceImpactBps(amountIn, reserveIn, reserveOut);
    }

    function _routeName(string memory tokenInKey, string memory tokenOutKey, uint256 label)
        private
        pure
        returns (string memory)
    {
        string memory labelKey = label == 0 ? "safe" : (label == 1 ? "shallow" : "toxic");
        return string(abi.encodePacked("route-", tokenInKey, "-", tokenOutKey, "-", labelKey));
    }

    function _formatOut(uint256 raw, uint8 decOut) private pure returns (string memory) {
        uint256 scale = 10 ** uint256(decOut);
        uint256 whole = raw / scale;
        uint256 frac = (raw % scale) / (scale / 10000);
        return string(abi.encodePacked(_u(whole), ".", _pad4(frac)));
    }

    function _pad4(uint256 value) private pure returns (string memory) {
        if (value >= 1000) return _u(value);
        if (value >= 100) return string(abi.encodePacked("0", _u(value)));
        if (value >= 10) return string(abi.encodePacked("00", _u(value)));
        return string(abi.encodePacked("000", _u(value)));
    }

    function _u(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

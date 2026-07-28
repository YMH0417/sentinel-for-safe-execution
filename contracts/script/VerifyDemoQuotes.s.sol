// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoPoolRegistry} from "../src/registry/DemoPoolRegistry.sol";
import {UniswapV2Quote} from "../src/libraries/UniswapV2Quote.sol";
import {IDemoPair} from "../src/dex/interfaces/IDemoPair.sol";

/// @notice Read-only verification for deployed demo pools.
contract VerifyDemoQuotes is Script {
    uint256 internal constant QUOTE_AMOUNT_USDC = 100 * 1e6;

    error VerificationFailed(string reason);

    function run() external view {
        address registryAddr = vm.envAddress("DEMO_REGISTRY_ADDRESS");
        address usdc = vm.envAddress("DEMO_USDC_ADDRESS");

        DemoPoolRegistry registry = DemoPoolRegistry(registryAddr);
        if (registry.poolCount() != 9) {
            revert VerificationFailed("pool count != 9");
        }

        address goodToken = _goodToken(registry);
        DemoPoolRegistry.PoolEntry[] memory pools = registry.getAllPools();

        uint256 goodSafeOut;
        uint256 goodShallowOut;
        uint256 goodToxicOut;

        console2.log("=== Verify Demo Quotes (100 USDC) ===");

        for (uint256 i = 0; i < pools.length; i++) {
            DemoPoolRegistry.PoolEntry memory entry = pools[i];
            if (entry.tokenOut != goodToken) continue;

            uint256 amountOut = _quotePair(entry.pair, usdc, QUOTE_AMOUNT_USDC);
            console2.log("Label:", uint256(entry.label));
            console2.log("Pair:", entry.pair);
            console2.log("QuotedOut:", amountOut);

            if (entry.label == DemoPoolRegistry.PoolLabel.SAFE) goodSafeOut = amountOut;
            if (entry.label == DemoPoolRegistry.PoolLabel.SHALLOW) goodShallowOut = amountOut;
            if (entry.label == DemoPoolRegistry.PoolLabel.TOXIC) goodToxicOut = amountOut;
        }

        if (!(goodToxicOut > goodSafeOut && goodSafeOut > goodShallowOut)) {
            revert VerificationFailed("GOOD ordering: toxic > safe > shallow");
        }

        console2.log("PASS: GOOD toxic > safe > shallow");
    }

    function _goodToken(DemoPoolRegistry registry) private view returns (address) {
        DemoPoolRegistry.TokenEntry[] memory tokens = registry.getAllTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            if (keccak256(bytes(tokens[i].symbol)) == keccak256(bytes("GOOD"))) {
                return tokens[i].token;
            }
        }
        revert VerificationFailed("GOOD token not found");
    }

    function _quotePair(address pairAddr, address usdc, uint256 amountIn) private view returns (uint256) {
        IDemoPair pair = IDemoPair(pairAddr);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        bool usdcIsToken0 = pair.token0() == usdc;
        (uint256 reserveUsdc, uint256 reserveToken) =
            UniswapV2Quote.reservesForUsdcToToken(r0, r1, usdcIsToken0);
        return UniswapV2Quote.quoteUsdcToToken(amountIn, reserveUsdc, reserveToken);
    }
}

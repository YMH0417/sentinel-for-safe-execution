// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultExecution} from "../VaultExecution.sol";
import {DemoPoolRegistry} from "../registry/DemoPoolRegistry.sol";
import {DemoScenarioDeployer} from "../demo/DemoScenarioDeployer.sol";
import {DemoPair} from "../dex/DemoPair.sol";
import {DemoERC20} from "../tokens/DemoERC20.sol";
import {UniswapV2Quote} from "../libraries/UniswapV2Quote.sol";
import {IDemoPair} from "../dex/interfaces/IDemoPair.sol";

/// @notice One-transaction Vault gate + demo DEX swap (Agent-signed permit required).
contract DemoSwapRouter {
    VaultExecution public immutable vault;
    DemoPoolRegistry public immutable registry;
    DemoScenarioDeployer public immutable scenarioDeployer;

    error SlippageExceeded(uint256 amountOut, uint256 amountOutMin);
    error SwapFailed();

    event RouterSwapExecuted(
        bytes32 indexed routeId,
        address indexed recipient,
        address pair,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address vault_, address registry_, address scenarioDeployer_) {
        if (vault_ == address(0) || registry_ == address(0) || scenarioDeployer_ == address(0)) {
            revert VaultExecution.ZeroAddress();
        }
        vault = VaultExecution(vault_);
        registry = DemoPoolRegistry(registry_);
        scenarioDeployer = DemoScenarioDeployer(scenarioDeployer_);
    }

    /// @notice Validate permit via Vault, then pull tokenIn from user and swap on the demo pair.
    function swapWithPermit(
        address user,
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 amountOutMin,
        uint256 deadline,
        uint256 riskScore,
        VaultExecution.Decision decision,
        uint256 nonce,
        bytes calldata signature,
        address recipient
    ) external returns (uint256 amountOut) {
        if (recipient == address(0)) revert VaultExecution.ZeroAddress();

        bool executed = vault.executeRoute(
            user,
            routeId,
            amountIn,
            amountOutQuoted,
            deadline,
            riskScore,
            decision,
            nonce,
            signature
        );
        if (!executed) return 0;

        DemoPoolRegistry.PoolEntry memory pool = registry.getPoolByRouteId(routeId);

        if (!DemoERC20(pool.tokenIn).transferFrom(user, pool.pair, amountIn)) revert SwapFailed();

        IDemoPair pair = IDemoPair(pool.pair);
        address token0 = pair.token0();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, token0, pool.tokenIn);
        amountOut = UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < amountOutMin) revert SlippageExceeded(amountOut, amountOutMin);

        uint256 amount0Out = pool.tokenOut == token0 ? amountOut : 0;
        uint256 amount1Out = pool.tokenOut == token0 ? 0 : amountOut;

        DemoPair(pool.pair).swap(amount0Out, amount1Out, recipient);
        if (amountOut == 0) revert SwapFailed();

        emit RouterSwapExecuted(routeId, recipient, pool.pair, amountIn, amountOut);
    }
}

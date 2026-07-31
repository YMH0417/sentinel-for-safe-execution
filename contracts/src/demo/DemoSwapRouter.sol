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
/// @dev SDA pools use a two-step execution window to simulate bridge / cross-chain finality latency.
contract DemoSwapRouter {
    VaultExecution public immutable vault;
    DemoPoolRegistry public immutable registry;
    DemoScenarioDeployer public immutable scenarioDeployer;

    /// @notice Minimum wall-clock wait (on-chain timestamp) before an SDA escrowed swap may settle.
    /// Simulates the gap between signing an intent and cross-chain message arrival (paper SDA §3.2.2).
    uint256 public constant SDA_EXECUTION_WINDOW = 15 seconds;

    error SlippageExceeded(uint256 amountOut, uint256 amountOutMin);
    error SwapFailed();
    error NotSdaPool();
    error SdaSwapNotFound();
    error SdaSwapAlreadyPending(bytes32 swapId);
    error SdaWindowNotReady(uint256 readyAt, uint256 currentTime);

    struct SdaPendingSwap {
        address user;
        address recipient;
        bytes32 routeId;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 quotedOutAtOpen;
        uint256 windowOpenedAt;
        bool active;
    }

    mapping(bytes32 => SdaPendingSwap) public sdaPendingSwaps;

    event RouterSwapExecuted(
        bytes32 indexed routeId,
        address indexed recipient,
        address pair,
        uint256 amountIn,
        uint256 amountOut
    );

    event SdaExecutionWindowOpened(
        bytes32 indexed swapId,
        bytes32 indexed routeId,
        address indexed user,
        uint256 quotedOutAtOpen,
        uint256 readyAt
    );

    event SdaExecutionWindowCompleted(
        bytes32 indexed swapId,
        bytes32 indexed routeId,
        address indexed recipient,
        uint256 quotedOutAtOpen,
        uint256 quotedOutAtComplete,
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
        if (pool.label == DemoPoolRegistry.PoolLabel.SDA) {
            revert NotSdaPool();
        }

        if (!DemoERC20(pool.tokenIn).transferFrom(user, pool.pair, amountIn)) revert SwapFailed();

        amountOut = _swapOnPair(pool, amountIn, amountOutMin, recipient);
        emit RouterSwapExecuted(routeId, recipient, pool.pair, amountIn, amountOut);
    }

    /// @notice Step 1 (SDA only): escrow tokenIn and record the opening quote — execution window starts.
    function openSdaExecutionWindow(
        bytes32 swapId,
        address user,
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) external returns (uint256 quotedOutAtOpen) {
        if (recipient == address(0)) revert VaultExecution.ZeroAddress();
        if (sdaPendingSwaps[swapId].active) revert SdaSwapAlreadyPending(swapId);

        DemoPoolRegistry.PoolEntry memory pool = registry.getPoolByRouteId(routeId);
        if (pool.label != DemoPoolRegistry.PoolLabel.SDA) revert NotSdaPool();

        if (!DemoERC20(pool.tokenIn).transferFrom(user, address(this), amountIn)) revert SwapFailed();

        quotedOutAtOpen = _quoteOut(pool, amountIn);

        sdaPendingSwaps[swapId] = SdaPendingSwap({
            user: user,
            recipient: recipient,
            routeId: routeId,
            amountIn: amountIn,
            amountOutMin: amountOutMin,
            quotedOutAtOpen: quotedOutAtOpen,
            windowOpenedAt: block.timestamp,
            active: true
        });

        uint256 readyAt = block.timestamp + SDA_EXECUTION_WINDOW;
        emit SdaExecutionWindowOpened(swapId, routeId, user, quotedOutAtOpen, readyAt);
    }

    /// @notice Step 2 (SDA only): after `SDA_EXECUTION_WINDOW`, settle with the post-delay on-chain quote.
    function completeSdaExecutionWindow(bytes32 swapId) external returns (uint256 amountOut) {
        SdaPendingSwap memory pending = sdaPendingSwaps[swapId];
        if (!pending.active) revert SdaSwapNotFound();

        uint256 readyAt = pending.windowOpenedAt + SDA_EXECUTION_WINDOW;
        if (block.timestamp < readyAt) {
            revert SdaWindowNotReady(readyAt, block.timestamp);
        }

        DemoPoolRegistry.PoolEntry memory pool = registry.getPoolByRouteId(pending.routeId);

        if (!DemoERC20(pool.tokenIn).transfer(pool.pair, pending.amountIn)) revert SwapFailed();

        uint256 quotedOutAtComplete = _quoteOut(pool, pending.amountIn);
        amountOut = _swapOnPair(pool, pending.amountIn, pending.amountOutMin, pending.recipient);

        delete sdaPendingSwaps[swapId];

        emit SdaExecutionWindowCompleted(
            swapId,
            pending.routeId,
            pending.recipient,
            pending.quotedOutAtOpen,
            quotedOutAtComplete,
            amountOut
        );
    }

    function getSdaWindowReadyAt(bytes32 swapId) external view returns (uint256) {
        SdaPendingSwap memory pending = sdaPendingSwaps[swapId];
        if (!pending.active) return 0;
        return pending.windowOpenedAt + SDA_EXECUTION_WINDOW;
    }

    function _quoteOut(DemoPoolRegistry.PoolEntry memory pool, uint256 amountIn)
        internal
        view
        returns (uint256)
    {
        IDemoPair pair = IDemoPair(pool.pair);
        address token0 = pair.token0();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            UniswapV2Quote.reservesForSwap(r0, r1, token0, pool.tokenIn);
        return UniswapV2Quote.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function _swapOnPair(
        DemoPoolRegistry.PoolEntry memory pool,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) internal returns (uint256 amountOut) {
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
    }
}

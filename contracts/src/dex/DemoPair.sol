// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDemoPair} from "./interfaces/IDemoPair.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

/// @notice Minimal Uniswap V2-style constant-product pair for demo pools.
/// @dev Reserves sync from token balances on mint(); swap is out of scope for Week 4.
contract DemoPair is IDemoPair {
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    bool private initialized;

    error AlreadyInitialized();
    error InvalidTokenOrder();
    error InsufficientLiquidity();
    error InvalidOutputAmount();

    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    function initialize(address token0_, address token1_) external {
        if (initialized) revert AlreadyInitialized();
        if (token0_ >= token1_) revert InvalidTokenOrder();
        token0 = token0_;
        token1 = token1_;
        initialized = true;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    /// @inheritdoc IDemoPair
    /// @dev Transfer tokens to the pair before calling mint.
    function mint(address) external returns (uint256 liquidity) {
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - uint256(reserve0);
        uint256 amount1 = balance1 - uint256(reserve1);
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();

        if (reserve0 == 0 && reserve1 == 0) {
            liquidity = _sqrt(amount0 * amount1);
        } else {
            liquidity = _min((amount0 * 1e18) / uint256(reserve0), (amount1 * 1e18) / uint256(reserve1));
        }

        _update(balance0, balance1);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
    }

    /// @notice Uniswap V2-style swap (caller must transfer tokenIn to pair first).
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        if (amount0Out == 0 && amount1Out == 0) revert InvalidOutputAmount();
        uint112 _reserve0 = reserve0;
        uint112 _reserve1 = reserve1;
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        if (amount0Out > 0) IERC20Minimal(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20Minimal(token1).transfer(to, amount1Out);

        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientLiquidity();

        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            if (balance0Adjusted * balance1Adjusted < uint256(_reserve0) * _reserve1 * (1000 ** 2)) {
                revert InsufficientLiquidity();
            }
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y == 0) return 0;
        z = y;
        uint256 x = (y / 2) + 1;
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

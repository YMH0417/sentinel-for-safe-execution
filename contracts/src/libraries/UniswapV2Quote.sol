// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pure Uniswap V2 quote helpers (0.3% fee).
library UniswapV2Quote {
    uint256 internal constant FEE_NUMERATOR = 997;
    uint256 internal constant FEE_DENOMINATOR = 1000;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant ONE = 1e18;

    error InsufficientLiquidity();

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountOut)
    {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function getSpotPriceX18(uint256 reserveIn, uint256 reserveOut, uint8 decIn, uint8 decOut)
        internal
        pure
        returns (uint256)
    {
        if (reserveIn == 0) revert InsufficientLiquidity();
        uint256 scaleIn = 10 ** uint256(decIn);
        uint256 scaleOut = 10 ** uint256(decOut);
        return (reserveOut * scaleIn * ONE) / (reserveIn * scaleOut);
    }

    function getPriceImpactBps(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        uint256 actualOut = getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 spotOut = (amountIn * reserveOut) / reserveIn;
        if (spotOut <= actualOut) return 0;
        return ((spotOut - actualOut) * BPS) / spotOut;
    }

    function quoteUsdcToToken(uint256 amountInUsdc, uint256 reserveUsdc, uint256 reserveToken)
        internal
        pure
        returns (uint256 amountOut)
    {
        return getAmountOut(amountInUsdc, reserveUsdc, reserveToken);
    }

    function reservesForUsdcToToken(
        uint112 reserve0,
        uint112 reserve1,
        bool usdcIsToken0
    ) internal pure returns (uint256 reserveUsdc, uint256 reserveToken) {
        if (usdcIsToken0) {
            return (uint256(reserve0), uint256(reserve1));
        }
        return (uint256(reserve1), uint256(reserve0));
    }

    function reservesForSwap(
        uint112 reserve0,
        uint112 reserve1,
        address token0,
        address tokenIn
    ) internal pure returns (uint256 reserveIn, uint256 reserveOut) {
        if (tokenIn == token0) {
            return (uint256(reserve0), uint256(reserve1));
        }
        return (uint256(reserve1), uint256(reserve0));
    }
}

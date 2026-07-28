// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDemoPair {
    function token0() external view returns (address);
    function token1() external view returns (address);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function initialize(address token0_, address token1_) external;

    function mint(address to) external returns (uint256 liquidity);

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
}

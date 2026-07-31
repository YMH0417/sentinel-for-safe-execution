// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain registry for the 3x3 demo token/pool matrix.
contract DemoPoolRegistry {
    enum PoolLabel {
        SAFE,
        SHALLOW,
        TOXIC,
        SDA
    }

    enum TokenRiskTag {
        NONE,
        HIGH,
        BAIT
    }

    struct TokenEntry {
        address token;
        string symbol;
        TokenRiskTag riskTag;
    }

    struct PoolEntry {
        bytes32 routeId;
        address pair;
        address tokenIn;
        address tokenOut;
        PoolLabel label;
    }

    address public immutable deployer;
    TokenEntry[] private _tokens;
    PoolEntry[] private _pools;
    mapping(address => TokenRiskTag) public tokenRiskTag;
    mapping(bytes32 => address) public referencePoolByPair;
    mapping(bytes32 => PoolEntry) public poolByRouteId;

    error PoolNotFound();
    error Unauthorized();
    error AlreadySealed();
    error InvalidInput();

    bool public isSealed;

    event RegistrySealed(uint256 tokenCount, uint256 poolCount);

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert Unauthorized();
        _;
    }

    modifier notSealed() {
        if (isSealed) revert AlreadySealed();
        _;
    }

    constructor(address deployer_) {
        if (deployer_ == address(0)) revert InvalidInput();
        deployer = deployer_;
    }

    function registerToken(address token, string calldata symbol, TokenRiskTag riskTag)
        external
        onlyDeployer
        notSealed
    {
        if (token == address(0)) revert InvalidInput();
        _tokens.push(TokenEntry({token: token, symbol: symbol, riskTag: riskTag}));
        tokenRiskTag[token] = riskTag;
    }

    function registerPool(
        bytes32 routeId,
        address pair,
        address tokenIn,
        address tokenOut,
        PoolLabel label
    ) external onlyDeployer notSealed {
        if (routeId == bytes32(0) || pair == address(0) || tokenIn == address(0) || tokenOut == address(0)) {
            revert InvalidInput();
        }

        _pools.push(
            PoolEntry({routeId: routeId, pair: pair, tokenIn: tokenIn, tokenOut: tokenOut, label: label})
        );
        poolByRouteId[routeId] = PoolEntry({routeId: routeId, pair: pair, tokenIn: tokenIn, tokenOut: tokenOut, label: label});

        if (label == PoolLabel.SAFE) {
            bytes32 pairKey = keccak256(abi.encodePacked(tokenIn, tokenOut));
            address existing = referencePoolByPair[pairKey];
            if (existing != address(0) && existing != pair) revert InvalidInput();
            referencePoolByPair[pairKey] = pair;
        }
    }

    function seal() external onlyDeployer notSealed {
        if (_pools.length != 48) revert InvalidInput();
        isSealed = true;
        emit RegistrySealed(_tokens.length, _pools.length);
    }

    function poolCount() external view returns (uint256) {
        return _pools.length;
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function getAllPools() external view returns (PoolEntry[] memory) {
        return _pools;
    }

    function getPoolsByTokenOut(address tokenOut) external view returns (PoolEntry[] memory) {
        uint256 count;
        for (uint256 i = 0; i < _pools.length; i++) {
            if (_pools[i].tokenOut == tokenOut) count++;
        }

        PoolEntry[] memory result = new PoolEntry[](count);
        uint256 index;
        for (uint256 i = 0; i < _pools.length; i++) {
            if (_pools[i].tokenOut == tokenOut) {
                result[index++] = _pools[i];
            }
        }
        return result;
    }

    function getReferencePool(address tokenIn, address tokenOut) external view returns (address) {
        return referencePoolByPair[keccak256(abi.encodePacked(tokenIn, tokenOut))];
    }

    function getPoolByRouteId(bytes32 routeId) external view returns (PoolEntry memory) {
        PoolEntry memory pool = poolByRouteId[routeId];
        if (pool.pair == address(0)) revert PoolNotFound();
        return pool;
    }

    function getAllTokens() external view returns (TokenEntry[] memory) {
        return _tokens;
    }
}

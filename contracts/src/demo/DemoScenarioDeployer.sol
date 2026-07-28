// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../tokens/MockUSDC.sol";
import {DemoToken} from "../tokens/DemoToken.sol";
import {DemoPair} from "../dex/DemoPair.sol";
import {DemoPoolRegistry} from "../registry/DemoPoolRegistry.sol";
import {DemoERC20} from "../tokens/DemoERC20.sol";

/// @notice Deployer for the 4-token demo: 12 directed pairs × 3 pool labels = 36 routes.
contract DemoScenarioDeployer {
    uint256 public constant POOL_COUNT = 36;
    uint256 public constant PAIR_COUNT = 12;
    uint256 public constant LABEL_COUNT = 3;

    uint256 public constant USDC_MINT = 200_000_000 * 1e6;
    uint256 public constant TOKEN_MINT = 200_000_000 ether;

    /// @dev Relative prices USDC:GOOD:BAD:BAIT = 1:20:100:1 (USDC numeraire).
    uint256 internal constant PRICE_USDC = 1;
    uint256 internal constant PRICE_GOOD = 20;
    uint256 internal constant PRICE_BAD = 100;
    uint256 internal constant PRICE_BAIT = 1;

    uint256 public constant SAFE_RESERVE = 1_000_000;
    uint256 public constant SHALLOW_RESERVE = 500;
    uint256 public constant TOXIC_IN_RESERVE = 40_000;
    uint256 public constant TOXIC_OUT_RESERVE = 50_000;

    struct TokenBundle {
        MockUSDC usdc;
        DemoToken good;
        DemoToken bad;
        DemoToken bait;
    }

    struct PoolBundle {
        DemoPair[36] pairs;
        bytes32[36] routeIds;
        string[36] routeNames;
    }

    struct Scenario {
        TokenBundle tokens;
        PoolBundle pools;
        DemoPoolRegistry registry;
    }

    address public bootstrapOwner;
    mapping(address => bool) public authorizedFunders;

    error UnauthorizedFunder();

    function routeId(string memory routeName) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(routeName));
    }

    function deploy() external returns (Scenario memory scenario) {
        bootstrapOwner = msg.sender;
        scenario.tokens = _deployTokens();
        (scenario.pools, scenario.registry) = _deployPools(scenario.tokens);
    }

    function authorizeFunder(address funder, bool allowed) external {
        if (msg.sender != bootstrapOwner) revert UnauthorizedFunder();
        authorizedFunders[funder] = allowed;
    }

    /// @notice Release demo tokens from deployer inventory (authorized funder only).
    function fundSwapper(address token, address to, uint256 amount) external {
        if (!authorizedFunders[msg.sender]) revert UnauthorizedFunder();
        DemoERC20(token).transfer(to, amount);
    }

    function _deployTokens() private returns (TokenBundle memory bundle) {
        address holder = address(this);
        bundle.usdc = new MockUSDC(holder);
        bundle.good = new DemoToken("Good Token", "GOOD", holder);
        bundle.bad = new DemoToken("Bad Token", "BAD", holder);
        bundle.bait = new DemoToken("USD Coin", "BAIT", holder);

        bundle.usdc.mint(holder, USDC_MINT);
        bundle.good.mint(holder, TOKEN_MINT);
        bundle.bad.mint(holder, TOKEN_MINT);
        bundle.bait.mint(holder, TOKEN_MINT);
    }

    function _deployPools(TokenBundle memory tokens)
        private
        returns (PoolBundle memory pools, DemoPoolRegistry registry)
    {
        registry = new DemoPoolRegistry(address(this));
        registry.registerToken(address(tokens.usdc), "USDC", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(address(tokens.good), "GOOD", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(address(tokens.bad), "BAD", DemoPoolRegistry.TokenRiskTag.HIGH);
        registry.registerToken(address(tokens.bait), "BAIT", DemoPoolRegistry.TokenRiskTag.BAIT);

        address[4] memory addrs = [
            address(tokens.usdc), address(tokens.good), address(tokens.bad), address(tokens.bait)
        ];
        string[4] memory keys = ["usdc", "good", "bad", "bait"];
        uint8[4] memory decimals = [6, 18, 18, 18];
        uint256[4] memory prices = [PRICE_USDC, PRICE_GOOD, PRICE_BAD, PRICE_BAIT];

        uint256 index;
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < 4; j++) {
                if (i == j) continue;
                for (uint256 label = 0; label < 3; label++) {
                    DemoPoolRegistry.PoolLabel poolLabel = DemoPoolRegistry.PoolLabel(label);
                    string memory routeName = _routeName(keys[i], keys[j], label);
                    pools.routeNames[index] = routeName;
                    pools.routeIds[index] = routeId(routeName);
                    pools.pairs[index] = _createLabeledPool(
                        registry,
                        DemoERC20(addrs[i]),
                        DemoERC20(addrs[j]),
                        decimals[i],
                        decimals[j],
                        prices[i],
                        prices[j],
                        routeName,
                        poolLabel
                    );
                    index++;
                }
            }
        }

        registry.seal();
    }

    function _routeName(string memory tokenInKey, string memory tokenOutKey, uint256 label)
        private
        pure
        returns (string memory)
    {
        string memory labelKey = label == 0 ? "safe" : (label == 1 ? "shallow" : "toxic");
        return string(
            abi.encodePacked("route-", tokenInKey, "-", tokenOutKey, "-", labelKey)
        );
    }

    function _createLabeledPool(
        DemoPoolRegistry registry,
        DemoERC20 tokenIn,
        DemoERC20 tokenOut,
        uint8 decIn,
        uint8 decOut,
        uint256 priceIn,
        uint256 priceOut,
        string memory routeName,
        DemoPoolRegistry.PoolLabel label
    ) private returns (DemoPair pair) {
        (uint256 amountIn, uint256 amountOut) = _reserveAmounts(label, decIn, decOut, priceIn, priceOut);

        pair = new DemoPair();
        (address token0, address token1) = _sortTokens(address(tokenIn), address(tokenOut));
        pair.initialize(token0, token1);

        tokenIn.transfer(address(pair), amountIn);
        tokenOut.transfer(address(pair), amountOut);
        pair.mint(address(this));

        registry.registerPool(routeId(routeName), address(pair), address(tokenIn), address(tokenOut), label);
    }

    function _reserveAmounts(
        DemoPoolRegistry.PoolLabel label,
        uint8 decIn,
        uint8 decOut,
        uint256 priceIn,
        uint256 priceOut
    ) private pure returns (uint256 amountIn, uint256 amountOut) {
        uint256 scaleIn = 10 ** uint256(decIn);
        uint256 scaleOut = 10 ** uint256(decOut);

        uint256 inHuman;
        uint256 outHuman;

        if (label == DemoPoolRegistry.PoolLabel.SAFE) {
            inHuman = SAFE_RESERVE;
            outHuman = (inHuman * priceIn) / priceOut;
        } else if (label == DemoPoolRegistry.PoolLabel.SHALLOW) {
            inHuman = SHALLOW_RESERVE;
            outHuman = (inHuman * priceIn) / priceOut;
        } else {
            inHuman = TOXIC_IN_RESERVE;
            // Skew out side for toxic trap: fair ratio × 1.25
            outHuman = (TOXIC_OUT_RESERVE * priceIn) / priceOut;
        }

        return (inHuman * scaleIn, outHuman * scaleOut);
    }

    function _sortTokens(address a, address b) private pure returns (address, address) {
        if (a < b) return (a, b);
        return (b, a);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../tokens/MockUSDC.sol";
import {DemoToken} from "../tokens/DemoToken.sol";
import {DemoPair} from "../dex/DemoPair.sol";
import {DemoPoolRegistry} from "../registry/DemoPoolRegistry.sol";
import {DemoERC20} from "../tokens/DemoERC20.sol";

/// @notice Deployer for the 4-token demo: 12 directed pairs × 4 pool labels = 48 routes.
/// @dev Supports phased deployment for chains with a 30M per-transaction gas cap (e.g. Monad testnet).
contract DemoScenarioDeployer {
    uint256 public constant POOL_COUNT = 48;
    uint256 public constant PAIR_COUNT = 12;
    uint256 public constant LABEL_COUNT = 4;

    /// @dev Monad testnet per-transaction gas limit; each batch targets well below this.
    uint256 public constant MONAD_MAX_TX_GAS = 30_000_000;
    uint256 public constant POOLS_PER_BATCH = 12;

    uint256 public constant USDC_MINT = 500_000_000 * 1e6;
    uint256 public constant TOKEN_MINT = 500_000_000 ether;

    /// @dev Relative prices USDC:GOOD:BAD:BAIT = 1:20:100:1 (USDC numeraire).
    uint256 internal constant PRICE_USDC = 1;
    uint256 internal constant PRICE_GOOD = 20;
    uint256 internal constant PRICE_BAD = 100;
    uint256 internal constant PRICE_BAIT = 1;

    uint256 public constant SAFE_RESERVE = 1_000_000;
    uint256 public constant SHALLOW_RESERVE = 500;
    uint256 public constant TOXIC_IN_RESERVE = 40_000;
    uint256 public constant TOXIC_OUT_RESERVE = 50_000;
    /// @dev SDA pools use SAFE-depth liquidity; risk is execution-window metadata (bridge-delay analogue).
    uint256 public constant SDA_RESERVE = 1_000_000;

    struct TokenBundle {
        MockUSDC usdc;
        DemoToken good;
        DemoToken bad;
        DemoToken bait;
    }

    struct PoolBundle {
        DemoPair[48] pairs;
        bytes32[48] routeIds;
        string[48] routeNames;
    }

    struct Scenario {
        TokenBundle tokens;
        PoolBundle pools;
        DemoPoolRegistry registry;
    }

    address public bootstrapOwner;
    mapping(address => bool) public authorizedFunders;
    mapping(address => bool) public authorizedMinters;

    bool public scenarioBegun;
    bool public scenarioSealed;
    uint256 public poolsDeployed;

    MockUSDC public usdc;
    DemoToken public good;
    DemoToken public bad;
    DemoToken public bait;
    DemoPoolRegistry public registry;

    error UnauthorizedFunder();
    error UnauthorizedMinter();
    error ScenarioAlreadyBegun();
    error ScenarioNotBegun();
    error ScenarioAlreadySealed();
    error PoolsIncomplete();
    error PoolsAlreadyComplete();

    function routeId(string memory routeName) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(routeName));
    }

    /// @notice One-shot deploy (local Anvil / tests). Runs phased steps in a single transaction.
    function deploy() external returns (Scenario memory scenario) {
        if (!scenarioBegun) {
            _beginScenario();
        }
        while (poolsDeployed < POOL_COUNT) {
            _deployPoolBatch(POOLS_PER_BATCH);
        }
        if (!scenarioSealed) {
            _sealScenario();
        }
        return getScenario();
    }

    /// @notice Phase 1 — deploy tokens and registry (single tx, ~5M gas).
    function beginScenario() external {
        _beginScenario();
    }

    /// @notice Phase 2 — deploy up to `maxPools` pools per transaction (~12 pools ≈ 15M gas).
    function deployPoolBatch(uint256 maxPools) external returns (uint256 deployed) {
        if (!scenarioBegun) revert ScenarioNotBegun();
        if (scenarioSealed) revert ScenarioAlreadySealed();
        if (poolsDeployed >= POOL_COUNT) revert PoolsAlreadyComplete();
        return _deployPoolBatch(maxPools);
    }

    /// @notice Phase 3 — seal registry after all 48 pools are registered.
    function sealScenario() external {
        _sealScenario();
    }

    /// @notice Remaining pools until sealScenario() can run.
    function poolsRemaining() external view returns (uint256) {
        if (!scenarioBegun || poolsDeployed >= POOL_COUNT) return 0;
        return POOL_COUNT - poolsDeployed;
    }

    /// @notice Expected batch count when using POOLS_PER_BATCH-sized steps.
    function expectedPoolBatches() external pure returns (uint256) {
        return POOL_COUNT / POOLS_PER_BATCH;
    }

    function getScenario() public view returns (Scenario memory scenario) {
        scenario.tokens = TokenBundle({usdc: usdc, good: good, bad: bad, bait: bait});
        scenario.registry = registry;
    }

    function authorizeFunder(address funder, bool allowed) external {
        if (msg.sender != bootstrapOwner) revert UnauthorizedFunder();
        authorizedFunders[funder] = allowed;
    }

    function authorizeMinter(address minter, bool allowed) external {
        if (msg.sender != bootstrapOwner) revert UnauthorizedFunder();
        authorizedMinters[minter] = allowed;
    }

    /// @notice Release demo tokens from deployer inventory (authorized funder only).
    function fundSwapper(address token, address to, uint256 amount) external {
        if (!authorizedFunders[msg.sender]) revert UnauthorizedFunder();
        DemoERC20(token).transfer(to, amount);
    }

    /// @notice Mint new demo tokens to the caller's wallet (authorized minter only).
    function mintToken(address token, address to, uint256 amount) external {
        if (!authorizedMinters[msg.sender]) revert UnauthorizedMinter();
        if (to != msg.sender) revert UnauthorizedMinter();
        DemoERC20(token).mint(to, amount);
    }

    /// @notice Mint tokens directly into a pool and sync reserves (authorized minter only).
    function mintTokenToPool(address token, address pair, uint256 amount) external {
        if (!authorizedMinters[msg.sender]) revert UnauthorizedMinter();
        DemoERC20(token).mint(pair, amount);
        DemoPair(pair).syncReserves();
    }

    /// @notice Remove tokens from pool reserves and burn them (authorized minter only).
    function burnTokenFromPool(address token, address pair, uint256 amount) external {
        if (!authorizedMinters[msg.sender]) revert UnauthorizedMinter();
        DemoPair(pair).adminWithdraw(token, msg.sender, amount);
        DemoERC20(token).burnFromAccount(msg.sender, amount);
    }

    function _beginScenario() private {
        if (scenarioBegun) revert ScenarioAlreadyBegun();
        bootstrapOwner = msg.sender;
        scenarioBegun = true;

        address holder = address(this);
        usdc = new MockUSDC(holder);
        good = new DemoToken("Good Token", "GOOD", holder);
        bad = new DemoToken("Bad Token", "BAD", holder);
        bait = new DemoToken("USD Coin", "BAIT", holder);

        usdc.mint(holder, USDC_MINT);
        good.mint(holder, TOKEN_MINT);
        bad.mint(holder, TOKEN_MINT);
        bait.mint(holder, TOKEN_MINT);

        registry = new DemoPoolRegistry(address(this));
        registry.registerToken(address(usdc), "USDC", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(address(good), "GOOD", DemoPoolRegistry.TokenRiskTag.NONE);
        registry.registerToken(address(bad), "BAD", DemoPoolRegistry.TokenRiskTag.HIGH);
        registry.registerToken(address(bait), "BAIT", DemoPoolRegistry.TokenRiskTag.BAIT);
    }

    function _deployPoolBatch(uint256 maxPools) private returns (uint256 deployed) {
        if (maxPools == 0 || poolsDeployed >= POOL_COUNT) {
            return 0;
        }

        address[4] memory addrs =
            [address(usdc), address(good), address(bad), address(bait)];
        string[4] memory keys = ["usdc", "good", "bad", "bait"];
        uint8[4] memory decimals = [6, 18, 18, 18];
        uint256[4] memory prices = [PRICE_USDC, PRICE_GOOD, PRICE_BAD, PRICE_BAIT];

        uint256 startIndex = poolsDeployed;
        uint256 endIndex = startIndex + maxPools;
        if (endIndex > POOL_COUNT) {
            endIndex = POOL_COUNT;
        }

        uint256 cursor;
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < 4; j++) {
                if (i == j) continue;
                for (uint256 label = 0; label < LABEL_COUNT; label++) {
                    if (cursor >= startIndex && cursor < endIndex) {
                        DemoPoolRegistry.PoolLabel poolLabel = DemoPoolRegistry.PoolLabel(label);
                        string memory routeName = _routeName(keys[i], keys[j], label);
                        _createLabeledPool(
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
                        deployed++;
                    }
                    cursor++;
                }
            }
        }

        poolsDeployed = endIndex;
    }

    function _sealScenario() private {
        if (!scenarioBegun) revert ScenarioNotBegun();
        if (scenarioSealed) revert ScenarioAlreadySealed();
        if (poolsDeployed != POOL_COUNT) revert PoolsIncomplete();
        registry.seal();
        scenarioSealed = true;
    }

    function _routeName(string memory tokenInKey, string memory tokenOutKey, uint256 label)
        private
        pure
        returns (string memory)
    {
        string memory labelKey;
        if (label == 0) labelKey = "safe";
        else if (label == 1) labelKey = "shallow";
        else if (label == 2) labelKey = "toxic";
        else labelKey = "sda";
        return string(
            abi.encodePacked("route-", tokenInKey, "-", tokenOutKey, "-", labelKey)
        );
    }

    function _createLabeledPool(
        DemoPoolRegistry registry_,
        DemoERC20 tokenIn,
        DemoERC20 tokenOut,
        uint8 decIn,
        uint8 decOut,
        uint256 priceIn,
        uint256 priceOut,
        string memory routeName,
        DemoPoolRegistry.PoolLabel label
    ) private {
        (uint256 amountIn, uint256 amountOut) = _reserveAmounts(label, decIn, decOut, priceIn, priceOut);

        DemoPair pair = new DemoPair();
        (address token0, address token1) = _sortTokens(address(tokenIn), address(tokenOut));
        pair.initialize(token0, token1);
        pair.setLiquidityAdmin(address(this));

        tokenIn.transfer(address(pair), amountIn);
        tokenOut.transfer(address(pair), amountOut);
        pair.mint(address(this));

        registry_.registerPool(routeId(routeName), address(pair), address(tokenIn), address(tokenOut), label);
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
        } else if (label == DemoPoolRegistry.PoolLabel.TOXIC) {
            inHuman = TOXIC_IN_RESERVE;
            outHuman = (TOXIC_OUT_RESERVE * priceIn) / priceOut;
        } else {
            inHuman = SDA_RESERVE;
            outHuman = (inHuman * priceIn) / priceOut;
        }

        return (inHuman * scaleIn, outHuman * scaleOut);
    }

    function _sortTokens(address a, address b) private pure returns (address, address) {
        if (a < b) return (a, b);
        return (b, a);
    }
}

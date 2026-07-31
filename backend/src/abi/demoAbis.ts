export const DEFAULT_TEST_USER = "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";

export const demoErc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function burn(uint256 amount) external",
] as const;

export const demoScenarioDeployerAbi = [
  "function fundSwapper(address token, address to, uint256 amount) external",
  "function authorizeFunder(address funder, bool allowed) external",
  "function authorizeMinter(address minter, bool allowed) external",
  "function mintToken(address token, address to, uint256 amount) external",
  "function mintTokenToPool(address token, address pair, uint256 amount) external",
  "function burnTokenFromPool(address token, address pair, uint256 amount) external",
  "function authorizedMinters(address minter) view returns (bool)",
] as const;

export const demoSwapRouterAbi = [
  "function swapWithPermit(address user, bytes32 routeId, uint256 amountIn, uint256 amountOutQuoted, uint256 amountOutMin, uint256 deadline, uint256 riskScore, uint8 decision, uint256 nonce, bytes signature, address recipient) external returns (uint256 amountOut)",
  "function openSdaExecutionWindow(bytes32 swapId, address user, bytes32 routeId, uint256 amountIn, uint256 amountOutMin, address recipient) external returns (uint256 quotedOutAtOpen)",
  "function completeSdaExecutionWindow(bytes32 swapId) external returns (uint256 amountOut)",
  "function getSdaWindowReadyAt(bytes32 swapId) external view returns (uint256)",
  "function SDA_EXECUTION_WINDOW() external view returns (uint256)",
  "event SdaExecutionWindowOpened(bytes32 indexed swapId, bytes32 indexed routeId, address indexed user, uint256 quotedOutAtOpen, uint256 readyAt)",
  "event SdaExecutionWindowCompleted(bytes32 indexed swapId, bytes32 indexed routeId, address indexed recipient, uint256 quotedOutAtOpen, uint256 quotedOutAtComplete, uint256 amountOut)",
] as const;

export const demoPairAbi = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function swap(uint256 amount0Out, uint256 amount1Out, address to) external",
] as const;

export const demoPoolRegistryAbi = [
  "function deployer() view returns (address)",
  "function tokenRiskTag(address token) view returns (uint8)",
  "function getReferencePool(address tokenIn, address tokenOut) view returns (address)",
  "function getPoolByRouteId(bytes32 routeId) view returns (tuple(bytes32 routeId, address pair, address tokenIn, address tokenOut, uint8 label))",
  "function poolCount() view returns (uint256)",
  "function isSealed() view returns (bool)",
  "function getAllPools() view returns (tuple(bytes32 routeId, address pair, address tokenIn, address tokenOut, uint8 label)[])",
] as const;

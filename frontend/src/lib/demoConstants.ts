/** Authorized demo minter — must match DeployAllDemo.s.sol DEFAULT_TEST_USER */
export const DEMO_TEST_USER = "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";

export const demoErc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function burn(uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

export const demoScenarioDeployerAbi = [
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
] as const;

export const demoPairAbi = [
  "function swap(uint256 amount0Out, uint256 amount1Out, address to) external",
] as const;

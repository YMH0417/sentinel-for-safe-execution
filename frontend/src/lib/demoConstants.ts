/** Authorized demo minter — must match DeployAllDemo.s.sol DEFAULT_TEST_USER */
export const DEMO_TEST_USER = "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";

export const demoErc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function burn(uint256 amount) external",
] as const;

export const demoScenarioDeployerAbi = [
  "function mintToken(address token, address to, uint256 amount) external",
  "function mintTokenToPool(address token, address pair, uint256 amount) external",
  "function burnTokenFromPool(address token, address pair, uint256 amount) external",
  "function authorizedMinters(address minter) view returns (bool)",
] as const;

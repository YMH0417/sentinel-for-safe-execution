import { getAddress } from "ethers";
import type { DemoDeploymentConfig, DemoTokenSymbol } from "./demoConfig.js";

const MONAD_TOKENS: Record<DemoTokenSymbol, string> = {
  USDC: "0xD52b74c0a6aB06D51e09a7eC19F5B379b9ea72aF",
  GOOD: "0x230e61ec5e90DeA10495afD4F0E8E1bCDeaD0951",
  BAD: "0x898675E5B15E374a573e6B6D3d56f85FA85c82B5",
  BAIT: "0xA26C06AaBdE448EF5598FE0d5B5a867057404585",
};

/** Build demo config from Vercel/production env when manifest file is unavailable. */
export function buildDemoConfigFromEnv(): DemoDeploymentConfig | null {
  const registry = process.env.DEMO_REGISTRY_ADDRESS?.trim();
  if (!registry) return null;

  const profile = process.env.DEMO_PROFILE?.trim() || "monad-testnet";
  const tokens: Partial<Record<DemoTokenSymbol, string>> = {};

  for (const sym of ["USDC", "GOOD", "BAD", "BAIT"] as const) {
    const fromEnv = process.env[`DEMO_TOKEN_${sym}`]?.trim();
    const raw =
      fromEnv || (profile === "monad-testnet" ? MONAD_TOKENS[sym] : undefined);
    if (raw) tokens[sym] = getAddress(raw.toLowerCase());
  }

  const chainIdRaw = process.env.DEMO_CHAIN_ID?.trim();
  const chainId = chainIdRaw ? Number(chainIdRaw) : profile === "monad-testnet" ? 10143 : 31337;

  const addr = (key: string, optional = true): string | undefined => {
    const v = process.env[key]?.trim();
    if (!v) return optional ? undefined : "";
    return getAddress(v.toLowerCase());
  };

  return {
    chainId,
    network: profile,
    deploymentTarget: profile === "monad-testnet" ? "remote" : "local",
    profile,
    deployer: addr("DEMO_DEPLOYER_ADDRESS") || addr("DEMO_REGISTRY_ADDRESS", false)!,
    agentSigner: addr("AGENT_SIGNER_ADDRESS") || addr("DEMO_REGISTRY_ADDRESS"),
    registry: getAddress(registry.toLowerCase()),
    vaultExecution: addr("VAULT_EXECUTION_ADDRESS"),
    swapRouter: addr("DEMO_SWAP_ROUTER_ADDRESS"),
    ledger: addr("DEMO_LEDGER_ADDRESS"),
    scenarioDeployer: addr("DEMO_SCENARIO_DEPLOYER"),
    testUser: addr("DEMO_TEST_USER_ADDRESS"),
    tokens,
    pools: [],
  };
}

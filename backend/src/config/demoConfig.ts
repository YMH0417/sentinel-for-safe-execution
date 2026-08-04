import * as fs from "fs";
import { getAddress } from "ethers";
import { parseRouteName, tokenSymbolFromKey } from "./demoRoutes.js";
import { resolveDefaultDeploymentPath } from "./demoProfile.js";

export type DemoTokenSymbol = "USDC" | "GOOD" | "BAD" | "BAIT";
export type DemoPoolLabel = "SAFE" | "SHALLOW" | "TOXIC" | "SDA";

export interface DemoPoolEntry {
  routeName: string;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  label: number;
  isReferencePool: boolean;
}

export interface DemoDeploymentConfig {
  chainId: number;
  network?: string;
  deploymentTarget?: "local" | "remote";
  profile?: string;
  deployer: string;
  agentSigner?: string;
  registry: string;
  vaultExecution?: string;
  swapRouter?: string;
  achievements?: string;
  scenarioDeployer?: string;
  testUser?: string;
  tokens: Partial<Record<DemoTokenSymbol, string>>;
  pools: DemoPoolEntry[];
}

const defaultDeploymentPath = resolveDefaultDeploymentPath();

let cachedConfig: DemoDeploymentConfig | null = null;

export function isDemoChainMode(): boolean {
  if (process.env.CHAIN_MODE?.trim().toLowerCase() === "mock") return false;
  return Boolean(process.env.DEMO_REGISTRY_ADDRESS?.trim() || process.env.DEMO_DEPLOYMENT_PATH?.trim() || hasDefaultDeploymentFile());
}

function hasDefaultDeploymentFile(): boolean {
  try {
    return fs.existsSync(defaultDeploymentPath);
  } catch {
    return false;
  }
}

export function loadDemoConfig(): DemoDeploymentConfig {
  if (cachedConfig) return cachedConfig;

  const deploymentPath =
    process.env.DEMO_DEPLOYMENT_PATH?.trim() || defaultDeploymentPath;

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Demo deployment file not found: ${deploymentPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(deploymentPath, "utf-8")) as DemoDeploymentConfig;

  const registry = process.env.DEMO_REGISTRY_ADDRESS?.trim() || raw.registry;
  if (!registry) {
    throw new Error("Demo registry address missing in deployment file and DEMO_REGISTRY_ADDRESS");
  }

  const tokens: Partial<Record<DemoTokenSymbol, string>> = { ...(raw.tokens ?? {}) };

  if (raw.tokens?.USDC) tokens.USDC = getAddress(raw.tokens.USDC.toLowerCase());
  if (raw.tokens?.GOOD) tokens.GOOD = getAddress(raw.tokens.GOOD.toLowerCase());
  if (raw.tokens?.BAD) tokens.BAD = getAddress(raw.tokens.BAD.toLowerCase());
  if (raw.tokens?.BAIT) tokens.BAIT = getAddress(raw.tokens.BAIT.toLowerCase());

  for (const pool of raw.pools ?? []) {
    const parsed = parseRouteName(pool.routeName);
    if (parsed) {
      const inSym = tokenSymbolFromKey(parsed.tokenInKey);
      const outSym = tokenSymbolFromKey(parsed.tokenOutKey);
      if (inSym && !tokens[inSym]) tokens[inSym] = getAddress(pool.tokenIn.toLowerCase());
      if (outSym && !tokens[outSym]) tokens[outSym] = getAddress(pool.tokenOut.toLowerCase());
    }
  }

  cachedConfig = {
    ...raw,
    registry: getAddress(registry),
    vaultExecution: raw.vaultExecution ? getAddress(raw.vaultExecution) : undefined,
    swapRouter: raw.swapRouter ? getAddress(raw.swapRouter) : undefined,
    achievements: raw.achievements ? getAddress(raw.achievements) : undefined,
    scenarioDeployer: raw.scenarioDeployer ? getAddress(raw.scenarioDeployer) : undefined,
    testUser: raw.testUser ? getAddress(raw.testUser) : undefined,
    agentSigner: raw.agentSigner ? getAddress(raw.agentSigner) : undefined,
    tokens,
    pools: (raw.pools ?? []).map((pool) => ({
      ...pool,
      pair: getAddress(pool.pair),
      tokenIn: getAddress(pool.tokenIn),
      tokenOut: getAddress(pool.tokenOut),
    })),
  };

  return cachedConfig;
}

export function resolveTokenSymbol(
  config: DemoDeploymentConfig,
  value: string
): DemoTokenSymbol | undefined {
  const normalized = value.trim().toUpperCase();
  if (normalized in config.tokens) {
    return normalized as DemoTokenSymbol;
  }
  return undefined;
}

export function getTokenAddress(config: DemoDeploymentConfig, symbol: DemoTokenSymbol): string {
  const address = config.tokens[symbol];
  if (!address) {
    throw new Error(`Token address missing for ${symbol}`);
  }
  return address;
}

export function labelFromNumber(label: number): DemoPoolLabel {
  if (label === 1) return "SHALLOW";
  if (label === 2) return "TOXIC";
  if (label === 3) return "SDA";
  return "SAFE";
}

export function clearDemoConfigCache(): void {
  cachedConfig = null;
}

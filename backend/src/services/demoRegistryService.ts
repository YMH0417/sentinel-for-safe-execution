import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { demoPoolRegistryAbi } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import {
  DemoDeploymentConfig,
  DemoPoolEntry,
  DemoTokenSymbol,
  labelFromNumber,
  loadDemoConfig,
} from "../config/demoConfig.js";
import { parseRouteName, routeNameFromRouteId, tokenSymbolFromKey } from "../config/demoRoutes.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

const LIVE_CONFIG_TTL_MS = 30_000;
let cachedLiveConfig: { config: DemoDeploymentConfig; fetchedAt: number } | null = null;

export function clearLiveDemoConfigCache(): void {
  cachedLiveConfig = null;
}

export async function hydrateDemoConfigFromChain(
  base: DemoDeploymentConfig
): Promise<DemoDeploymentConfig> {
  const provider = new JsonRpcProvider(getRpcUrl());
  const registry = new Contract(base.registry, demoPoolRegistryAbi, provider);

  const poolEntries = (await withRpcRetry(
    () => registry.getAllPools() as Promise<Array<{
      routeId: string;
      pair: string;
      tokenIn: string;
      tokenOut: string;
      label: number | bigint;
    }>>
  )) as Array<{
    routeId: string;
    pair: string;
    tokenIn: string;
    tokenOut: string;
    label: number | bigint;
  }>;

  const tokens: Partial<Record<DemoTokenSymbol, string>> = { ...base.tokens };
  const pools: DemoPoolEntry[] = poolEntries.map((entry) => {
    const routeName = routeNameFromRouteId(entry.routeId);
    return {
      routeName,
      pair: getAddress(entry.pair),
      tokenIn: getAddress(entry.tokenIn),
      tokenOut: getAddress(entry.tokenOut),
      label: Number(entry.label),
      isReferencePool: Number(entry.label) === 0,
    };
  });

  for (const pool of pools) {
    const parsed = parseRouteName(pool.routeName);
    if (!parsed) continue;
    const inSym = tokenSymbolFromKey(parsed.tokenInKey);
    const outSym = tokenSymbolFromKey(parsed.tokenOutKey);
    if (inSym) tokens[inSym] = pool.tokenIn;
    if (outSym) tokens[outSym] = pool.tokenOut;
  }

  return { ...base, tokens, pools };
}

export async function getLiveDemoConfig(): Promise<DemoDeploymentConfig> {
  if (
    cachedLiveConfig &&
    Date.now() - cachedLiveConfig.fetchedAt < LIVE_CONFIG_TTL_MS
  ) {
    return cachedLiveConfig.config;
  }
  const base = loadDemoConfig();
  const config = await hydrateDemoConfigFromChain(base);
  cachedLiveConfig = { config, fetchedAt: Date.now() };
  return config;
}

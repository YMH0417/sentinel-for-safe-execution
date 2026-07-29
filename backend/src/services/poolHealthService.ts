import { Contract, JsonRpcProvider } from "ethers";
import { demoPairAbi, demoPoolRegistryAbi } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { labelFromNumber, type DemoTokenSymbol } from "../config/demoConfig.js";
import { decimalsForSymbol, parseRouteName, tokenSymbolFromKey } from "../config/demoRoutes.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { getAmountOut, getPriceImpactBps, getSpotPriceHuman, toHumanAmount } from "./poolQuoteMath.js";

export interface PoolHealthEntry {
  routeId: string;
  routeName: string;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  poolLabel: string;
  reserveInHuman: number;
  reserveOutHuman: number;
  spotPrice: number;
  canSwap1Unit: boolean;
  priceImpactBps1Unit: number;
  status: "healthy" | "degraded" | "empty";
}

export interface PoolsHealthReport {
  registry: string;
  poolCount: number;
  healthy: number;
  degraded: number;
  empty: number;
  checkedAt: string;
  pools: PoolHealthEntry[];
}

async function readReserves(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenInAddress: string
): Promise<{ reserveIn: bigint; reserveOut: bigint }> {
  const pair = new Contract(pairAddress, demoPairAbi, provider);
  const token0 = (await pair.token0()) as string;
  const reserves = (await pair.getReserves()) as [bigint, bigint, number];
  const tokenInIsToken0 = token0.toLowerCase() === tokenInAddress.toLowerCase();
  return tokenInIsToken0
    ? { reserveIn: reserves[0], reserveOut: reserves[1] }
    : { reserveIn: reserves[1], reserveOut: reserves[0] };
}

function amountInRawForSymbol(symbol: string): bigint {
  return symbol === "USDC" ? 1_000_000n : 10n ** 18n;
}

export async function getPoolsHealth(): Promise<PoolsHealthReport> {
  const config = await getLiveDemoConfig();
  const provider = new JsonRpcProvider(getRpcUrl());
  const registry = new Contract(config.registry, demoPoolRegistryAbi, provider);
  const poolCount = Number(await registry.poolCount());

  const pools: PoolHealthEntry[] = [];
  let healthy = 0;
  let degraded = 0;
  let empty = 0;

  const entries = await Promise.all(
    config.pools.map(async (pool) => {
      const parsed = parseRouteName(pool.routeName);
      const tokenIn = parsed ? tokenSymbolFromKey(parsed.tokenInKey)! : "?";
      const tokenOut = parsed ? tokenSymbolFromKey(parsed.tokenOutKey)! : "?";
      const decIn = decimalsForSymbol(tokenIn as DemoTokenSymbol);
      const decOut = decimalsForSymbol(tokenOut as DemoTokenSymbol);

      let status: PoolHealthEntry["status"] = "healthy";
      let reserveInHuman = 0;
      let reserveOutHuman = 0;
      let spotPrice = 0;
      let canSwap1Unit = false;
      let priceImpactBps1Unit = 0;

      try {
        const { reserveIn, reserveOut } = await readReserves(provider, pool.pair, pool.tokenIn);
        reserveInHuman = toHumanAmount(reserveIn, decIn);
        reserveOutHuman = toHumanAmount(reserveOut, decOut);
        spotPrice = getSpotPriceHuman(reserveIn, reserveOut, decIn, decOut);

        const amountInRaw = amountInRawForSymbol(tokenIn);
        const quotedOut = getAmountOut(amountInRaw, reserveIn, reserveOut);
        canSwap1Unit = quotedOut > 0n;
        priceImpactBps1Unit = getPriceImpactBps(amountInRaw, reserveIn, reserveOut);

        if (!canSwap1Unit || reserveInHuman === 0 || reserveOutHuman === 0) {
          status = "empty";
        } else if (priceImpactBps1Unit > 500 || labelFromNumber(pool.label) !== "SAFE") {
          status = "degraded";
        } else {
          status = "healthy";
        }
      } catch {
        status = "empty";
      }

      return {
        routeId: pool.routeName,
        routeName: pool.routeName,
        pair: pool.pair,
        tokenIn,
        tokenOut,
        poolLabel: labelFromNumber(pool.label),
        reserveInHuman,
        reserveOutHuman,
        spotPrice,
        canSwap1Unit,
        priceImpactBps1Unit,
        status,
      } satisfies PoolHealthEntry;
    })
  );

  for (const entry of entries) {
    pools.push(entry);
    if (entry.status === "healthy") healthy++;
    else if (entry.status === "degraded") degraded++;
    else empty++;
  }

  return {
    registry: config.registry,
    poolCount,
    healthy,
    degraded,
    empty,
    checkedAt: new Date().toISOString(),
    pools,
  };
}

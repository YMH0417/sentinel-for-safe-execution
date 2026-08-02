import { Contract, JsonRpcProvider } from "ethers";
import { demoPoolRegistryAbi } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { labelFromNumber, type DemoTokenSymbol } from "../config/demoConfig.js";
import { decimalsForSymbol, parseRouteName, tokenSymbolFromKey } from "../config/demoRoutes.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { readSwapReserves, remoteRpcPace } from "./demoPairReadService.js";
import { withRpcRetry } from "../utils/rpcRetry.js";
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

function amountInRawForSymbol(symbol: string): bigint {
  return symbol === "USDC" ? 1_000_000n : 10n ** 18n;
}

export async function getPoolsHealth(): Promise<PoolsHealthReport> {
  const config = await getLiveDemoConfig();
  const provider = new JsonRpcProvider(getRpcUrl());
  const registry = new Contract(config.registry, demoPoolRegistryAbi, provider);
  const poolCount = Number(
    await withRpcRetry(() => registry.poolCount() as Promise<bigint>)
  );

  const pools: PoolHealthEntry[] = [];
  let healthy = 0;
  let degraded = 0;
  let empty = 0;

  for (const pool of config.pools) {
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
      const { reserveIn, reserveOut } = await readSwapReserves(
        provider,
        pool.pair,
        pool.tokenIn
      );
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

    const entry: PoolHealthEntry = {
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
    };
    pools.push(entry);
    if (entry.status === "healthy") healthy++;
    else if (entry.status === "degraded") degraded++;
    else empty++;

    await remoteRpcPace();
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

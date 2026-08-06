import { Contract, JsonRpcProvider } from "ethers";
import {
  DemoDeploymentConfig,
  DemoPoolLabel,
  DemoTokenSymbol,
  getTokenAddress,
  labelFromNumber,
  loadDemoConfig,
  resolveTokenSymbol,
} from "../config/demoConfig.js";
import {
  buildSafeRouteName,
  decimalsForSymbol,
  parseRouteName,
  tokenSymbolFromKey,
} from "../config/demoRoutes.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { getSwapProvider } from "../config/chainConfig.js";
import { Route, QuoteResponse } from "../types.js";
import {
  readSwapReserves,
  remoteRpcPace,
} from "./demoPairReadService.js";
import { withRpcRetry } from "../utils/rpcRetry.js";
import {
  getAmountOut,
  getPriceImpactBps,
  getSpotPriceHuman,
  toHumanAmount,
  toRawAmount,
} from "./poolQuoteMath.js";

const POOL_META: Record<
  DemoPoolLabel,
  { failureRate: number; basePoolRisk: number; supportsFallback: boolean }
> = {
  SAFE: { failureRate: 0.02, basePoolRisk: 12, supportsFallback: false },
  SHALLOW: { failureRate: 0.25, basePoolRisk: 55, supportsFallback: true },
  TOXIC: { failureRate: 0.35, basePoolRisk: 88, supportsFallback: true },
  SDA: { failureRate: 0.45, basePoolRisk: 90, supportsFallback: true },
};

export interface QuoteParams {
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
}

function buildRouteLabel(
  tokenIn: DemoTokenSymbol,
  tokenOut: DemoTokenSymbol,
  poolLabel: DemoPoolLabel
): string {
  return `${tokenIn} → ${tokenOut} @ ${poolLabel} Pool`;
}

function fallbackRouteId(routeName: string): string | null {
  const parsed = parseRouteName(routeName);
  if (!parsed) return null;
  return buildSafeRouteName(parsed.tokenInKey, parsed.tokenOutKey);
}

export function deriveWarningFlags(
  poolLabel: DemoPoolLabel,
  quotedOut: number,
  expectedOut: number,
  priceImpactBps: number
): string[] {
  const flags: string[] = [];
  if (poolLabel === "SHALLOW") {
    flags.push("shallow_pool");
  }
  if (priceImpactBps > 500) {
    flags.push("high_price_impact");
  }
  if (poolLabel === "TOXIC") {
    flags.push("toxic_pool");
  }
  if (poolLabel === "SDA") {
    flags.push("sda_pool");
    flags.push("execution_window_risk");
  }
  if (quotedOut > expectedOut * 1.001) {
    flags.push("suspicious_quote");
  }
  return flags;
}

function derivePoolRiskScore(poolLabel: DemoPoolLabel, priceImpactBps: number): number {
  const base = POOL_META[poolLabel].basePoolRisk;
  if (poolLabel === "SAFE") return Math.min(20, base + Math.round(priceImpactBps / 10));
  if (poolLabel === "SHALLOW") return Math.min(75, base + Math.round(priceImpactBps / 100));
  if (poolLabel === "SDA") return Math.min(95, base + Math.round(priceImpactBps / 20));
  return Math.min(95, base);
}

async function quotePool(
  provider: JsonRpcProvider,
  pool: DemoDeploymentConfig["pools"][number],
  amountInRaw: bigint,
  expectedOutHuman: number,
  tokenInSymbol: DemoTokenSymbol,
  tokenOutSymbol: DemoTokenSymbol
): Promise<Route> {
  const decIn = decimalsForSymbol(tokenInSymbol);
  const decOut = decimalsForSymbol(tokenOutSymbol);
  const { reserveIn, reserveOut } = await readSwapReserves(
    provider,
    pool.pair,
    pool.tokenIn
  );
  const quotedOutRaw = getAmountOut(amountInRaw, reserveIn, reserveOut);
  const quotedOut = toHumanAmount(quotedOutRaw, decOut);
  const priceImpactBps = getPriceImpactBps(amountInRaw, reserveIn, reserveOut);
  const spotPrice = getSpotPriceHuman(reserveIn, reserveOut, decIn, decOut);
  const poolLabel = labelFromNumber(pool.label);
  const meta = POOL_META[poolLabel];

  return {
    routeId: pool.routeName,
    label: buildRouteLabel(tokenInSymbol, tokenOutSymbol, poolLabel),
    tokenIn: tokenInSymbol,
    tokenOut: tokenOutSymbol,
    amountIn: toHumanAmount(amountInRaw, decIn),
    quotedOut: Number(quotedOut.toFixed(6)),
    expectedOut: Number(expectedOutHuman.toFixed(6)),
    spotPrice: Number(spotPrice.toFixed(6)),
    priceImpactBps,
    poolLabel,
    poolRiskScore: derivePoolRiskScore(poolLabel, priceImpactBps),
    historicalFailureRate: meta.failureRate,
    supportsFallback: meta.supportsFallback,
    fallbackRouteId: meta.supportsFallback ? fallbackRouteId(pool.routeName) : null,
    warningFlags: deriveWarningFlags(poolLabel, quotedOut, expectedOutHuman, priceImpactBps),
    pairAddress: pool.pair,
    isReferencePool: pool.isReferencePool,
  };
}

function poolsForPair(
  config: DemoDeploymentConfig,
  tokenInAddress: string,
  tokenOutAddress: string
): DemoDeploymentConfig["pools"] {
  return config.pools.filter(
    (pool) =>
      pool.tokenIn.toLowerCase() === tokenInAddress.toLowerCase() &&
      pool.tokenOut.toLowerCase() === tokenOutAddress.toLowerCase()
  );
}

export async function getChainQuote(params: QuoteParams = {}): Promise<QuoteResponse> {
  const config = await getLiveDemoConfig();
  const provider = getSwapProvider();

  const tokenInSymbol = resolveTokenSymbol(config, params.tokenIn ?? "USDC") ?? "USDC";
  const tokenOutSymbol = resolveTokenSymbol(config, params.tokenOut ?? "GOOD") ?? "GOOD";
  const amountInHuman = params.amountIn ?? 100;

  if (tokenInSymbol === tokenOutSymbol) {
    throw new Error("tokenIn and tokenOut must be different");
  }

  const tokenInAddress = getTokenAddress(config, tokenInSymbol);
  const tokenOutAddress = getTokenAddress(config, tokenOutSymbol);
  const decIn = decimalsForSymbol(tokenInSymbol);
  const amountInRaw = toRawAmount(amountInHuman, decIn);

  const candidatePools = poolsForPair(config, tokenInAddress, tokenOutAddress);
  if (candidatePools.length === 0) {
    throw new Error(`No demo pools found for ${tokenInSymbol} → ${tokenOutSymbol}`);
  }

  const referencePool =
    candidatePools.find((pool) => pool.isReferencePool) ??
    candidatePools.find((pool) => pool.label === 0);
  if (!referencePool) {
    throw new Error(`Reference pool missing for ${tokenInSymbol} → ${tokenOutSymbol}`);
  }

  const decOut = decimalsForSymbol(tokenOutSymbol);
  const { reserveIn: refIn, reserveOut: refOut } = await readSwapReserves(
    provider,
    referencePool.pair,
    tokenInAddress
  );
  const referenceOutRaw = getAmountOut(amountInRaw, refIn, refOut);
  const referencePrice = getSpotPriceHuman(refIn, refOut, decIn, decOut);
  const expectedOutHuman = toHumanAmount(referenceOutRaw, decOut);

  const routes: Route[] = [];
  for (const pool of candidatePools) {
    routes.push(
      await quotePool(
        provider,
        pool,
        amountInRaw,
        expectedOutHuman,
        tokenInSymbol,
        tokenOutSymbol
      )
    );
    await remoteRpcPace();
  }

  routes.sort((a, b) => b.quotedOut - a.quotedOut);

  const bestQuotedRouteId = routes[0]?.routeId ?? "";
  const recommendedRoute =
    routes.find((route) => route.poolLabel === "SAFE") ??
    routes.find((route) => route.isReferencePool) ??
    routes[routes.length - 1];

  return {
    tokenIn: tokenInSymbol,
    tokenOut: tokenOutSymbol,
    amountIn: amountInHuman,
    referencePriceSource: `${tokenInSymbol}_${tokenOutSymbol}_SAFE_POOL_SPOT`,
    referencePrice: Number(referencePrice.toFixed(6)),
    bestQuotedRouteId,
    recommendedRouteId: recommendedRoute?.routeId ?? bestQuotedRouteId,
    routes,
  };
}

export async function getChainRouteById(
  routeId: string,
  params: QuoteParams = {}
): Promise<Route | undefined> {
  const quoteParams = inferQuoteParamsFromRouteId(routeId, params);
  const config = await getLiveDemoConfig();
  const pool = config.pools.find((entry) => entry.routeName === routeId);
  if (!pool) {
    const quote = await getChainQuote(quoteParams);
    return quote.routes.find((route) => route.routeId === routeId);
  }

  const provider = getSwapProvider();
  const tokenInSymbol = resolveTokenSymbol(config, quoteParams.tokenIn ?? "USDC") ?? "USDC";
  const tokenOutSymbol = resolveTokenSymbol(config, quoteParams.tokenOut ?? "GOOD") ?? "GOOD";
  const amountInHuman = quoteParams.amountIn ?? 100;
  const tokenInAddress = getTokenAddress(config, tokenInSymbol);
  const tokenOutAddress = getTokenAddress(config, tokenOutSymbol);
  const decIn = decimalsForSymbol(tokenInSymbol);
  const amountInRaw = toRawAmount(amountInHuman, decIn);

  const pairPools = poolsForPair(config, tokenInAddress, tokenOutAddress);
  const referencePool =
    pairPools.find((entry) => entry.isReferencePool) ??
    pairPools.find((entry) => entry.label === 0);
  if (!referencePool) {
    const quote = await getChainQuote(quoteParams);
    return quote.routes.find((route) => route.routeId === routeId);
  }

  const decOut = decimalsForSymbol(tokenOutSymbol);
  const { reserveIn: refIn, reserveOut: refOut } = await readSwapReserves(
    provider,
    referencePool.pair,
    tokenInAddress
  );
  const referenceOutRaw = getAmountOut(amountInRaw, refIn, refOut);
  const expectedOutHuman = toHumanAmount(referenceOutRaw, decOut);

  return quotePool(
    provider,
    pool,
    amountInRaw,
    expectedOutHuman,
    tokenInSymbol,
    tokenOutSymbol
  );
}

/** Matches DemoPoolRegistry.TokenRiskTag — static for sealed demo tokens. */
export const DEMO_TOKEN_RISK_TAGS: Record<DemoTokenSymbol, number> = {
  USDC: 0,
  GOOD: 0,
  BAD: 1,
  BAIT: 2,
};

const tokenRiskTagCache = new Map<string, number>();

export async function getTokenRiskTag(tokenOutSymbol: DemoTokenSymbol): Promise<number> {
  const config = await getLiveDemoConfig();
  const tokenAddress = getTokenAddress(config, tokenOutSymbol);
  const cacheKey = tokenAddress.toLowerCase();
  const cached = tokenRiskTagCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fallback = DEMO_TOKEN_RISK_TAGS[tokenOutSymbol] ?? 0;
  try {
    await remoteRpcPace();
    const registry = new Contract(config.registry, [
      "function tokenRiskTag(address token) view returns (uint8)",
    ], getSwapProvider());
    const tag = Number(
      await withRpcRetry(() => registry.tokenRiskTag(tokenAddress) as Promise<bigint>)
    );
    tokenRiskTagCache.set(cacheKey, tag);
    return tag;
  } catch {
    tokenRiskTagCache.set(cacheKey, fallback);
    return fallback;
  }
}

export function inferQuoteParamsFromRouteId(routeId: string, params: QuoteParams = {}): QuoteParams {
  const parsed = parseRouteName(routeId);
  if (!parsed) return params;
  const tokenIn = tokenSymbolFromKey(parsed.tokenInKey);
  const tokenOut = tokenSymbolFromKey(parsed.tokenOutKey);
  return {
    tokenIn: params.tokenIn ?? tokenIn,
    tokenOut: params.tokenOut ?? tokenOut,
    amountIn: params.amountIn ?? 100,
  };
}

export { loadDemoConfig };

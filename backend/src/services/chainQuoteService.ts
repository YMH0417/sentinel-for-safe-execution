import { Contract, JsonRpcProvider } from "ethers";
import { demoPairAbi } from "../abi/demoAbis.js";
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
import { getRpcUrl } from "../config/chainConfig.js";
import { Route, QuoteResponse } from "../types.js";
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
  if (quotedOut > expectedOut * 1.001) {
    flags.push("suspicious_quote");
  }
  return flags;
}

function derivePoolRiskScore(poolLabel: DemoPoolLabel, priceImpactBps: number): number {
  const base = POOL_META[poolLabel].basePoolRisk;
  if (poolLabel === "SAFE") return Math.min(20, base + Math.round(priceImpactBps / 10));
  if (poolLabel === "SHALLOW") return Math.min(75, base + Math.round(priceImpactBps / 100));
  return Math.min(95, base);
}

async function readSwapReserves(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenInAddress: string
): Promise<{ reserveIn: bigint; reserveOut: bigint; token0: string }> {
  const pair = new Contract(pairAddress, demoPairAbi, provider);
  const [token0, reserves] = await Promise.all([
    pair.token0() as Promise<string>,
    pair.getReserves() as Promise<[bigint, bigint, number]>,
  ]);
  const reserve0 = reserves[0];
  const reserve1 = reserves[1];
  const tokenInIsToken0 = token0.toLowerCase() === tokenInAddress.toLowerCase();
  return tokenInIsToken0
    ? { reserveIn: reserve0, reserveOut: reserve1, token0 }
    : { reserveIn: reserve1, reserveOut: reserve0, token0 };
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
  const provider = new JsonRpcProvider(getRpcUrl());

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

  const routes = await Promise.all(
    candidatePools.map((pool) =>
      quotePool(
        provider,
        pool,
        amountInRaw,
        expectedOutHuman,
        tokenInSymbol,
        tokenOutSymbol
      )
    )
  );

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
  const quote = await getChainQuote(quoteParams);
  return quote.routes.find((route) => route.routeId === routeId);
}

export async function getTokenRiskTag(tokenOutSymbol: DemoTokenSymbol): Promise<number> {
  const config = await getLiveDemoConfig();
  const provider = new JsonRpcProvider(getRpcUrl());
  const registry = new Contract(config.registry, [
    "function tokenRiskTag(address token) view returns (uint8)",
  ], provider);
  const tokenAddress = getTokenAddress(config, tokenOutSymbol);
  return Number(await registry.tokenRiskTag(tokenAddress));
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

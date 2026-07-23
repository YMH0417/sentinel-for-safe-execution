// shared/types/route.ts — Route 统一类型定义（全队共享）

export interface Route {
  routeId: string;
  label: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  quotedOut: number;
  expectedOut: number;
  poolRiskScore: number;
  historicalFailureRate: number;
  supportsFallback: boolean;
  fallbackRouteId: string | null;
  warningFlags: string[];
}

export interface QuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  routes: Route[];
}

export function createMockRoutes(): Route[] {
  return [
    {
      routeId: "route-a",
      label: "Healthy SIA Route (Base↔Arbitrum)",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 998,
      expectedOut: 1000,
      poolRiskScore: 15,
      historicalFailureRate: 0.02,
      supportsFallback: false,
      fallbackRouteId: null,
      warningFlags: [],
    },
    {
      routeId: "route-b",
      label: "SDA Bridge Delay Route (Ethereum→Scroll)",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 920,
      expectedOut: 1000,
      poolRiskScore: 90,
      historicalFailureRate: 0.45,
      supportsFallback: true,
      fallbackRouteId: "route-a",
      warningFlags: ["high_quote_deviation", "high_failure_rate", "high_pool_risk"],
    },
    {
      routeId: "route-c",
      label: "Moderate Pool with Sandwich Risk (Base↔Optimism)",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 960,
      expectedOut: 1000,
      poolRiskScore: 90,
      historicalFailureRate: 0.25,
      supportsFallback: true,
      fallbackRouteId: "route-a",
      warningFlags: ["quote_deviation", "failure_risk", "pool_risk"],
    },
  ];
}

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
      label: "Safe Pool Route",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 999,
      expectedOut: 1000,
      poolRiskScore: 15,
      historicalFailureRate: 0.02,
      supportsFallback: false,
      fallbackRouteId: null,
      warningFlags: [],
    },
    {
      routeId: "route-b",
      label: "Risky Pool Route",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 800,
      expectedOut: 1000,
      poolRiskScore: 85,
      historicalFailureRate: 0.42,
      supportsFallback: true,
      fallbackRouteId: "route-a",
      warningFlags: ["high_quote_deviation", "high_failure_rate"],
    },
    {
      routeId: "route-c",
      label: "Moderate Route with Fallback",
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: 1000,
      quotedOut: 960,
      expectedOut: 1000,
      poolRiskScore: 55,
      historicalFailureRate: 0.25,
      supportsFallback: true,
      fallbackRouteId: "route-a",
      warningFlags: ["moderate_quote_deviation"],
    },
  ];
}

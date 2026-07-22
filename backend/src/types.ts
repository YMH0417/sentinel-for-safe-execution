// backend/src/types.ts — 从 shared 引入的完整类型定义

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
  expectedDecision?: string;
}

export interface QuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  routes: Route[];
}

export type DecisionType = "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";

export interface Decision {
  decision: DecisionType;
  riskScore: number;
  reason: string;
  routeId: string;
  fallbackRouteId: string | null;
  flags: string[];
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: "normal" | "conservative" | "aggressive";
}

export interface ExecuteRequest {
  routeId: string;
  maxLossBps: number;
  deadline: number;
  contractAddress?: string;
}

export interface Event {
  id: string;
  eventType: string;
  timestamp: number;
  routeId?: string;
  decision?: string;
  riskScore?: number;
  message: string;
  txHash?: string;
}

export interface RiskConfig {
  profiles: {
    normal: { maxLossBps: number; maxQuoteDeviationThreshold: number; failureThreshold: number; poolRiskThreshold: number };
    conservative: { maxLossBps: number; maxQuoteDeviationThreshold: number; failureThreshold: number; poolRiskThreshold: number };
    aggressive: { maxLossBps: number; maxQuoteDeviationThreshold: number; failureThreshold: number; poolRiskThreshold: number };
  };
  defaultProfile: string;
  paused: boolean;
}

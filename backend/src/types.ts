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
export type EventType =
  | "RouteEvaluated"
  | "DecisionMade"
  | "ExecutionAttempted"
  | "ExecutionSuccess"
  | "ExecutionRejected"
  | "FallbackRequired";

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

export type ContractDecision = 0 | 1 | 2;

export interface ExecutionPermit {
  user: string;
  routeId: string;
  amountIn: string;
  amountOutQuoted: string;
  deadline: string;
  riskScore: string;
  decision: ContractDecision;
  nonce: string;
}

export interface ExecuteRequest {
  evaluation: Decision;
  permit: ExecutionPermit;
  signature: string;
}

export interface Event {
  id: string;
  eventType: EventType;
  timestamp: number;
  routeId?: string;
  decision?: DecisionType;
  riskScore?: number;
  fallbackRouteId?: string;
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

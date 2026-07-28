// frontend/src/types.ts  — 本地类型定义（避免引用 shared 路径问题）

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
  referencePriceSource?: string;
  referencePrice?: number;
  bestQuotedRouteId?: string;
  recommendedRouteId?: string;
}

export type DecisionType = "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
export type ContractDecision = 0 | 1 | 2;

export interface Decision {
  decision: DecisionType;
  riskScore: number;
  reason: string;
  routeId: string;
  fallbackRouteId: string | null;
  flags: string[];
}

export interface Event {
  id: string;
  eventType: string;
  timestamp: number;
  routeId?: string;
  decision?: DecisionType;
  riskScore?: number;
  message: string;
  txHash?: string;
  fallbackRouteId?: string;
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: string;
}

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

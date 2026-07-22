// frontend/src/types.ts — 本地类型定义（避免引用 shared 路径问题）

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

export interface Decision {
  decision: "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
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
  decision?: string;
  riskScore?: number;
  message: string;
  txHash?: string;
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: string;
}

export interface ExecuteRequest {
  routeId: string;
  maxLossBps: number;
  deadline: number;
}

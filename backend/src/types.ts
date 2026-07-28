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
  spotPrice?: number;
  priceImpactBps?: number;
  poolLabel?: string;
  pairAddress?: string;
  isReferencePool?: boolean;
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
export type EventType =
  | "RouteEvaluated"
  | "DecisionMade"
  | "ExecutionAttempted"
  | "ExecutionSuccess"
  | "ExecutionRejected"
  | "FallbackRequired"
  | "SwapExecuted"
  | "SwapFailed"
  | "SwapBatchCompleted";

export interface Decision {
  decision: DecisionType;
  riskScore: number;
  reason: string;
  reasonTechnical?: string;
  routeId: string;
  fallbackRouteId: string | null;
  flags: string[];
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: "normal" | "conservative" | "aggressive";
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
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
  maxSlippageBps?: number;
}

export interface TokenBalance {
  symbol: string;
  address: string;
  raw: string;
  human: number;
}

export interface SwapRequest {
  routeId: string;
  amountIn: number;
  tokenIn?: string;
  tokenOut?: string;
  recipient?: string;
  skipEvaluate?: boolean;
  force?: boolean;
  configProfile?: "normal" | "conservative" | "aggressive";
  useRouter?: boolean;
}

export interface SwapResult {
  success: boolean;
  routeId: string;
  requestedRouteId?: string;
  executedRouteId?: string;
  agentDecision?: DecisionType;
  executionMode?: "router" | "direct";
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  quotedOut: number;
  actualOut: number;
  amountOutMin?: number;
  slippageBps?: number;
  recipient: string;
  pairAddress: string;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  balancesBefore: Partial<Record<string, TokenBalance>>;
  balancesAfter: Partial<Record<string, TokenBalance>>;
  balanceDelta: Partial<Record<string, number>>;
}

export interface SwapBatchResult {
  passed: number;
  failed: number;
  total: number;
  results: SwapResult[];
  errors: Array<{ routeId: string; error: string }>;
}

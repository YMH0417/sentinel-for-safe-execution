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
  notes?: string;
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
  evidence?: DecisionEvidence;
  /** Joins evaluate and execute events when the decision is sent back. */
  correlationId?: string;
}

export interface DecisionEvidence {
  quotedOut: number;
  expectedOut: number;
  quoteDeviation: number;
  historicalFailureRate: number;
  poolRiskScore: number;
  priceImpactBps?: number;
  poolLabel?: string;
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: "normal" | "conservative" | "aggressive";
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
}

export interface SafetyExplanation {
  narrative: string;
  source: "llm" | "local-post-train";
  model: string;
  generatedAt: string;
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
  schemaVersion?: number;
  source?: string;
  eventType: EventType;
  timestamp: number;
  routeId?: string;
  decision?: DecisionType;
  riskScore?: number;
  fallbackRouteId?: string;
  message: string;
  txHash?: string;
  context?: EventContext;
}

/**
 * Optional structured evidence attached to an event.
 *
 * The original event fields remain unchanged for frontend compatibility.
 * Analytics use this context instead of trying to recover facts from `message`.
 */
export interface EventContext {
  correlationId?: string;
  account?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
  amountInRaw?: string;
  quotedOut?: number;
  quotedOutRaw?: string;
  actualOut?: number;
  amountOutMin?: number;
  slippageBps?: number;
  expectedOut?: number;
  quoteDeviation?: number;
  historicalFailureRate?: number;
  poolRiskScore?: number;
  priceImpactBps?: number;
  gasUsed?: string;
  blockNumber?: number;
  executionMode?: "router" | "direct" | "vault" | "mock";
  safetyMode?: "safe" | "force" | "evaluate" | "vault";
  requestedRouteId?: string;
  executedRouteId?: string;
  pairAddress?: string;
  poolLabel?: string;
  configProfile?: "normal" | "conservative" | "aggressive";
  flags?: string[];
  errorCode?: string;
  failureStage?:
    | "evaluation"
    | "precondition"
    | "execution"
    | "configuration";
  prevented?: boolean;
  chainMode?: "mock" | "demo" | "rpc";
  batchPassed?: number;
  batchFailed?: number;
  batchTotal?: number;
  [key: string]: unknown;
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
  /** Server-generated identifier used to join events from one operation. */
  correlationId?: string;
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

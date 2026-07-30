// shared/types/event.ts — Event 统一类型定义（全队共享）

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
  [key: string]: unknown;
}

export interface Event {
  id: string;
  schemaVersion?: number;
  source?: string;
  eventType:
    | "RouteEvaluated"
    | "DecisionMade"
    | "ExecutionAttempted"
    | "ExecutionSuccess"
    | "ExecutionRejected"
    | "FallbackRequired"
    | "SwapExecuted"
    | "SwapFailed"
    | "SwapBatchCompleted";
  timestamp: number;
  routeId?: string;
  decision?: "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
  riskScore?: number;
  fallbackRouteId?: string;
  message: string;
  txHash?: string;
  context?: EventContext;
}

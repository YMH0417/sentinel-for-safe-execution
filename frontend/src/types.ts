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
  poolLabel?: string;
  priceImpactBps?: number;
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
  correlationId?: string;
  evidence?: {
    quotedOut: number;
    expectedOut: number;
    quoteDeviation: number;
    historicalFailureRate: number;
    poolRiskScore: number;
    priceImpactBps?: number;
    poolLabel?: string;
  };
}

export interface Event {
  id: string;
  schemaVersion?: number;
  source?: string;
  eventType: string;
  timestamp: number;
  routeId?: string;
  decision?: DecisionType;
  riskScore?: number;
  message: string;
  txHash?: string;
  fallbackRouteId?: string;
  context?: {
    correlationId?: string;
    account?: string;
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: number;
    quotedOut?: number;
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
    poolLabel?: string;
    errorCode?: string;
    failureStage?:
      | "evaluation"
      | "precondition"
      | "execution"
      | "configuration";
    prevented?: boolean;
    chainMode?: "mock" | "demo" | "rpc";
    [key: string]: unknown;
  };
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

export interface SwapResult {
  success: boolean;
  routeId: string;
  requestedRouteId?: string;
  executedRouteId?: string;
  agentDecision?: DecisionType;
  agentBypassed?: boolean;
  safetyMode?: "safe" | "force";
  poolLabel?: string;
  executionMode?: "router" | "direct";
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  quotedOut: number;
  expectedOut?: number;
  actualOut: number;
  txHash: string;
  recipient: string;
  gasUsed?: string;
  balanceDelta?: Partial<Record<string, number>>;
  failureCode?: string;
  failureMessage?: string;
  amountOutMin?: number;
  amountOutMax?: number;
  slippageBps?: number;
  /** true = reverted on-chain (gas spent); false/undefined = blocked before broadcast */
  onChainFailure?: boolean;
  sdaExecutionWindow?: boolean;
  sdaWindowSeconds?: number;
  sdaWaitedSeconds?: number;
  sdaOpenTxHash?: string;
  sdaReadyAt?: number;
  quotedOutAtOpen?: number;
}

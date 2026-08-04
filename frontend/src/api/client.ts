import type { Decision, Event, SwapResult } from "../types";
import { parseApiError } from "../lib/apiError";
import { fetchJson, TimeoutError } from "../lib/withTimeout";

const API = "/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(parseApiError(data.error, "Request failed"));
  return data as T;
}

export interface DebugStatus {
  chainMode: string;
  expectedChainId?: number;
  chainName?: string;
  anvilRpcUrl?: string;
  demoRpcUrl?: string;
  demoProfile?: string | null;
  deploymentTarget?: string | null;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  swapRouter?: string;
  routerSwapAvailable?: boolean;
  demoPoolCount?: number;
  eventCount?: number;
  poolsHealthCache?: {
    ready: boolean;
    warming: boolean;
    cachedAt: string | null;
    ageMs: number | null;
    ttlMs: number;
    error: string | null;
  };
}

export interface DemoProfileListItem {
  name: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeSymbol: string;
  deploymentTarget: "local" | "remote";
  manifestPath: string;
  manifestExists: boolean;
  active: boolean;
}

export interface DemoProfileSwitchResult {
  profile: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  deploymentTarget: "local" | "remote";
  warnings: string[];
}

export interface PoolHealthEntry {
  routeId: string;
  routeName: string;
  poolLabel: string;
  status: "healthy" | "degraded" | "empty";
  priceImpactBps1Unit: number;
  tokenIn: string;
  tokenOut: string;
}

export interface PoolsHealthReport {
  healthy: number;
  degraded: number;
  empty: number;
  poolCount: number;
  pools: PoolHealthEntry[];
}

export interface TokenBalance {
  symbol: string;
  human: number;
}

export interface SafetyExplanation {
  narrative: string;
  attackVector?: string;
  recommendations?: string[];
  confidence?: number;
  source: "llm" | "local-post-train";
  model: string;
  generatedAt: string;
}

export interface LlmSettingsView {
  envFile: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  baseUrl: string;
  model: string;
  enabled: boolean;
  responseLanguage: "en" | "zh";
}

export interface OnChainBadgeTier {
  tier: number;
  unlocked: boolean;
}

export interface OnChainAchievements {
  address: string;
  achievementsContract: string;
  checkCount: number;
  safeSwapCount: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
  badges: OnChainBadgeTier[];
}

export interface DemoSupplyOverview {
  scenarioDeployer: string;
  testUser: string;
  holder: string;
  testUserIsAuthorizedMinter: boolean;
  tokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
    totalSupplyHuman: number;
    deployerInventoryHuman: number;
    holderBalanceHuman: number;
  }>;
  pools: Array<{
    routeName: string;
    pair: string;
    tokenIn: string;
    tokenOut: string;
    token0Symbol: string;
    token1Symbol: string;
    reserve0Human: number;
    reserve1Human: number;
    label: string;
  }>;
}

export interface RiskConfig {
  defaultProfile: string;
  paused: boolean;
  maxSlippageBps?: number;
  maxUnsafeSlippageBps?: number;
  profiles?: Record<string, unknown>;
}

export interface NumberStatistics {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  sum: number;
}

export interface AnalysisReport {
  metadata: {
    context: string;
    definitionVersion: string;
    generatedAt: string;
    sources: string[];
  };
  quality: {
    receivedRows: number;
    parsedRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    validRate: number;
    issues: Array<{
      code: string;
      severity: "error" | "warning";
      field?: string;
      count: number;
    }>;
    coverage: Record<
      string,
      { present: number; total: number; rate: number }
    >;
  };
  summary: {
    timeRange: { from: string; to: string } | null;
    categoryCounts: Record<string, number>;
    outcomeCounts: Record<string, number>;
    uniqueEntities: number;
    uniqueActors: number;
    score?: NumberStatistics;
    dimensionCounts: Record<string, Record<string, number>>;
    metrics: Record<string, NumberStatistics>;
  };
  trends: Array<{
    date: string;
    count: number;
    categoryCounts: Record<string, number>;
    outcomeCounts: Record<string, number>;
  }>;
  entities: Array<{
    entityId: string;
    count: number;
    outcomeCounts: Record<string, number>;
    averageScore?: number;
  }>;
  insights: {
    decisions?: {
      total: number;
      allow: number;
      reject: number;
      fallback: number;
      previewEvaluations: number;
      unclassified: number;
      interventionRate: number | null;
    };
    riskFactors?: {
      quoteDeviation: NumberStatistics | null;
      historicalFailureRate: NumberStatistics | null;
      poolRiskScore: NumberStatistics | null;
      priceImpactBps: NumberStatistics | null;
    };
    execution?: {
      attemptEvents: number;
      swapAttempts: number;
      swapsSucceeded: number;
      swapsFailed: number;
      swapSuccessRate: number | null;
      executionFailures: number;
      preventedByAgent: number;
      preconditionFailures: number;
      configurationFailures: number;
      unclassifiedFailures: number;
      protectedSwapsSucceeded: number;
      forcedSwapsSucceeded: number;
      vaultSucceeded: number;
      vaultRejected: number;
      usdcInputVolume: number;
      forcedUsdcInputVolume: number;
      gasUsed: NumberStatistics | null;
      forcedBypassEvents: number;
      forcedBypassOperations: number;
    };
    workflow?: {
      correlatedOperations: number;
      completedOperations: number;
      failedOrRejectedOperations: number;
      fallbackOperations: number;
      uncorrelatedEvents: number;
    };
    evidence?: {
      successfulSwapsWithQuoteAndActual: number;
      richSwapEvidenceRate: number | null;
      productionSuccessfulSwapsWithQuoteAndActual: number;
      productionRichSwapEvidenceRate: number | null;
      decisionEvidenceRate: number | null;
      uniqueAccounts: number;
      activeDays: number;
      readinessCriteria: Record<
        string,
        { actual: number | null; required: number; met: boolean }
      >;
      sufficientForHistoricalClaims: boolean;
      assessment: string;
    };
  };
}

export const api = {
  debugStatus: () => getJson<DebugStatus>("/debug/status"),
  listDemoProfiles: () =>
    getJson<{ profiles: DemoProfileListItem[] }>("/demo/profiles"),
  switchDemoProfile: (profile: string) =>
    fetch(`${API}/demo/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "切换 demo profile 失败"));
      return data as DemoProfileSwitchResult;
    }),
  events: async () => {
    const data = await getJson<{ events: Event[] }>("/events");
    return data.events ?? [];
  },
  analysis: () => getJson<AnalysisReport>("/analysis"),
  poolsHealth: (opts?: { force?: boolean }) =>
    getJson<PoolsHealthReport & { cache?: unknown }>(
      `/debug/pools-health${opts?.force ? "?refresh=true" : ""}`
    ).then(({ cache: _cache, ...report }) => report),
  warmCache: () =>
    fetch(`${API}/debug/warm-cache`, { method: "POST" }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "Warm cache failed"));
      return data as { warmed: boolean; cache?: DebugStatus["poolsHealthCache"] };
    }),
  riskConfig: () => getJson<RiskConfig>("/config"),
  balances: (address: string) =>
    getJson<{ address: string; balances: Record<string, TokenBalance> }>(
      `/swap/balances/${address}`
    ),
  demoSupply: (holder: string) =>
    getJson<DemoSupplyOverview>(`/demo/supply?holder=${encodeURIComponent(holder)}`),
  demoAchievements: (address: string) =>
    getJson<OnChainAchievements>(`/demo/achievements/${encodeURIComponent(address)}`),
  quote: (tokenIn: string, tokenOut: string, amount: string) =>
    getJson<{ routes: import("../types").Route[]; referencePrice?: number; recommendedRouteId?: string }>(
      `/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}`
    ),
  evaluate: (body: object) =>
    fetch(`${API}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "Evaluate failed"));
      return data as Decision;
    }),
  swapSafe: (body: object) =>
    fetch(`${API}/swap/safe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "Swap failed"));
      return data as SwapResult;
    }),
  swapForce: (body: object) =>
    fetch(`${API}/swap/force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "Swap failed"));
      return data as SwapResult;
    }),
  aiAlertAnalysis: async (eventId?: string) => {
    try {
      const { res, data } = await fetchJson<SafetyExplanation & { error?: unknown }>(
        `${API}/ai-alert-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventId ? { eventId } : {}),
        },
        15_000
      );
      if (!res.ok) {
        throw new Error(parseApiError(data.error, "AI 分析调用失败"));
      }
      return data as SafetyExplanation;
    } catch (error) {
      if (
        error instanceof TimeoutError ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new Error("AI 分析等待超时，大模型响应较慢，请稍后重试");
      }
      throw error;
    }
  },
  getLlmSettings: () => getJson<LlmSettingsView>("/settings/llm"),
  saveLlmSettings: (body: {
    apiKey?: string;
    clearApiKey?: boolean;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
    responseLanguage?: "en" | "zh";
  }) =>
    fetch(`${API}/settings/llm`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "保存 LLM 配置失败"));
      return data as LlmSettingsView;
    }),
};

export function computeSecurityScore(events: Event[], poolReport?: PoolsHealthReport): number {
  let score = 85;
  const recent = events.slice(-20);
  for (const e of recent) {
    if (e.eventType.includes("Reject") || e.eventType === "SwapFailed") score -= 8;
    if (e.decision === "FALLBACK_TO_SAFE_ROUTE") score -= 3;
  }
  if (poolReport && poolReport.poolCount > 0) {
    const poolScore = Math.round((poolReport.healthy / poolReport.poolCount) * 100);
    score = Math.round(score * 0.6 + poolScore * 0.4);
  }
  return Math.max(0, Math.min(100, score));
}

export function computeUserStats(events: Event[]) {
  const safeSwaps = events.filter(
    (e) => e.eventType === "ExecutionSuccess" || e.eventType === "SwapExecuted"
  );
  const rejects = events.filter(
    (e) => e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed"
  );
  const fallbacks = events.filter(
    (e) => e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")
  );
  return {
    swapCount: safeSwaps.length,
    rejectCount: rejects.length,
    fallbackCount: fallbacks.length,
    safeVolumeUsd: safeSwaps.reduce((total, event) => {
      if (event.context?.tokenIn !== "USDC") return total;
      return total + (event.context.amountIn ?? 0);
    }, 0),
  };
}

export interface ScoreLegend {
  highRisk: number;
  strategy: number;
  warning: number;
}

export function computeScoreLegend(events: Event[], poolReport?: PoolsHealthReport): ScoreLegend {
  const recent = events.slice(-30);
  const highRiskEvents = recent.filter(
    (e) => e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed"
  ).length;
  const strategyEvents = recent.filter(
    (e) => e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")
  ).length;
  const warningEvents = recent.filter(
    (e) => e.eventType.includes("Warn") || e.decision === "ALLOW" && (e.riskScore ?? 0) >= 40
  ).length;

  let toxicPools = 0;
  let degradedPools = 0;
  if (poolReport) {
    toxicPools = poolReport.pools.filter((p) => p.poolLabel === "TOXIC").length;
    degradedPools = poolReport.degraded + poolReport.empty;
  }

  const a = highRiskEvents + toxicPools;
  const b = strategyEvents;
  const c = warningEvents + degradedPools;
  const total = Math.max(a + b + c, 1);
  return {
    highRisk: Math.round((a / total) * 100),
    strategy: Math.round((b / total) * 100),
    warning: Math.max(0, 100 - Math.round((a / total) * 100) - Math.round((b / total) * 100)),
  };
}

export interface ChainStatusRow {
  label: string;
  score: number;
  dot: "purple" | "cyan" | "yellow" | "red";
}

export function computePoolChainStatus(poolReport?: PoolsHealthReport): ChainStatusRow[] {
  if (!poolReport || poolReport.poolCount === 0) {
    return [
      { label: "SAFE 池", score: 92, dot: "purple" },
      { label: "SHALLOW 池", score: 88, dot: "cyan" },
      { label: "TOXIC 池", score: 71, dot: "yellow" },
      { label: "SDA 池", score: 58, dot: "red" },
      { label: "异常/空池", score: 22, dot: "red" },
    ];
  }

  const byLabel = (label: string) => poolReport.pools.filter((p) => p.poolLabel === label);
  const healthRate = (pools: PoolHealthEntry[]) => {
    if (pools.length === 0) return 0;
    const healthy = pools.filter((p) => p.status === "healthy").length;
    return Math.round((healthy / pools.length) * 100);
  };

  const safe = healthRate(byLabel("SAFE"));
  const shallow = healthRate(byLabel("SHALLOW")) || Math.max(0, safe - 8);
  const toxic = healthRate(byLabel("TOXIC"));
  const sda = healthRate(byLabel("SDA"));
  const abnormal = Math.round(((poolReport.degraded + poolReport.empty) / poolReport.poolCount) * 100);

  return [
    { label: "SAFE 池", score: safe || 92, dot: "purple" },
    { label: "SHALLOW 池", score: shallow || 88, dot: "cyan" },
    { label: "TOXIC 池", score: toxic || 71, dot: "yellow" },
    { label: "SDA 池", score: sda || 58, dot: "red" },
    { label: "异常/空池", score: Math.max(abnormal, 5), dot: "red" },
  ];
}

export interface WorkflowStage {
  label: string;
  count: number;
}

export function computeWorkflowStages(events: Event[]): WorkflowStage[] {
  const quoteLike = events.filter((e) => e.eventType.includes("Quote") || e.message?.toLowerCase().includes("quote")).length;
  const evaluated = events.filter((e) => e.eventType.includes("Evaluat")).length;
  const decisions = events.filter((e) => e.eventType.includes("Decision")).length;
  const fallbacks = events.filter((e) => e.eventType.includes("Fallback")).length;
  const executing = events.filter((e) => e.eventType.includes("Execut") && !e.eventType.includes("Success")).length;
  const completed = events.filter(
    (e) => e.eventType.includes("Success") || e.eventType === "SwapExecuted"
  ).length;

  return [
    { label: "待提交", count: quoteLike || Math.max(evaluated - decisions, 0) },
    { label: "合约审计", count: evaluated },
    { label: "策略匹配", count: decisions },
    { label: "多签确认", count: fallbacks },
    { label: "执行中", count: executing || (completed > 0 ? 1 : 0) },
    { label: "已完成", count: completed },
  ];
}

export function buildAlertSummary(alerts: Event[], score: number): string {
  if (alerts.length === 0) {
    return score >= 70
      ? "系统运行正常，未发现高风险告警。可继续通过 Safe 模式执行 swap。"
      : "整体安全分偏低，建议优先选择 SAFE 池路由并开启安全模式。";
  }
  const critical = alerts.filter(
    (e) => e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed"
  ).length;
  const fallback = alerts.filter(
    (e) => e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")
  ).length;
  if (critical > 0) {
    return `检测到 ${critical} 条高风险拦截记录${fallback > 0 ? `、${fallback} 次 Fallback` : ""}。建议复查路由并走 Safe 模式交易。`;
  }
  return `近期有 ${alerts.length} 条告警，多为 Fallback 或池子波动。Agent 已尝试切换更安全路径。`;
}

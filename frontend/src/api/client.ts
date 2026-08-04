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

export interface LabelVolumeRow {
  label: "SAFE" | "SHALLOW" | "TOXIC" | "SDA";
  volumeUsdc: number;
  swapCount: number;
}

export interface PoolVolumeReport {
  swapRouter: string;
  maxEvents: number;
  eventsUsed: number;
  scannedFromBlock: number;
  scannedToBlock: number;
  checkedAt: string;
  pricingNote: string;
  byLabel: LabelVolumeRow[];
  abnormalPct: number;
  abnormalCount: number;
  poolCount: number;
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

export interface DashboardOverviewInput {
  score: number;
  legend: {
    highRisk: number;
    strategy: number;
    warning: number;
  };
  poolVolume: Array<{
    label: string;
    volumeUsdc: number;
    swapCount?: number;
  }>;
  alerts: Array<{
    title: string;
    detail: string;
    level?: string;
  }>;
  poolsHealth?: {
    poolCount: number;
    healthy: number;
    degraded: number;
    empty: number;
  } | null;
}

export interface DashboardOverviewExplanation {
  headline: string;
  narrative: string;
  highlights: string[];
  confidence?: number;
  source: "llm";
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
  source?: "local" | "chain";
  achievementsContract: string | null;
  checkCount: number;
  safeSwapCount: number;
  tradeCount?: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
  badges: OnChainBadgeTier[];
}

export interface LedgerTradeRecordInput {
  user: string;
  routeId: string;
  executionMode: "router" | "direct" | "sda";
  safetyMode: "safe" | "force";
  poolLabel?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  txHash: string;
  blockNumber?: number;
  agentDecision?: string;
  registerCheck?: boolean;
}

export interface LedgerTradeRecord {
  id: string;
  user: string;
  routeId: string;
  executionMode: "router" | "direct" | "sda";
  safetyMode: "safe" | "force";
  poolLabel?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  txHash: string;
  blockNumber?: number;
  agentDecision?: string;
  timestamp: number;
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
  poolVolume: (opts?: { force?: boolean }) =>
    getJson<PoolVolumeReport & { cache?: unknown }>(
      `/debug/pool-volume${opts?.force ? "?refresh=true" : ""}`
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
  recordLedgerTrade: (body: LedgerTradeRecordInput) =>
    fetch(`${API}/ledger/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data.error, "写入交易账本失败"));
      return data as { trade: unknown; stats: OnChainAchievements };
    }),
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
  aiDashboardOverview: async (body: DashboardOverviewInput) => {
    try {
      const { res, data } = await fetchJson<
        DashboardOverviewExplanation & { error?: unknown }
      >(
        `${API}/ai-alert-analysis/dashboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        15_000
      );
      if (!res.ok) {
        throw new Error(parseApiError(data.error, "仪表盘 AI 分析调用失败"));
      }
      return data as DashboardOverviewExplanation;
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

export function computeUserStats(events: Event[], account?: string | null) {
  const scoped =
    account != null && account !== ""
      ? events.filter((e) => {
          const who = e.context?.account?.toLowerCase();
          return who == null || who === account.toLowerCase();
        })
      : events;
  const safeSwaps = scoped.filter(
    (e) => e.eventType === "ExecutionSuccess" || e.eventType === "SwapExecuted"
  );
  const rejects = scoped.filter(
    (e) => e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed"
  );
  const fallbacks = scoped.filter(
    (e) => e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")
  );
  return {
    swapCount: safeSwaps.length,
    rejectCount: rejects.length,
    fallbackCount: fallbacks.length,
    safeVolumeUsd: safeSwaps.reduce((total, event) => {
      const ctx = event.context;
      const amountIn = ctx?.amountIn;
      if (typeof amountIn !== "number" || amountIn <= 0) return total;
      const tokenIn = ctx?.tokenIn?.toUpperCase();
      if (tokenIn === "USDC") return total + amountIn;
      const tokenOut = ctx?.tokenOut?.toUpperCase();
      const actualOut = ctx?.actualOut;
      if (tokenOut === "USDC" && typeof actualOut === "number" && actualOut > 0) {
        return total + actualOut;
      }
      return total;
    }, 0),
  };
}

export interface DashboardAlertView {
  level: "critical" | "warn" | "info";
  title: string;
  detail: string;
  date: string;
}

const POOL_LABEL_ZH: Record<string, string> = {
  safe: "SAFE 池",
  shallow: "SHALLOW 池",
  toxic: "TOXIC 池",
  sda: "SDA 池",
};

function parseRouteForAlert(routeId?: string): { pair: string; pool?: string } {
  if (!routeId) return { pair: "未知交易对" };
  const parts = routeId.toLowerCase().split("-");
  if (parts[0] === "route" && parts.length >= 4) {
    const tokenIn = parts[1].toUpperCase();
    const tokenOut = parts[2].toUpperCase();
    const poolKey = parts[3];
    return {
      pair: `${tokenIn} → ${tokenOut}`,
      pool: POOL_LABEL_ZH[poolKey] ?? poolKey.toUpperCase(),
    };
  }
  return { pair: routeId };
}

function humanizeAlertReason(event: Event): string {
  const code = event.context?.errorCode;
  if (code === "SWAP_REJECTED_BY_AGENT") return "系统认为这笔交易风险太高，已阻止执行。";
  if (code === "SWAP_FALLBACK_REQUIRED") return "当前路线不够安全，需要换一条更稳妥的。";
  if (code === "INSUFFICIENT_BALANCE") return "账户余额不足，无法完成交易。";
  if (code === "INSUFFICIENT_ALLOWANCE") return "尚未授权足够代币额度，请先完成授权。";
  if (event.eventType === "SwapFailed") return "链上执行未成功，请检查路由与金额后重试。";
  if (event.decision === "REJECT") return "系统评估后不建议继续这笔交易。";
  if ((event.riskScore ?? 0) >= 50) return "风险分数偏高，建议降低金额或换用 SAFE 池。";
  return "请关注该笔交易并优先使用 Safe 模式。";
}

function formatDashboardDateTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isAgentBypassed(ctx?: Event["context"]): boolean {
  if (!ctx) return false;
  if (ctx.safetyMode === "force") return true;
  if (ctx.agentBypassed === true) return true;
  if (Array.isArray(ctx.flags) && ctx.flags.includes("agent_bypassed")) return true;
  return false;
}

/** Agent 拦截/预警，或 Unsafe（Force）模式成交/失败。正常 Safe 成功不算警报。 */
export function isDashboardAlertEvent(event: Event): boolean {
  const ctx = event.context;
  const bypassed = isAgentBypassed(ctx);

  if (event.eventType === "RouteEvaluated" || event.eventType === "ExecutionAttempted") {
    return false;
  }

  if (
    event.eventType === "SwapExecuted" &&
    !bypassed &&
    (event.decision === "ALLOW" || event.decision == null)
  ) {
    return false;
  }

  if (
    event.eventType === "DecisionMade" &&
    event.decision === "ALLOW" &&
    (event.riskScore ?? 0) < 50
  ) {
    return false;
  }

  if (event.eventType === "ExecutionRejected") return true;
  if (event.eventType.includes("Reject") || event.decision === "REJECT") return true;
  if (event.eventType === "FallbackRequired") return true;
  if (event.decision === "FALLBACK_TO_SAFE_ROUTE") return true;
  if (event.eventType === "SwapFailed" && !bypassed) return true;
  if (event.eventType === "DecisionMade" && (event.riskScore ?? 0) >= 50) return true;

  if (bypassed && (event.eventType === "SwapExecuted" || event.eventType === "SwapFailed")) {
    return true;
  }

  return false;
}

export function selectDashboardAlerts(events: Event[], limit = 5): DashboardAlertView[] {
  type Row = DashboardAlertView & { sortKey: number; dedupeKey: string };
  const seen = new Set<string>();
  return events
    .filter(isDashboardAlertEvent)
    .map((event) => ({
      ...formatDashboardAlert(event),
      sortKey: event.timestamp,
      dedupeKey: (event.txHash ?? event.id).toLowerCase(),
    }))
    .sort((a, b) => b.sortKey - a.sortKey)
    .filter((row) => {
      if (seen.has(row.dedupeKey)) return false;
      seen.add(row.dedupeKey);
      return true;
    })
    .slice(0, limit)
    .map(({ sortKey: _sortKey, dedupeKey: _dedupeKey, ...view }) => view);
}

export function formatDashboardAlert(event: Event): DashboardAlertView {
  const routeId =
    event.routeId ?? event.context?.executedRouteId ?? event.context?.requestedRouteId;
  const route = parseRouteForAlert(routeId);
  const amountIn = event.context?.amountIn;
  const amountHint =
    typeof amountIn === "number" && amountIn > 0 ? `，金额约 ${amountIn} USDC` : "";
  const routeHint = route.pool ? `${route.pair}（${route.pool}）` : route.pair;
  const bypassed = isAgentBypassed(event.context);

  if (bypassed && event.eventType === "SwapExecuted") {
    return {
      level: route.pool && !route.pool.includes("SAFE") ? "warn" : "info",
      title: "强制模式成交",
      detail: `${routeHint}${amountHint}。这笔交易绕过了风控保护，由你主动确认执行。`,
      date: formatDashboardDateTime(event.timestamp),
    };
  }

  if (bypassed && event.eventType === "SwapFailed") {
    return {
      level: "critical",
      title: "强制模式失败",
      detail: `${routeHint}${amountHint}。${humanizeAlertReason(event)}`,
      date: formatDashboardDateTime(event.timestamp),
    };
  }

  if (
    event.eventType === "SwapFailed" ||
    event.eventType.includes("Reject") ||
    event.decision === "REJECT"
  ) {
    return {
      level: "critical",
      title: event.eventType === "SwapFailed" ? "拦截后仍未成交" : "被风控拦住",
      detail: `${routeHint}${amountHint}。${humanizeAlertReason(event)}`,
      date: formatDashboardDateTime(event.timestamp),
    };
  }

  if (event.decision === "FALLBACK_TO_SAFE_ROUTE" || event.eventType.includes("Fallback")) {
    const fallbackRoute = parseRouteForAlert(
      event.fallbackRouteId ?? event.context?.executedRouteId
    );
    const fallbackHint = fallbackRoute.pool
      ? `${fallbackRoute.pair}（${fallbackRoute.pool}）`
      : fallbackRoute.pair;
    const auto = event.context?.autoFallback === true;
    return {
      level: "warn",
      title: auto ? "已自动换更稳的路" : "建议换更稳的路",
      detail: auto
        ? `${routeHint} 风险偏高，已自动改走 ${fallbackHint}。`
        : `${routeHint} 风险偏高，建议改走 ${fallbackHint}。`,
      date: formatDashboardDateTime(event.timestamp),
    };
  }

  return {
    level: "info",
    title: "风险提示",
    detail: `${routeHint} 风险分 ${event.riskScore ?? "—"}，${humanizeAlertReason(event)}`,
    date: formatDashboardDateTime(event.timestamp),
  };
}

export interface ScoreLegend {
  highRisk: number;
  strategy: number;
  warning: number;
}

/** Recent-event window for the three legend boxes. */
const LEGEND_EVENT_WINDOW = 100;

/** Pool weights: healthy pools dilute; toxic/degraded add risk mass into the same denominator. */
const POOL_TOXIC_WEIGHT = 0.5;
const POOL_DEGRADED_WEIGHT = 0.5;
const POOL_HEALTHY_WEIGHT = 0.25;

type LegendEventBucket = "highRisk" | "strategy" | "warning" | "normal";

function classifyLegendEvent(event: Event): LegendEventBucket {
  if (
    event.decision === "REJECT" ||
    event.eventType.includes("Reject") ||
    event.eventType === "SwapFailed"
  ) {
    return "highRisk";
  }
  if (event.decision === "FALLBACK_TO_SAFE_ROUTE" || event.eventType.includes("Fallback")) {
    return "strategy";
  }
  if (event.eventType.includes("Warn") || (event.decision === "ALLOW" && (event.riskScore ?? 0) >= 40)) {
    return "warning";
  }
  return "normal";
}

export interface LegendBreakdown {
  highRiskEvents: number;
  strategyEvents: number;
  warningEvents: number;
  normalEvents: number;
  toxicPools: number;
  degradedPools: number;
  healthyPools: number;
  totalActivity: number;
  highRiskMass: number;
  strategyMass: number;
  warningMass: number;
}

export function computeLegendBreakdown(
  events: Event[],
  poolReport?: PoolsHealthReport
): LegendBreakdown {
  const recent = events.slice(-LEGEND_EVENT_WINDOW);
  let highRiskEvents = 0;
  let strategyEvents = 0;
  let warningEvents = 0;
  let normalEvents = 0;

  for (const event of recent) {
    const bucket = classifyLegendEvent(event);
    if (bucket === "highRisk") highRiskEvents += 1;
    else if (bucket === "strategy") strategyEvents += 1;
    else if (bucket === "warning") warningEvents += 1;
    else normalEvents += 1;
  }

  let toxicPools = 0;
  let degradedPools = 0;
  let healthyPools = 0;
  if (poolReport) {
    toxicPools = poolReport.pools.filter((p) => p.poolLabel === "TOXIC").length;
    degradedPools = poolReport.degraded + poolReport.empty;
    healthyPools = poolReport.healthy;
  }

  const highRiskMass = highRiskEvents + toxicPools * POOL_TOXIC_WEIGHT;
  const strategyMass = strategyEvents;
  const warningMass = warningEvents + degradedPools * POOL_DEGRADED_WEIGHT;
  const totalActivity = Math.max(
    recent.length +
      toxicPools * POOL_TOXIC_WEIGHT +
      degradedPools * POOL_DEGRADED_WEIGHT +
      healthyPools * POOL_HEALTHY_WEIGHT,
    1
  );

  return {
    highRiskEvents,
    strategyEvents,
    warningEvents,
    normalEvents,
    toxicPools,
    degradedPools,
    healthyPools,
    totalActivity,
    highRiskMass,
    strategyMass,
    warningMass,
  };
}

function legendPct(mass: number, totalActivity: number): number {
  return Math.max(0, Math.min(100, Math.round((mass / totalActivity) * 100)));
}

/** Share of recent activity — normal trades and healthy pools dilute the three risk slices. */
export function computeScoreLegend(events: Event[], poolReport?: PoolsHealthReport): ScoreLegend {
  const breakdown = computeLegendBreakdown(events, poolReport);
  return {
    highRisk: legendPct(breakdown.highRiskMass, breakdown.totalActivity),
    strategy: legendPct(breakdown.strategyMass, breakdown.totalActivity),
    warning: legendPct(breakdown.warningMass, breakdown.totalActivity),
  };
}

export interface SecurityScoreExplanation {
  score: number;
  baseScore: number;
  rejectCount: number;
  fallbackCount: number;
  scoreAfterEvents: number;
  poolScore: number | null;
  healthyPools: number;
  poolCount: number;
  legend: ScoreLegend;
  legendRaw: {
    highRiskEvents: number;
    toxicPools: number;
    strategyEvents: number;
    warningEvents: number;
    normalEvents: number;
    degradedPools: number;
    healthyPools: number;
    highRiskTotal: number;
    strategyTotal: number;
    warningTotal: number;
    denominator: number;
  };
}

export function explainSecurityMetrics(
  events: Event[],
  poolReport?: PoolsHealthReport
): SecurityScoreExplanation {
  const baseScore = 85;
  const recentScore = events.slice(-20);
  let rejectCount = 0;
  let fallbackCount = 0;
  for (const e of recentScore) {
    if (e.eventType.includes("Reject") || e.eventType === "SwapFailed") rejectCount += 1;
    if (e.decision === "FALLBACK_TO_SAFE_ROUTE") fallbackCount += 1;
  }
  let scoreAfterEvents = baseScore - rejectCount * 8 - fallbackCount * 3;
  let poolScore: number | null = null;
  let healthyPools = 0;
  let poolCount = 0;
  let score = scoreAfterEvents;
  if (poolReport && poolReport.poolCount > 0) {
    healthyPools = poolReport.healthy;
    poolCount = poolReport.poolCount;
    poolScore = Math.round((healthyPools / poolCount) * 100);
    score = Math.round(scoreAfterEvents * 0.6 + poolScore * 0.4);
  }
  score = Math.max(0, Math.min(100, score));

  const breakdown = computeLegendBreakdown(events, poolReport);
  const legend = computeScoreLegend(events, poolReport);

  return {
    score,
    baseScore,
    rejectCount,
    fallbackCount,
    scoreAfterEvents,
    poolScore,
    healthyPools,
    poolCount,
    legend,
    legendRaw: {
      highRiskEvents: breakdown.highRiskEvents,
      toxicPools: breakdown.toxicPools,
      strategyEvents: breakdown.strategyEvents,
      warningEvents: breakdown.warningEvents,
      normalEvents: breakdown.normalEvents,
      degradedPools: breakdown.degradedPools,
      healthyPools: breakdown.healthyPools,
      highRiskTotal: breakdown.highRiskMass,
      strategyTotal: breakdown.strategyMass,
      warningTotal: breakdown.warningMass,
      denominator: breakdown.totalActivity,
    },
  };
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
      ? "最近整体比较平稳，没有发现需要特别留意的异常。可以继续用安全模式交易。"
      : "整体分数偏低，建议优先选 SAFE 池，并使用安全模式。";
  }
  const critical = alerts.filter(
    (e) => e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed"
  ).length;
  const fallback = alerts.filter(
    (e) => e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")
  ).length;
  if (critical > 0) {
    return `近期有 ${critical} 条被拦住或失败${fallback > 0 ? `，另有 ${fallback} 次改走更稳的路` : ""}。建议检查一下再交易，并优先用安全模式。`;
  }
  return `近期有 ${alerts.length} 条值得留意的记录，多为改走更稳路线或池子波动。系统已尝试帮你降低风险。`;
}

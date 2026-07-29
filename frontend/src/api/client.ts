import type { Decision, Event, SwapResult } from "../types";

const API = "/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "Request failed");
  return data as T;
}

export interface DebugStatus {
  chainMode: string;
  expectedChainId?: number;
  chainName?: string;
  anvilRpcUrl?: string;
  swapRouter?: string;
  routerSwapAvailable?: boolean;
  demoPoolCount?: number;
  eventCount?: number;
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

export interface RiskConfig {
  defaultProfile: string;
  paused: boolean;
  maxSlippageBps?: number;
  profiles?: Record<string, unknown>;
}

export const api = {
  debugStatus: () => getJson<DebugStatus>("/debug/status"),
  events: async () => {
    const data = await getJson<{ events: Event[] }>("/events");
    return data.events ?? [];
  },
  poolsHealth: () => getJson<PoolsHealthReport>("/debug/pools-health"),
  riskConfig: () => getJson<RiskConfig>("/config"),
  balances: (address: string) =>
    getJson<{ address: string; balances: Record<string, TokenBalance> }>(
      `/swap/balances/${address}`
    ),
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
      if (!res.ok) throw new Error(data.error ?? "Evaluate failed");
      return data as Decision;
    }),
  swapSafe: (body: object) =>
    fetch(`${API}/swap/safe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "Swap failed");
      return data as SwapResult;
    }),
  swapForce: (body: object) =>
    fetch(`${API}/swap/force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "Swap failed");
      return data as SwapResult;
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
    safeVolumeUsd: safeSwaps.length * 100,
  };
}

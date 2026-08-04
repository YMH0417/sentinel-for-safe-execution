// backend/src/routes/ai-analysis.ts — POST /api/ai-alert-analysis
// 按需触发 AI 对「最新一条交易事件」做智能解析。
// 失败（无 key / 超时 / 解析失败）直接返回 503，不写事件、不走本地兜底。
import { Router, Request, Response } from "express";
import { getEvents } from "../services/eventService.js";
import { explainSafetyDecision, explainDashboardOverview } from "../services/llmAnalysisService.js";
import { addEvent } from "../services/eventService.js";
import type {
  Decision,
  Event,
  Route,
  SafetyExplanation,
  DashboardOverviewInput,
  DashboardOverviewExplanation,
} from "../types.js";

const router = Router();

const TRADE_EVENT_TYPES = new Set([
  "SwapExecuted",
  "SwapFailed",
  "DecisionMade",
  "FallbackRequired",
  "ExecutionSuccess",
  "ExecutionRejected",
]);

// 从一条 DecisionMade 事件还原 Decision 对象（含 evidence）。
function decisionFromEvent(event: Event): Decision | null {
  const ctx = event.context ?? {};
  const evidence = {
    quotedOut: typeof ctx.quotedOut === "number" ? ctx.quotedOut : 0,
    expectedOut: typeof ctx.expectedOut === "number" ? ctx.expectedOut : 0,
    quoteDeviation:
      typeof ctx.quoteDeviation === "number" ? ctx.quoteDeviation : 0,
    historicalFailureRate:
      typeof ctx.historicalFailureRate === "number"
        ? ctx.historicalFailureRate
        : 0,
    poolRiskScore:
      typeof ctx.poolRiskScore === "number" ? ctx.poolRiskScore : 0,
    ...(typeof ctx.priceImpactBps === "number"
      ? { priceImpactBps: ctx.priceImpactBps }
      : {}),
    ...(typeof ctx.poolLabel === "string" ? { poolLabel: ctx.poolLabel } : {}),
  };

  const flags = Array.isArray(ctx.flags) ? (ctx.flags as string[]) : [];
  const routeId = event.routeId ?? "";
  const fallbackRouteId = event.fallbackRouteId ?? null;

  if (event.decision) {
    return {
      decision: event.decision,
      riskScore: event.riskScore ?? 0,
      reason: event.message ?? "",
      routeId,
      fallbackRouteId,
      flags,
      evidence,
      ...(typeof ctx.correlationId === "string"
        ? { correlationId: ctx.correlationId }
        : {}),
    };
  }

  if (event.eventType === "SwapExecuted" || event.eventType === "ExecutionSuccess") {
    return {
      decision: "ALLOW",
      riskScore: event.riskScore ?? 0,
      reason: event.message ?? "交易已成交",
      routeId,
      fallbackRouteId,
      flags,
      evidence,
    };
  }

  if (event.eventType === "SwapFailed" || event.eventType === "ExecutionRejected") {
    return {
      decision: "REJECT",
      riskScore: event.riskScore ?? 100,
      reason: event.message ?? "交易失败",
      routeId,
      fallbackRouteId,
      flags,
      evidence,
    };
  }

  if (event.eventType === "FallbackRequired") {
    return {
      decision: "FALLBACK_TO_SAFE_ROUTE",
      riskScore: event.riskScore ?? 0,
      reason: event.message ?? "建议切换安全路由",
      routeId,
      fallbackRouteId,
      flags,
      evidence,
    };
  }

  return null;
}

// 从事件上下文还原 Route（仅 LLM 解释需要的字段，缺失项给默认值）。
function routeFromEvent(event: Event): Route | undefined {
  const ctx = event.context ?? {};
  if (!event.routeId && !ctx.tokenIn && !ctx.tokenOut) return undefined;
  return {
    routeId: event.routeId ?? "",
    label: typeof ctx.poolLabel === "string" ? ctx.poolLabel : event.routeId ?? "",
    tokenIn: typeof ctx.tokenIn === "string" ? ctx.tokenIn : "",
    tokenOut: typeof ctx.tokenOut === "string" ? ctx.tokenOut : "",
    amountIn: typeof ctx.amountIn === "number" ? ctx.amountIn : 0,
    quotedOut: typeof ctx.quotedOut === "number" ? ctx.quotedOut : 0,
    expectedOut: typeof ctx.expectedOut === "number" ? ctx.expectedOut : 0,
    poolRiskScore:
      typeof ctx.poolRiskScore === "number" ? ctx.poolRiskScore : 0,
    historicalFailureRate:
      typeof ctx.historicalFailureRate === "number"
        ? ctx.historicalFailureRate
        : 0,
    supportsFallback: !!event.fallbackRouteId,
    fallbackRouteId: event.fallbackRouteId ?? null,
    warningFlags: Array.isArray(ctx.flags) ? (ctx.flags as string[]) : [],
    ...(typeof ctx.priceImpactBps === "number"
      ? { priceImpactBps: ctx.priceImpactBps }
      : {}),
    ...(typeof ctx.poolLabel === "string" ? { poolLabel: ctx.poolLabel } : {}),
  };
}

// 找到目标事件：优先 eventId，否则取最新一条交易相关事件。
async function resolveTargetEvent(eventId?: string): Promise<Event | null> {
  const all = await getEvents();
  if (eventId) {
    return all.find((e) => e.id === eventId) ?? null;
  }
  for (let i = all.length - 1; i >= 0; i--) {
    if (TRADE_EVENT_TYPES.has(all[i].eventType)) return all[i];
  }
  return null;
}

function parseDashboardOverviewBody(body: unknown): DashboardOverviewInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.score !== "number" || !raw.legend || typeof raw.legend !== "object") {
    return null;
  }
  const legend = raw.legend as Record<string, unknown>;
  if (
    typeof legend.highRisk !== "number" ||
    typeof legend.strategy !== "number" ||
    typeof legend.warning !== "number"
  ) {
    return null;
  }
  if (!Array.isArray(raw.poolVolume) || !Array.isArray(raw.alerts)) {
    return null;
  }

  const poolVolume = raw.poolVolume
    .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
    .map((row) => ({
      label: String(row.label ?? ""),
      volumeUsdc: typeof row.volumeUsdc === "number" ? row.volumeUsdc : 0,
      ...(typeof row.swapCount === "number" ? { swapCount: row.swapCount } : {}),
    }));

  const alerts = raw.alerts
    .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
    .slice(0, 5)
    .map((row) => ({
      title: String(row.title ?? ""),
      detail: String(row.detail ?? ""),
      ...(typeof row.level === "string" ? { level: row.level } : {}),
    }));

  let poolsHealth: DashboardOverviewInput["poolsHealth"] = null;
  if (raw.poolsHealth && typeof raw.poolsHealth === "object") {
    const ph = raw.poolsHealth as Record<string, unknown>;
    poolsHealth = {
      poolCount: typeof ph.poolCount === "number" ? ph.poolCount : 0,
      healthy: typeof ph.healthy === "number" ? ph.healthy : 0,
      degraded: typeof ph.degraded === "number" ? ph.degraded : 0,
      empty: typeof ph.empty === "number" ? ph.empty : 0,
    };
  }

  return {
    score: raw.score,
    legend: {
      highRisk: legend.highRisk,
      strategy: legend.strategy,
      warning: legend.warning,
    },
    poolVolume,
    alerts,
    poolsHealth,
  };
}

router.post("/dashboard", async (req: Request, res: Response) => {
  const input = parseDashboardOverviewBody(req.body);
  if (!input) {
    return res.status(400).json({
      error: {
        code: "INVALID_DASHBOARD_OVERVIEW_REQUEST",
        message: "Invalid dashboard overview payload",
      },
    });
  }

  let explanation: DashboardOverviewExplanation;
  try {
    explanation = await explainDashboardOverview(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard AI analysis failed";
    return res.status(503).json({
      error: {
        code: "AI_DASHBOARD_ANALYSIS_FAILED",
        message,
      },
    });
  }

  return res.json(explanation);
});

router.post("/", async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: {
        code: "INVALID_AI_ANALYSIS_REQUEST",
        message: "request body must be an object",
      },
    });
  }

  const { eventId } = req.body as { eventId?: unknown };
  if (eventId !== undefined && typeof eventId !== "string") {
    return res.status(400).json({
      error: {
        code: "INVALID_AI_ANALYSIS_REQUEST",
        message: "eventId must be a string",
      },
    });
  }

  const target = await resolveTargetEvent(
    typeof eventId === "string" && eventId.trim() ? eventId.trim() : undefined
  );
  if (!target) {
    return res.status(404).json({
      error: {
        code: "AI_ANALYSIS_NO_EVENT",
        message:
          "No recent trade event found. Execute a swap or pass a valid eventId.",
      },
    });
  }

  const decision = decisionFromEvent(target);
  if (!decision) {
    return res.status(400).json({
      error: {
        code: "AI_ANALYSIS_NO_DECISION",
        message: "Target event has no decision to analyze.",
      },
    });
  }

  const route = routeFromEvent(target);
  const configProfile =
    typeof target.context?.configProfile === "string"
      ? target.context.configProfile
      : "normal";

  let explanation: SafetyExplanation;
  try {
    explanation = await explainSafetyDecision(decision, route, configProfile);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed";
    return res.status(503).json({
      error: {
        code: "AI_ANALYSIS_FAILED",
        message,
      },
    });
  }

  // 成功才写审计事件，关联原事件。
  await addEvent({
    eventType: "AIAnalysisCompleted",
    routeId: target.routeId,
    decision: target.decision,
    riskScore: target.riskScore,
    message: `AI 分析完成: ${explanation.attackVector ?? "Unknown"} (confidence=${explanation.confidence ?? 0}). ${explanation.narrative.slice(0, 120)}`,
    context: {
      correlationId: target.context?.correlationId,
      analyzedEventId: target.id,
      configProfile,
      aiSource: explanation.source,
      aiModel: explanation.model,
      aiAttackVector: explanation.attackVector,
      aiConfidence: explanation.confidence,
      aiRecommendations: explanation.recommendations,
      flags: decision.flags,
      quotedOut: decision.evidence?.quotedOut,
      expectedOut: decision.evidence?.expectedOut,
      quoteDeviation: decision.evidence?.quoteDeviation,
      historicalFailureRate: decision.evidence?.historicalFailureRate,
      poolRiskScore: decision.evidence?.poolRiskScore,
      priceImpactBps: decision.evidence?.priceImpactBps,
      poolLabel: decision.evidence?.poolLabel,
    },
  });

  return res.json(explanation);
});

export default router;

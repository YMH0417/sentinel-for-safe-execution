// backend/src/routes/ai-analysis.ts — POST /api/ai-alert-analysis
// 按需触发 AI 对「最新一条交易事件」做智能解析。
// 失败（无 key / 超时 / 解析失败）直接返回 503，不写事件、不走本地兜底。
import { Router, Request, Response } from "express";
import { getEvents } from "../services/eventService.js";
import { explainSafetyDecision } from "../services/llmAnalysisService.js";
import { addEvent } from "../services/eventService.js";
import type { Decision, Event, Route, SafetyExplanation } from "../types.js";

const router = Router();

// 从一条 DecisionMade 事件还原 Decision 对象（含 evidence）。
function decisionFromEvent(event: Event): Decision | null {
  if (!event.decision) return null;
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

  return {
    decision: event.decision,
    riskScore: event.riskScore ?? 0,
    reason: event.message ?? "",
    routeId: event.routeId ?? "",
    fallbackRouteId: event.fallbackRouteId ?? null,
    flags: Array.isArray(ctx.flags) ? (ctx.flags as string[]) : [],
    evidence,
    ...(typeof ctx.correlationId === "string"
      ? { correlationId: ctx.correlationId }
      : {}),
  };
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

// 找到目标事件：优先 eventId，否则取最新一条 DecisionMade。
function resolveTargetEvent(eventId?: string): Event | null {
  const all = getEvents();
  if (eventId) {
    return all.find((e) => e.id === eventId) ?? null;
  }
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].eventType === "DecisionMade") return all[i];
  }
  return null;
}

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

  const target = resolveTargetEvent(
    typeof eventId === "string" && eventId.trim() ? eventId.trim() : undefined
  );
  if (!target) {
    return res.status(404).json({
      error: {
        code: "AI_ANALYSIS_NO_EVENT",
        message:
          "No DecisionMade event found. Run /api/evaluate first or pass a valid eventId.",
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
  addEvent({
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

// backend/src/routes/evaluate.ts — POST /evaluate
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { evaluateRoute } from "../services/agentService.js";
import { addEvent } from "../services/eventService.js";

const router = Router();
const CONFIG_PROFILES = new Set(["normal", "conservative", "aggressive"]);

router.post("/", async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: {
        code: "INVALID_EVALUATE_REQUEST",
        message: "request body must be an object",
      },
    });
  }

  const { routeId, configProfile = "normal", tokenIn, tokenOut, amountIn } = req.body as {
    routeId?: unknown;
    configProfile?: unknown;
    tokenIn?: unknown;
    tokenOut?: unknown;
    amountIn?: unknown;
  };

  if (typeof routeId !== "string" || routeId.trim() === "") {
    return res.status(400).json({
      error: {
        code: "INVALID_EVALUATE_REQUEST",
        message: "routeId must be a non-empty string",
      },
    });
  }
  if (
    typeof configProfile !== "string" ||
    !CONFIG_PROFILES.has(configProfile)
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_EVALUATE_REQUEST",
        message: "configProfile must be normal, conservative, or aggressive",
      },
    });
  }
  const normalizedAmount =
    amountIn === undefined ? undefined : Number(amountIn);
  if (
    normalizedAmount !== undefined &&
    (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0)
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_EVALUATE_REQUEST",
        message: "amountIn must be a positive finite number",
      },
    });
  }

  const correlationId = randomUUID();
  const context = {
    correlationId,
    tokenIn: typeof tokenIn === "string" ? tokenIn : undefined,
    tokenOut: typeof tokenOut === "string" ? tokenOut : undefined,
    amountIn: normalizedAmount,
    requestedRouteId: routeId,
    configProfile: configProfile as "normal" | "conservative" | "aggressive",
    safetyMode: "evaluate" as const,
  };

  addEvent({
    eventType: "RouteEvaluated",
    routeId,
    message: `Route ${routeId} submitted for safety evaluation`,
    context,
  });

  try {
    const decision = await evaluateRoute(routeId, configProfile, {
      tokenIn: typeof tokenIn === "string" ? tokenIn : undefined,
      tokenOut: typeof tokenOut === "string" ? tokenOut : undefined,
      amountIn: normalizedAmount,
    });

    addEvent({
      eventType: "DecisionMade",
      routeId,
      decision: decision.decision,
      riskScore: decision.riskScore,
      fallbackRouteId: decision.fallbackRouteId ?? undefined,
      message: `Decision: ${decision.decision} (riskScore=${decision.riskScore}). ${decision.reason}`,
      context: {
        ...context,
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

    return res.json({ ...decision, correlationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluate failed";
    return res.status(503).json({
      error: {
        code: "EVALUATE_FAILED",
        message,
      },
    });
  }
});

export default router;

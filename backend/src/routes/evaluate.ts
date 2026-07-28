// backend/src/routes/evaluate.ts — POST /evaluate
import { Router, Request, Response } from "express";
import { evaluateRoute } from "../services/agentService.js";
import { addEvent } from "../services/eventService.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { routeId, configProfile, tokenIn, tokenOut, amountIn } = req.body;

  if (!routeId) {
    return res.status(400).json({ error: "routeId is required" });
  }

  addEvent({
    eventType: "RouteEvaluated",
    routeId,
    message: `Route ${routeId} submitted for safety evaluation`,
  });

  try {
    const decision = await evaluateRoute(routeId, configProfile || "normal", {
      tokenIn,
      tokenOut,
      amountIn: amountIn !== undefined ? Number(amountIn) : undefined,
    });

    addEvent({
      eventType: "DecisionMade",
      routeId,
      decision: decision.decision,
      riskScore: decision.riskScore,
      message: `Decision: ${decision.decision} (riskScore=${decision.riskScore}). ${decision.reason}`,
    });

    res.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluate failed";
    res.status(503).json({ error: message });
  }
});

export default router;

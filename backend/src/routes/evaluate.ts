// backend/src/routes/evaluate.ts — POST /evaluate
import { Router, Request, Response } from "express";
import { evaluateRoute } from "../services/agentService.js";
import { addEvent } from "../services/eventService.js";

const router = Router();
const CONFIG_PROFILES = new Set(["normal", "conservative", "aggressive"]);

router.post("/", (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: {
        code: "INVALID_EVALUATE_REQUEST",
        message: "request body must be an object",
      },
    });
  }

  const { routeId, configProfile = "normal" } = req.body as {
    routeId?: unknown;
    configProfile?: unknown;
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
        message:
          "configProfile must be normal, conservative, or aggressive",
      },
    });
  }

  addEvent({
    eventType: "RouteEvaluated",
    routeId,
    message: `Route ${routeId} submitted for safety evaluation`,
  });

  const decision = evaluateRoute(routeId, configProfile);

  addEvent({
    eventType: "DecisionMade",
    routeId,
    decision: decision.decision,
    riskScore: decision.riskScore,
    message: `Decision: ${decision.decision} (riskScore=${decision.riskScore}). ${decision.reason}`,
  });

  return res.json(decision);
});

export default router;

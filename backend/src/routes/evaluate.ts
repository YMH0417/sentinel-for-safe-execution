// backend/src/routes/evaluate.ts — POST /evaluate
import { Router, Request, Response } from "express";
import { evaluateRoute } from "../services/agentService.js";
import { addEvent } from "../services/eventService.js";

const router = Router();

router.post("/", (req: Request, res: Response) => {
  const { routeId, configProfile } = req.body;

  if (!routeId) {
    return res.status(400).json({ error: "routeId is required" });
  }

  const decision = evaluateRoute(routeId, configProfile || "normal");

  addEvent({
    eventType: "DecisionMade",
    routeId,
    decision: decision.decision,
    riskScore: decision.riskScore,
    message: `Decision: ${decision.decision} (riskScore=${decision.riskScore}). ${decision.reason}`,
  });

  res.json(decision);
});

export default router;

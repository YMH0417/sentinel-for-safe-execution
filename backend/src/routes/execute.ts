// backend/src/routes/execute.ts — POST /execute
import { Router, Request, Response } from "express";
import { executeRoute } from "../services/vaultService.js";
import { getRouteById } from "../services/routeService.js";
import { evaluateRoute } from "../services/agentService.js";
import { addEvent } from "../services/eventService.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { routeId, maxLossBps, deadline, configProfile } = req.body;

    if (!routeId) {
      return res.status(400).json({ error: "routeId is required" });
    }

    // 获取 route 数据
    const route = getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: `Route ${routeId} not found` });
    }

    // 安全闸门：执行前必须重新经过 Safety Agent 判定，
    // 不信任调用方传入的 decision（防止 evaluate 和 execute 状态不一致）
    const decision = evaluateRoute(routeId, configProfile || "normal");

    // 非 ALLOW 一律在闸门拦下，不进入链上执行
    if (decision.decision !== "ALLOW") {
      const rejectedEvent = addEvent({
        eventType: decision.decision === "REJECT" ? "ExecutionRejected" : "FallbackRequired",
        routeId,
        decision: decision.decision,
        riskScore: decision.riskScore,
        message: `Execution blocked by Safety Agent gate. Decision: ${decision.decision}, RiskScore: ${decision.riskScore}. ${decision.reason}`,
      });
      return res.json({
        success: false,
        event: rejectedEvent,
        decision,
      });
    }

    // 调用合约服务（此时 decision 一定是 ALLOW）
    const result = await executeRoute(
      routeId,
      route.amountIn,
      route.quotedOut,
      deadline || Math.floor(Date.now() / 1000) + 3600,
      decision.riskScore,
      decision.decision,
      maxLossBps || 100
    );

    const loggedEvent = addEvent({
      eventType: result.event.eventType,
      routeId,
      decision: decision.decision,
      riskScore: decision.riskScore,
      message: result.event.message,
      txHash: result.event.txHash,
    });

    res.json({ success: result.success, event: loggedEvent, decision });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

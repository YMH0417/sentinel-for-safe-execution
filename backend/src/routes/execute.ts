// backend/src/routes/execute.ts — POST /execute
import { Router, Request, Response } from "express";
import { executeRoute } from "../services/vaultService.js";
import { getRouteById } from "../services/routeService.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { routeId, maxLossBps, deadline } = req.body;

    if (!routeId) {
      return res.status(400).json({ error: "routeId is required" });
    }

    // 获取 route 数据
    const route = getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: `Route ${routeId} not found` });
    }

    // 调用合约服务
    const result = await executeRoute(
      routeId,
      route.amountIn,
      route.quotedOut,
      deadline || Math.floor(Date.now() / 1000) + 3600,
      0, // riskScore — 由 agent 计算后传入
      "ALLOW",
      maxLossBps || 100
    );

    res.json({ success: result.success, event: result.event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

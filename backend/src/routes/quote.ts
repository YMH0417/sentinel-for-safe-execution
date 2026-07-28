// backend/src/routes/quote.ts — GET /quote
import { Router, Request, Response } from "express";
import { getRouteById, getRoutes } from "../services/routeService.js";
import { isDemoChainMode } from "../config/demoConfig.js";

const router = Router();

router.get("/route/:routeId", async (req: Request, res: Response) => {
  const { routeId } = req.params;
  const amount = req.query.amount ? Number(req.query.amount) : undefined;
  const tokenIn = typeof req.query.tokenIn === "string" ? req.query.tokenIn : undefined;
  const tokenOut = typeof req.query.tokenOut === "string" ? req.query.tokenOut : undefined;

  try {
    const route = await getRouteById(routeId, { tokenIn, tokenOut, amountIn: amount });
    if (!route) {
      return res.status(404).json({ error: `Route ${routeId} not found` });
    }
    res.json({ route });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote failed";
    res.status(isDemoChainMode() ? 503 : 500).json({ error: message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amount } = req.query;

  try {
    const result = await getRoutes(
      tokenIn as string | undefined,
      tokenOut as string | undefined,
      amount ? Number(amount) : undefined
    );
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote failed";
    res.status(isDemoChainMode() ? 503 : 500).json({ error: message });
  }
});

export default router;

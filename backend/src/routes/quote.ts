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
      return res.status(404).json({
        error: {
          code: "ROUTE_NOT_FOUND",
          message: `Route ${routeId} not found`,
        },
      });
    }
    return res.json({ route });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote failed";
    return res.status(isDemoChainMode() ? 503 : 500).json({
      error: {
        code: isDemoChainMode() ? "QUOTE_UNAVAILABLE" : "QUOTE_FAILED",
        message,
      },
    });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amount } = req.query;

  if (
    typeof tokenIn !== "string" ||
    tokenIn.trim() === "" ||
    typeof tokenOut !== "string" ||
    tokenOut.trim() === ""
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUOTE_REQUEST",
        message: "tokenIn and tokenOut must be non-empty strings",
      },
    });
  }

  const parsedAmount =
    typeof amount === "string" && amount.trim() !== "" ? Number(amount) : NaN;
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUOTE_REQUEST",
        message: "amount must be a positive number",
      },
    });
  }

  try {
    const result = await getRoutes(tokenIn, tokenOut, parsedAmount);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote failed";
    return res.status(isDemoChainMode() ? 503 : 500).json({
      error: {
        code: isDemoChainMode() ? "QUOTE_UNAVAILABLE" : "QUOTE_FAILED",
        message,
      },
    });
  }
});

export default router;

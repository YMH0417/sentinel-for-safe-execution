// backend/src/routes/quote.ts — GET /quote
import { Router, Request, Response } from "express";
import { getRoutes } from "../services/routeService.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
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

  const result = getRoutes(
    tokenIn,
    tokenOut,
    parsedAmount
  );

  return res.json(result);
});

export default router;

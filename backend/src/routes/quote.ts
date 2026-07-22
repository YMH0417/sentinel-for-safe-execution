// backend/src/routes/quote.ts — GET /quote
import { Router, Request, Response } from "express";
import { getRoutes } from "../services/routeService.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amount } = req.query;

  const result = getRoutes(
    tokenIn as string | undefined,
    tokenOut as string | undefined,
    amount ? Number(amount) : undefined
  );

  res.json(result);
});

export default router;

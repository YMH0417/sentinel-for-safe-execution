import { Router, Request, Response } from "express";
import { isDemoChainMode } from "../config/demoConfig.js";
import {
  recordLedgerTrade,
  getLedgerAchievementsView,
  listLedgerTrades,
  type RecordLedgerTradeInput,
} from "../services/tradeLedgerService.js";
import { invalidatePoolVolumeCache } from "../services/poolVolumeCacheService.js";
import {
  bootstrapLedgerFromChain,
  DEFAULT_BOOTSTRAP_WALLET,
} from "../services/ledgerBootstrapService.js";

const router = Router();

router.post("/trades", async (req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Ledger requires demo chain mode" });
  }

  const body = req.body as Partial<RecordLedgerTradeInput>;
  const required = ["user", "routeId", "executionMode", "safetyMode", "tokenIn", "tokenOut", "amountIn", "txHash"] as const;
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      return res.status(400).json({ error: `Missing field: ${key}` });
    }
  }

  try {
    const trade = await recordLedgerTrade(body as RecordLedgerTradeInput);
    invalidatePoolVolumeCache();
    const stats = await getLedgerAchievementsView(body.user!);
    res.status(201).json({ trade, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record trade";
    res.status(400).json({ error: message });
  }
});

router.get("/achievements/:address", async (req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Ledger requires demo chain mode" });
  }

  const addressParam = typeof req.params.address === "string" ? req.params.address.trim() : "";
  if (!addressParam) {
    return res.status(400).json({ error: "Address parameter is required" });
  }

  try {
    res.json(await getLedgerAchievementsView(addressParam));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load ledger achievements";
    res.status(400).json({ error: message });
  }
});

router.get("/trades/:address", async (req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Ledger requires demo chain mode" });
  }

  const wallet =
    typeof req.body?.wallet === "string" && req.body.wallet.trim()
      ? req.body.wallet.trim()
      : typeof req.query.wallet === "string"
        ? req.query.wallet.trim()
        : DEFAULT_BOOTSTRAP_WALLET;

  const replace =
    req.body?.replace === true ||
    req.query.replace === "true" ||
    req.query.force === "true";

  try {
    const report = await bootstrapLedgerFromChain(wallet, {
      replace,
      seedCheckCount:
        typeof req.body?.seedCheckCount === "number"
          ? req.body.seedCheckCount
          : undefined,
      seedTotalTrades:
        typeof req.body?.seedTotalTrades === "number"
          ? req.body.seedTotalTrades
          : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bootstrap failed";
    res.status(503).json({ error: message });
  }
});

export default router;

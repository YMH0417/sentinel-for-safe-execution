// backend/src/routes/debug.ts — GET /debug/status
import { Router, Request, Response } from "express";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import { isMockChainMode, getOptionalVaultAddress, getSwapWallet, getOptionalSwapRouterAddress } from "../config/chainConfig.js";
import { isDemoChainMode, loadDemoConfig } from "../config/demoConfig.js";
import { getLiveDemoConfig } from "../services/demoRegistryService.js";
import { loadRiskConfig } from "../services/agentService.js";
import { getEvents } from "../services/eventService.js";
import { assertSwapConfigured, isRouterSwapAvailable } from "../services/swapService.js";
import { getEventsFilePath } from "../services/eventService.js";
import { getPoolsHealthCacheMeta, getCachedPoolsHealth, warmPoolsHealthCache } from "../services/poolHealthCacheService.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFilePath = path.join(__dirname, "../../../shared/demo-data/routes.json");

router.get("/status", async (_req: Request, res: Response) => {
  const config = loadRiskConfig();
  let routeCount = 0;
  let routesVersion: string | null = null;
  let demoPoolCount: number | null = null;
  let demoRegistry: string | null = null;

  if (isDemoChainMode()) {
    try {
      const demo = await getLiveDemoConfig();
      demoPoolCount = demo.pools.length;
      demoRegistry = demo.registry;
      routeCount = demo.pools.length;
    } catch {
      try {
        const demo = loadDemoConfig();
        demoRegistry = demo.registry;
      } catch {
        demoPoolCount = null;
      }
    }
  } else {
    try {
      const raw = fs.readFileSync(routesFilePath, "utf-8");
      const data = JSON.parse(raw) as { routes?: unknown[]; _meta?: { version?: string } };
      routeCount = data.routes?.length ?? 0;
      routesVersion = data._meta?.version ?? null;
    } catch {
      routeCount = 0;
    }
  }

  const chainMode = isMockChainMode() ? "mock" : isDemoChainMode() ? "demo" : "rpc";
  const rpcConfigured = Boolean(process.env.RPC_URL?.trim());
  const vaultConfigured = Boolean(getOptionalVaultAddress());

  let swapWallet: string | null = null;
  let swapConfigured = false;
  let routerSwapAvailable = false;
  let swapRouter: string | null = null;
  if (isDemoChainMode() && rpcConfigured) {
    try {
      assertSwapConfigured();
      swapWallet = getSwapWallet().address;
      swapConfigured = true;
      routerSwapAvailable = isRouterSwapAvailable();
      swapRouter = getOptionalSwapRouterAddress() ?? null;
    } catch {
      swapConfigured = false;
    }
  }

  res.json({
    service: "sentinel-backend",
    version: "0.1.0",
    chainMode,
    expectedChainId: isDemoChainMode() ? 31337 : null,
    chainName: isDemoChainMode() ? "Anvil Local" : null,
    anvilRpcUrl: isDemoChainMode() ? (process.env.RPC_URL?.trim() || "http://127.0.0.1:8545") : null,
    rpcConfigured,
    vaultConfigured,
    swapConfigured,
    routerSwapAvailable,
    swapRouter,
    swapWallet,
    eventsPersistPath: getEventsFilePath(),
    demoRegistry,
    demoPoolCount,
    defaultProfile: config.defaultProfile,
    paused: config.paused,
    routeCount,
    routesVersion,
    eventCount: getEvents().length,
    poolsHealthCache: getPoolsHealthCacheMeta(),
    endpoints: [
      "GET /api/health",
      "GET /api/quote",
      "POST /api/evaluate",
      "POST /api/execute",
      "GET /api/execute/nonce",
      "GET /api/events",
      "GET /api/analysis",
      "GET /api/analysis/definition",
      "POST /api/analysis/run",
      "GET /api/config",
      "GET /api/quote/route/:routeId",
      "GET /api/demo/tokens",
      "GET /api/demo/pools",
      "POST /api/swap",
      "POST /api/swap/safe",
      "POST /api/swap/force",
      "POST /api/swap/verify-all",
      "GET /api/swap/wallet",
      "GET /api/swap/balances",
      "GET /api/debug/pools-health",
      "POST /api/debug/warm-cache",
      "GET /api/debug/status",
    ],
  });
});

router.get("/pools-health", async (req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "pools-health requires demo chain mode" });
  }
  try {
    const force = req.query.refresh === "true" || req.query.force === "true";
    const report = await getCachedPoolsHealth({ force });
    res.json({ ...report, cache: getPoolsHealthCacheMeta() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    res.status(503).json({ error: message, cache: getPoolsHealthCacheMeta() });
  }
});

router.post("/warm-cache", async (_req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.json({ warmed: false, reason: "not demo mode", cache: getPoolsHealthCacheMeta() });
  }
  try {
    const meta = getPoolsHealthCacheMeta();
    if (meta.ready && !meta.warming && (meta.ageMs ?? Infinity) < meta.ttlMs) {
      return res.json({ warmed: true, skipped: true, cache: meta });
    }
    await warmPoolsHealthCache(3);
    res.json({ warmed: getPoolsHealthCacheMeta().ready, cache: getPoolsHealthCacheMeta() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Warm cache failed";
    res.status(503).json({ warmed: false, error: message, cache: getPoolsHealthCacheMeta() });
  }
});

export default router;

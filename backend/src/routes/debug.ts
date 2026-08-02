// backend/src/routes/debug.ts — GET /debug/status
import { Router, Request, Response } from "express";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import { isMockChainMode, getOptionalVaultAddress, getSwapWallet, getOptionalSwapRouterAddress, getRpcUrl } from "../config/chainConfig.js";
import { isDemoChainMode, loadDemoConfig } from "../config/demoConfig.js";
import { getDemoChainProfile, getDemoProfile } from "../config/demoProfile.js";
import { JsonRpcProvider } from "ethers";
import { getLiveDemoConfig } from "../services/demoRegistryService.js";
import { loadRiskConfig } from "../services/agentService.js";
import { getEvents } from "../services/eventService.js";
import { assertSwapConfigured, isRouterSwapAvailable } from "../services/swapService.js";
import { isAgentSigningConfigured } from "../services/agentSignService.js";
import { getEventsFilePath } from "../services/eventService.js";
import { getPoolsHealthCacheMeta, getCachedPoolsHealth, warmPoolsHealthCache } from "../services/poolHealthCacheService.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFilePath = path.join(__dirname, "../../../shared/demo-data/routes.json");

function resolveDemoChainStatusFields(): {
  expectedChainId: number | null;
  chainName: string | null;
  demoRpcUrl: string | null;
  nativeCurrency: { name: string; symbol: string; decimals: number } | null;
  demoProfile: string | null;
  deploymentTarget: string | null;
} {
  if (!isDemoChainMode()) {
    return {
      expectedChainId: null,
      chainName: null,
      demoRpcUrl: null,
      nativeCurrency: null,
      demoProfile: null,
      deploymentTarget: null,
    };
  }

  try {
    const profile = getDemoChainProfile();
    let chainId = profile.chainId;
    let deploymentTarget = profile.deploymentTarget;

    try {
      const demo = loadDemoConfig();
      chainId = demo.chainId;
      if (demo.deploymentTarget) deploymentTarget = demo.deploymentTarget;
    } catch {
      /* manifest optional for status until deploy completes */
    }

    return {
      expectedChainId: chainId,
      chainName: profile.chainName,
      demoRpcUrl: process.env.RPC_URL?.trim() || profile.rpcUrl,
      nativeCurrency: profile.nativeCurrency,
      demoProfile: getDemoProfile(),
      deploymentTarget,
    };
  } catch {
    return {
      expectedChainId: null,
      chainName: "Demo Chain",
      demoRpcUrl: process.env.RPC_URL?.trim() || null,
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      demoProfile: process.env.DEMO_PROFILE?.trim() || null,
      deploymentTarget: null,
    };
  }
}

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
  let agentSigningAvailable = false;
  let swapRouter: string | null = null;
  if (isDemoChainMode() && rpcConfigured) {
    agentSigningAvailable = isAgentSigningConfigured();
    routerSwapAvailable = isRouterSwapAvailable();
    swapRouter = getOptionalSwapRouterAddress() ?? null;
    try {
      assertSwapConfigured();
      swapWallet = getSwapWallet().address;
      swapConfigured = true;
    } catch {
      swapConfigured = false;
    }
  }

  const demoChain = resolveDemoChainStatusFields();

  res.json({
    service: "sentinel-backend",
    version: "0.1.0",
    chainMode,
    expectedChainId: demoChain.expectedChainId,
    chainName: demoChain.chainName,
    demoRpcUrl: demoChain.demoRpcUrl,
    /** @deprecated use demoRpcUrl */
    anvilRpcUrl: demoChain.demoRpcUrl,
    nativeCurrency: demoChain.nativeCurrency,
    demoProfile: demoChain.demoProfile,
    deploymentTarget: demoChain.deploymentTarget,
    rpcConfigured,
    vaultConfigured,
    swapConfigured,
    routerSwapAvailable,
    agentSigningAvailable,
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

router.get("/rpc-check", async (_req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "rpc-check requires demo chain mode" });
  }
  try {
    const demo = loadDemoConfig();
    const profile = getDemoChainProfile();
    const rpcUrl = getRpcUrl();
    const provider = new JsonRpcProvider(rpcUrl);
    const [registryCode, usdcCode] = await Promise.all([
      provider.getCode(demo.registry),
      demo.tokens.USDC ? provider.getCode(demo.tokens.USDC) : Promise.resolve("0x"),
    ]);
    const registryDeployed = registryCode !== "0x";
    const usdcDeployed = usdcCode !== "0x";
    res.json({
      ok: registryDeployed && usdcDeployed,
      rpcUrl,
      expectedChainId: demo.chainId,
      chainName: profile.chainName,
      demoProfile: getDemoProfile(),
      deploymentTarget: demo.deploymentTarget ?? profile.deploymentTarget,
      registry: demo.registry,
      usdc: demo.tokens.USDC ?? null,
      registryDeployed,
      usdcDeployed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RPC check failed";
    res.status(503).json({ ok: false, error: message });
  }
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

// backend/src/routes/debug.ts — GET /debug/status
import { Router, Request, Response } from "express";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import { isMockChainMode } from "../config/chainConfig.js";
import { loadRiskConfig } from "../services/agentService.js";
import { getEvents } from "../services/eventService.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFilePath = path.join(__dirname, "../../../shared/demo-data/routes.json");

router.get("/status", (_req: Request, res: Response) => {
  const config = loadRiskConfig();
  let routeCount = 0;
  let routesVersion: string | null = null;

  try {
    const raw = fs.readFileSync(routesFilePath, "utf-8");
    const data = JSON.parse(raw) as { routes?: unknown[]; _meta?: { version?: string } };
    routeCount = data.routes?.length ?? 0;
    routesVersion = data._meta?.version ?? null;
  } catch {
    routeCount = 0;
  }

  const chainMode = isMockChainMode() ? "mock" : "rpc";
  const rpcConfigured = Boolean(process.env.RPC_URL?.trim());
  const vaultConfigured = Boolean(process.env.VAULT_EXECUTION_ADDRESS?.trim());

  res.json({
    service: "sentinel-backend",
    version: "0.1.0",
    chainMode,
    rpcConfigured,
    vaultConfigured,
    defaultProfile: config.defaultProfile,
    paused: config.paused,
    routeCount,
    routesVersion,
    eventCount: getEvents().length,
    endpoints: [
      "GET /api/health",
      "GET /api/quote",
      "POST /api/evaluate",
      "POST /api/execute",
      "GET /api/execute/nonce",
      "GET /api/events",
      "GET /api/config",
      "GET /api/debug/status",
    ],
  });
});

export default router;

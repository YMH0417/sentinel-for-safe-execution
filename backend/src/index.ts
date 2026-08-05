// backend/src/index.ts — Dev D: Orchestration Service 入口
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// .env is source of truth — override stale DEMO_* vars inherited from the shell.
loadEnv({ path: resolve(process.cwd(), ".env"), override: true });

import express from "express";
import cors from "cors";
import http from "http";
import quoteRouter from "./routes/quote.js";
import evaluateRouter from "./routes/evaluate.js";
import executeRouter from "./routes/execute.js";
import eventsRouter from "./routes/events.js";
import configRouter from "./routes/config.js";
import debugRouter from "./routes/debug.js";
import demoRouter from "./routes/demo.js";
import swapRouter from "./routes/swap.js";
import aiAnalysisRouter from "./routes/ai-analysis.js";
import settingsRouter from "./routes/settings.js";
import ledgerRouter from "./routes/ledger.js";
import { isMockChainMode } from "./config/chainConfig.js";
import { isDemoChainMode } from "./config/demoConfig.js";
import { warmPoolVolumeCache, startPoolVolumePolling } from "./services/poolVolumeCacheService.js";
import { maybeBootstrapLedgerOnStart } from "./services/ledgerBootstrapService.js";
import { initStorage, getStorageInfo } from "./storage/index.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Routes
app.use("/api/quote", quoteRouter);
app.use("/api/evaluate", evaluateRouter);
app.use("/api/execute", executeRouter);
app.use("/api/events", eventsRouter);
app.use("/api/config", configRouter);
app.use("/api/debug", debugRouter);
app.use("/api/demo", demoRouter);
app.use("/api/swap", swapRouter);
app.use("/api/ai-alert-analysis", aiAnalysisRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/ledger", ledgerRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "sentinel-backend", version: "0.1.0" });
});

app.use(notFoundHandler);
app.use(errorHandler);

// Start server — bind to 127.0.0.1 to avoid EACCES on Windows
const server = http.createServer(app);

async function main(): Promise<void> {
  await initStorage();
  const storage = getStorageInfo();

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n  Sentinel Backend running at http://127.0.0.1:${PORT}`);
    console.log(
      `  Storage: ${storage.driver}${storage.postgres ? " (Neon Postgres)" : " (local JSON files)"}`
    );
  console.log(`  Chain mode: ${isMockChainMode() ? "mock" : process.env.DEMO_REGISTRY_ADDRESS || process.env.DEMO_DEPLOYMENT_PATH || "demo (deployment file)"}`);
  console.log(`  API Endpoints:`);
  console.log(`    GET  /api/quote          — 获取候选 routes`);
  console.log(`    POST /api/evaluate       — Agent 风险评估`);
  console.log(`    POST /api/execute        — 链上执行（闸门校验）`);
  console.log(`    GET  /api/execute/nonce  — 查询用户 permit nonce`);
  console.log(`    GET  /api/events         — 查询事件日志`);
  console.log(`    POST /api/ai-alert-analysis — AI智能解析单条决策事件`);
  console.log(`    GET  /api/settings/llm     — 读取 LLM 配置（backend/.env）`);
  console.log(`    PUT  /api/settings/llm     — 保存 LLM 配置到 backend/.env`);
  console.log(`    GET  /api/config         — 读取 risk config`);
  console.log(`    GET  /api/quote/route/:id — 单条路由报价`);
  console.log(`    GET  /api/demo/tokens     — Demo 代币元数据`);
  console.log(`    GET  /api/demo/pools      — Demo 48 池注册表`);
  console.log(`    POST /api/swap            — Safe swap (evaluate + fallback)`);
  console.log(`    POST /api/swap/safe       — Same as POST /api/swap`);
  console.log(`    POST /api/swap/force      — Bypass Agent (dev)`);
  console.log(`    POST /api/swap/verify-all — Batch verify (default force; ?safe=true)`);
    console.log(`    GET  /api/debug/pool-volume  — 账本近 100 笔成交量（ledger 源，60s 缓存）`);
    console.log(`    POST /api/debug/warm-cache   — 预热 pool-volume 缓存`);
  console.log(`    GET  /api/swap/wallet     — Swap 钱包地址`);
  console.log(`    GET  /api/swap/balances   — Swap 钱包余额`);
    console.log(`    GET  /api/ledger/achievements/:address — 本地交易账本徽章（事件驱动）`);
    console.log(`    POST /api/ledger/trades         — 钱包 swap 完成后写入账本`);
  console.log(`    GET  /api/health         — 健康检查\n`);

  if (isDemoChainMode()) {
    void warmPoolVolumeCache();
    startPoolVolumePolling();
    void maybeBootstrapLedgerOnStart();
  }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export default app;

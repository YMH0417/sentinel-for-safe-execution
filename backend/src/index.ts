// backend/src/index.ts — Dev D: Orchestration Service 入口
import express from "express";
import cors from "cors";
import http from "http";
import quoteRouter from "./routes/quote.js";
import evaluateRouter from "./routes/evaluate.js";
import executeRouter from "./routes/execute.js";
import eventsRouter from "./routes/events.js";
import configRouter from "./routes/config.js";
import debugRouter from "./routes/debug.js";
import { isMockChainMode } from "./config/chainConfig.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/quote", quoteRouter);
app.use("/api/evaluate", evaluateRouter);
app.use("/api/execute", executeRouter);
app.use("/api/events", eventsRouter);
app.use("/api/config", configRouter);
app.use("/api/debug", debugRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "sentinel-backend", version: "0.1.0" });
});

app.use(notFoundHandler);
app.use(errorHandler);

// Start server — bind to 127.0.0.1 to avoid EACCES on Windows
const server = http.createServer(app);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Sentinel Backend running at http://127.0.0.1:${PORT}`);
  console.log(`  Chain mode: ${isMockChainMode() ? "mock" : "rpc"}`);
  console.log(`  API Endpoints:`);
  console.log(`    GET  /api/quote          — 获取候选 routes`);
  console.log(`    POST /api/evaluate       — Agent 风险评估`);
  console.log(`    POST /api/execute        — 链上执行（闸门校验）`);
  console.log(`    GET  /api/execute/nonce  — 查询用户 permit nonce`);
  console.log(`    GET  /api/events         — 查询事件日志`);
  console.log(`    GET  /api/config         — 读取 risk config`);
  console.log(`    GET  /api/debug/status   — 录屏前自检`);
  console.log(`    GET  /api/health         — 健康检查\n`);
});

export default app;

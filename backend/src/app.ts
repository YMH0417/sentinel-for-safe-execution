import express from "express";
import cors from "cors";
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
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "sentinel-backend", version: "0.1.0" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

let bootstrapPromise: Promise<void> | null = null;

/** One-time storage init + optional demo warm-up (safe for serverless). */
export function bootstrapApp(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initStorage();
      const storage = getStorageInfo();
      console.log(
        `Storage: ${storage.driver}${storage.postgres ? " (Neon Postgres)" : " (local JSON files)"}`
      );

      if (isDemoChainMode() && !process.env.VERCEL) {
        void warmPoolVolumeCache();
        startPoolVolumePolling();
        void maybeBootstrapLedgerOnStart();
      } else if (isDemoChainMode()) {
        void warmPoolVolumeCache();
      }
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

export function logStartupBanner(port: number): void {
  console.log(`\n  Sentinel Backend running at http://127.0.0.1:${port}`);
  console.log(
    `  Chain mode: ${isMockChainMode() ? "mock" : process.env.DEMO_REGISTRY_ADDRESS || "demo"}`
  );
}

// backend/src/routes/settings.ts — LLM config synced with backend/.env
import { Router, Request, Response } from "express";
import {
  readLlmEnvConfigView,
  writeLlmEnvConfig,
  type LlmEnvUpdateInput,
} from "../services/llmEnvConfigService.js";

const router = Router();

router.get("/llm", (_req: Request, res: Response) => {
  res.json(readLlmEnvConfigView());
});

router.put("/llm", (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: {
        code: "INVALID_LLM_SETTINGS",
        message: "request body must be an object",
      },
    });
  }

  const body = req.body as Record<string, unknown>;
  const input: LlmEnvUpdateInput = {};

  if ("apiKey" in body) {
    if (body.apiKey !== null && typeof body.apiKey !== "string") {
      return res.status(400).json({
        error: { code: "INVALID_LLM_SETTINGS", message: "apiKey must be a string" },
      });
    }
    input.apiKey = (body.apiKey as string) ?? "";
  }
  if ("clearApiKey" in body) {
    if (typeof body.clearApiKey !== "boolean") {
      return res.status(400).json({
        error: { code: "INVALID_LLM_SETTINGS", message: "clearApiKey must be a boolean" },
      });
    }
    input.clearApiKey = body.clearApiKey;
  }
  if ("baseUrl" in body) {
    if (typeof body.baseUrl !== "string" || !body.baseUrl.trim()) {
      return res.status(400).json({
        error: { code: "INVALID_LLM_SETTINGS", message: "baseUrl must be a non-empty string" },
      });
    }
    input.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
  }
  if ("model" in body) {
    if (typeof body.model !== "string" || !body.model.trim()) {
      return res.status(400).json({
        error: { code: "INVALID_LLM_SETTINGS", message: "model must be a non-empty string" },
      });
    }
    input.model = body.model.trim();
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return res.status(400).json({
        error: { code: "INVALID_LLM_SETTINGS", message: "enabled must be a boolean" },
      });
    }
    input.enabled = body.enabled;
  }

  try {
    const view = writeLlmEnvConfig(input);
    res.json(view);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write .env";
    res.status(500).json({
      error: { code: "LLM_SETTINGS_WRITE_FAILED", message },
    });
  }
});

export default router;

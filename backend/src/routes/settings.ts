// backend/src/routes/settings.ts — LLM config synced with backend/.env
import { Router, Request, Response } from "express";
import {
  readLlmEnvConfigView,
  writeLlmEnvConfig,
  type LlmEnvUpdateInput,
} from "../services/llmEnvConfigService.js";
import {
  getPlatformPolicy,
  updatePlatformPolicy,
  type PlatformPolicy,
} from "../services/platformPolicyService.js";

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
  if ("responseLanguage" in body) {
    if (body.responseLanguage !== "en" && body.responseLanguage !== "zh") {
      return res.status(400).json({
        error: {
          code: "INVALID_LLM_SETTINGS",
          message: 'responseLanguage must be "en" or "zh"',
        },
      });
    }
    input.responseLanguage = body.responseLanguage;
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

router.get("/platform-policy", async (_req: Request, res: Response) => {
  try {
    const policy = await getPlatformPolicy();
    res.json(policy);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read platform policy";
    res.status(500).json({ error: { code: "PLATFORM_POLICY_READ_FAILED", message } });
  }
});

router.put("/platform-policy", async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: { code: "INVALID_PLATFORM_POLICY", message: "request body must be an object" },
    });
  }
  const body = req.body as Record<string, unknown>;
  const input: Partial<PlatformPolicy> = {};
  for (const key of ["multisigSimEnabled", "blockBadToken"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") {
        return res.status(400).json({
          error: { code: "INVALID_PLATFORM_POLICY", message: `${key} must be a boolean` },
        });
      }
      input[key] = body[key] as boolean;
    }
  }
  try {
    const policy = await updatePlatformPolicy(input);
    res.json(policy);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update platform policy";
    res.status(500).json({ error: { code: "PLATFORM_POLICY_WRITE_FAILED", message } });
  }
});

export default router;

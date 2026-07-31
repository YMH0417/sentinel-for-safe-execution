import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { normalizeLlmResponseLanguage, type LlmResponseLanguage } from "../config/llmPromptConfig.js";

export interface LlmEnvConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  responseLanguage: LlmResponseLanguage;
}

export interface LlmEnvConfigView {
  envFile: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  baseUrl: string;
  model: string;
  enabled: boolean;
  responseLanguage: LlmResponseLanguage;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const CANONICAL_KEYS = [
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_ANALYSIS_ENABLED",
  "LLM_RESPONSE_LANGUAGE",
] as const;

/** Legacy alias keys — read-only fallback; removed from file when saving canonical keys. */
const ALIAS_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
] as const;

const ALL_MANAGED_KEYS = [...CANONICAL_KEYS, ...ALIAS_KEYS];

export function resolveEnvFilePath(): string {
  return resolve(process.cwd(), ".env");
}

function parseEnvLines(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function firstNonEmpty(map: Map<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = map.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

function readEnvMap(): Map<string, string> {
  const merged = new Map<string, string>();
  const path = resolveEnvFilePath();
  if (existsSync(path)) {
    for (const [k, v] of parseEnvLines(readFileSync(path, "utf-8"))) {
      merged.set(k, v);
    }
  }
  for (const key of ALL_MANAGED_KEYS) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) merged.set(key, fromProcess);
  }
  return merged;
}

export function maskApiKey(apiKey: string): string | null {
  if (!apiKey.trim()) return null;
  if (apiKey.length <= 8) return "****";
  return `****${apiKey.slice(-4)}`;
}

export function readLlmEnvConfig(): LlmEnvConfig {
  const map = readEnvMap();
  const apiKey = firstNonEmpty(map, ["LLM_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"]);
  const baseUrl =
    firstNonEmpty(map, ["LLM_BASE_URL", "OPENAI_BASE_URL", "DEEPSEEK_BASE_URL"]) ||
    DEFAULT_BASE_URL;
  const model =
    firstNonEmpty(map, ["LLM_MODEL", "OPENAI_MODEL", "DEEPSEEK_MODEL"]) || DEFAULT_MODEL;
  const enabledRaw = map.get("LLM_ANALYSIS_ENABLED")?.trim().toLowerCase();
  const enabled = enabledRaw !== "false";
  const responseLanguage = normalizeLlmResponseLanguage(map.get("LLM_RESPONSE_LANGUAGE"));

  return { apiKey, baseUrl, model, enabled, responseLanguage };
}

export function readLlmEnvConfigView(): LlmEnvConfigView {
  const config = readLlmEnvConfig();
  return {
    envFile: resolveEnvFilePath(),
    apiKeyConfigured: Boolean(config.apiKey),
    apiKeyMasked: maskApiKey(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: config.enabled,
    responseLanguage: config.responseLanguage,
  };
}

export function applyLlmEnvToProcess(config: LlmEnvConfig): void {
  if (config.apiKey) {
    process.env.LLM_API_KEY = config.apiKey;
  } else {
    delete process.env.LLM_API_KEY;
  }
  process.env.LLM_BASE_URL = config.baseUrl;
  process.env.LLM_MODEL = config.model;
  process.env.LLM_ANALYSIS_ENABLED = config.enabled ? "true" : "false";
  process.env.LLM_RESPONSE_LANGUAGE = config.responseLanguage;
}

export interface LlmEnvUpdateInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  responseLanguage?: LlmResponseLanguage;
  /** When true, clear stored API key even if apiKey field is omitted. */
  clearApiKey?: boolean;
}

export function writeLlmEnvConfig(input: LlmEnvUpdateInput): LlmEnvConfigView {
  const current = readLlmEnvConfig();
  const next: LlmEnvConfig = {
    apiKey: current.apiKey,
    baseUrl: input.baseUrl?.trim() || current.baseUrl || DEFAULT_BASE_URL,
    model: input.model?.trim() || current.model || DEFAULT_MODEL,
    enabled: input.enabled ?? current.enabled,
    responseLanguage: input.responseLanguage ?? current.responseLanguage,
  };

  if (input.clearApiKey) {
    next.apiKey = "";
  } else if (input.apiKey !== undefined) {
    next.apiKey = input.apiKey.trim();
  }

  const path = resolveEnvFilePath();
  const originalLines = existsSync(path) ? readFileSync(path, "utf-8").split(/\r?\n/) : [];
  const updates: Record<string, string | undefined> = {
    LLM_BASE_URL: next.baseUrl,
    LLM_MODEL: next.model,
    LLM_ANALYSIS_ENABLED: next.enabled ? "true" : "false",
    LLM_RESPONSE_LANGUAGE: next.responseLanguage,
    LLM_API_KEY: next.apiKey || undefined,
  };

  const keysToReplace = new Set<string>([...CANONICAL_KEYS, ...ALIAS_KEYS]);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of originalLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      output.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      output.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!keysToReplace.has(key)) {
      output.push(line);
      continue;
    }
    if (key in updates) {
      seen.add(key);
      const value = updates[key as keyof typeof updates];
      if (value !== undefined && value !== "") {
        output.push(`${key}=${value}`);
      }
    }
    // Drop alias / stale managed lines not in canonical updates map
  }

  for (const key of CANONICAL_KEYS) {
    if (seen.has(key)) continue;
    const value = updates[key];
    if (value !== undefined && value !== "") {
      output.push(`${key}=${value}`);
    }
  }

  const body = output.join("\n");
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`, "utf-8");
  applyLlmEnvToProcess(next);
  return readLlmEnvConfigView();
}

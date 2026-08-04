import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import type {
  Decision,
  Route,
  SafetyExplanation,
  DashboardOverviewInput,
  DashboardOverviewExplanation,
} from "../types.js";
import {
  getLlmPromptBundle,
  getDashboardOverviewPromptBundle,
  type LlmResponseLanguage,
} from "../config/llmPromptConfig.js";
import { readLlmEnvConfig } from "./llmEnvConfigService.js";
import { postJson } from "../utils/platformFetch.js";

interface PostTrainExample {
  decision: string;
  flags: string[];
  tone: string;
  example: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const examplesFilePath = path.join(__dirname, "../config/llm-examples.json");

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

function loadPostTrainExamples(): PostTrainExample[] {
  try {
    const raw = fs.readFileSync(examplesFilePath, "utf-8");
    return JSON.parse(raw) as PostTrainExample[];
  } catch {
    return [];
  }
}

function quoteDeviation(route?: Route): number {
  if (!route || route.expectedOut === 0) return 0;
  return Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
}

function getConfig() {
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY;
  const baseUrl = (
    process.env.LLM_BASE_URL ||
    process.env.GROQ_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model =
    process.env.LLM_MODEL ||
    process.env.GROQ_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_MODEL;
  const enabled = process.env.LLM_ANALYSIS_ENABLED !== "false";
  const responseLanguage = readLlmEnvConfig().responseLanguage;

  return { apiKey, baseUrl, model, enabled, responseLanguage };
}

function llmRequestTimeoutMs(): number {
  const fromEnv = Number(process.env.LLM_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(fromEnv, 10_000);
  }
  return DEFAULT_TIMEOUT_MS;
}

function formatLlmFetchError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error) {
    const aborted =
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("aborted") ||
      error.message.toLowerCase().includes("abort");
    if (aborted) {
      return new Error(`大模型响应超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试。`);
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

function compactDecision(decision: Decision) {
  return {
    decision: decision.decision,
    riskScore: decision.riskScore,
    reason: decision.reason,
    routeId: decision.routeId,
    fallbackRouteId: decision.fallbackRouteId,
    flags: decision.flags,
  };
}

function compactRoute(route?: Route) {
  if (!route) return null;
  return {
    routeId: route.routeId,
    label: route.label,
    tokenIn: route.tokenIn,
    tokenOut: route.tokenOut,
    amountIn: route.amountIn,
    quotedOut: route.quotedOut,
    expectedOut: route.expectedOut,
    quoteDeviation: quoteDeviation(route),
    poolRiskScore: route.poolRiskScore,
    historicalFailureRate: route.historicalFailureRate,
    supportsFallback: route.supportsFallback,
    fallbackRouteId: route.fallbackRouteId,
    warningFlags: route.warningFlags,
    notes: route.notes,
  };
}

function buildPrompt(
  decision: Decision,
  route: Route | undefined,
  configProfile: string,
  language: LlmResponseLanguage
): string {
  const examples = loadPostTrainExamples();
  const prompts = getLlmPromptBundle(language);
  return JSON.stringify(
    {
      task: prompts.taskInstruction,
      responseLanguage: language,
      configProfile,
      route: compactRoute(route),
      deterministicDecision: compactDecision(decision),
      postTrainStyleExamples: examples,
    },
    null,
    2
  );
}

function parseLlmResponse(
  text: string,
  language: LlmResponseLanguage
): {
  narrative: string;
  attackVector: string;
  recommendations: string[];
  confidence: number;
} {
  const prompts = getLlmPromptBundle(language);
  let cleanText = text.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/```\n?/g, "");
  }

  const parsed = JSON.parse(cleanText) as {
    narrative?: unknown;
    attackVector?: unknown;
    recommendations?: unknown;
    confidence?: unknown;
  };

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .slice(0, 3)
    : [];

  if (typeof parsed.narrative !== "string" || !parsed.narrative.trim()) {
    throw new Error("LLM response missing narrative");
  }

  return {
    narrative: parsed.narrative.trim(),
    attackVector:
      typeof parsed.attackVector === "string" && parsed.attackVector.trim()
        ? parsed.attackVector.trim()
        : prompts.attackVectorUnknown,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : [prompts.defaultRecommendation],
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
        : 70,
  };
}

async function requestLlmNarrative(
  decision: Decision,
  route: Route | undefined,
  configProfile: string
): Promise<{ narrative: string; attackVector: string; recommendations: string[]; confidence: number; model: string }> {
  const { apiKey, baseUrl, model, enabled, responseLanguage } = getConfig();
  if (!enabled) {
    throw new Error("LLM analysis disabled by LLM_ANALYSIS_ENABLED=false");
  }
  if (!apiKey) {
    throw new Error("LLM API key not configured (set LLM_API_KEY or GROQ_API_KEY)");
  }

  const timeoutMs = llmRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const prompts = getLlmPromptBundle(responseLanguage);

  try {
    const { status, text } = await postJson(
      `${baseUrl}/chat/completions`,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompts.systemMessage },
          {
            role: "user",
            content: buildPrompt(decision, route, configProfile, responseLanguage),
          },
        ],
      }),
      controller.signal
    );

    if (status < 200 || status >= 300) {
      throw new Error(`LLM HTTP ${status}: ${text}`);
    }

    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("LLM returned empty content");
    }

    const parsed = parseLlmResponse(content, responseLanguage);
    return { ...parsed, model: payload.model || model };
  } catch (error) {
    throw formatLlmFetchError(error, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainSafetyDecision(
  decision: Decision,
  route: Route | undefined,
  configProfile: string
): Promise<SafetyExplanation> {
  const generatedAt = new Date().toISOString();
  const result = await requestLlmNarrative(decision, route, configProfile);

  return {
    narrative: result.narrative,
    attackVector: result.attackVector,
    recommendations: result.recommendations,
    confidence: result.confidence,
    source: "llm",
    model: result.model,
    generatedAt,
  };
}

function buildDashboardOverviewPrompt(
  input: DashboardOverviewInput,
  language: LlmResponseLanguage
): string {
  const prompts = getDashboardOverviewPromptBundle(language);
  return JSON.stringify(
    {
      task: prompts.taskInstruction,
      responseLanguage: language,
      snapshot: input,
    },
    null,
    2
  );
}

function parseDashboardOverviewResponse(
  text: string,
  language: LlmResponseLanguage
): {
  headline: string;
  narrative: string;
  highlights: string[];
  confidence: number;
} {
  const prompts = getDashboardOverviewPromptBundle(language);
  let cleanText = text.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/```\n?/g, "");
  }

  const parsed = JSON.parse(cleanText) as {
    headline?: unknown;
    narrative?: unknown;
    highlights?: unknown;
    confidence?: unknown;
  };

  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .slice(0, 3)
    : [];

  if (typeof parsed.narrative !== "string" || !parsed.narrative.trim()) {
    throw new Error("LLM response missing narrative");
  }

  return {
    headline:
      typeof parsed.headline === "string" && parsed.headline.trim()
        ? parsed.headline.trim()
        : prompts.defaultHeadline,
    narrative: parsed.narrative.trim(),
    highlights,
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
        : 70,
  };
}

async function requestDashboardOverviewNarrative(
  input: DashboardOverviewInput
): Promise<{
  headline: string;
  narrative: string;
  highlights: string[];
  confidence: number;
  model: string;
}> {
  const { apiKey, baseUrl, model, enabled, responseLanguage } = getConfig();
  if (!enabled) {
    throw new Error("LLM analysis disabled by LLM_ANALYSIS_ENABLED=false");
  }
  if (!apiKey) {
    throw new Error("LLM API key not configured (set LLM_API_KEY or GROQ_API_KEY)");
  }

  const timeoutMs = llmRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const prompts = getDashboardOverviewPromptBundle(responseLanguage);

  try {
    const { status, text } = await postJson(
      `${baseUrl}/chat/completions`,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 320,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompts.systemMessage },
          {
            role: "user",
            content: buildDashboardOverviewPrompt(input, responseLanguage),
          },
        ],
      }),
      controller.signal
    );

    if (status < 200 || status >= 300) {
      throw new Error(`LLM HTTP ${status}: ${text}`);
    }

    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("LLM returned empty content");
    }

    const parsed = parseDashboardOverviewResponse(content, responseLanguage);
    return { ...parsed, model: payload.model || model };
  } catch (error) {
    throw formatLlmFetchError(error, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainDashboardOverview(
  input: DashboardOverviewInput
): Promise<DashboardOverviewExplanation> {
  const generatedAt = new Date().toISOString();
  const result = await requestDashboardOverviewNarrative(input);

  return {
    headline: result.headline,
    narrative: result.narrative,
    highlights: result.highlights,
    confidence: result.confidence,
    source: "llm",
    model: result.model,
    generatedAt,
  };
}

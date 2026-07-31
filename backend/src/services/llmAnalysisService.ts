import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import type { Decision, Route, SafetyExplanation } from "../types.js";
import { getLlmPromptBundle, type LlmResponseLanguage } from "../config/llmPromptConfig.js";
import { readLlmEnvConfig } from "./llmEnvConfigService.js";

// 领域风格样例：约束大模型在 Web3/AMM 语境下的表达方式，不参与规则打分。
interface PostTrainExample {
  decision: string;
  flags: string[];
  tone: string;
  example: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const examplesFilePath = path.join(__dirname, "../config/llm-examples.json");

// OpenAI-compatible Chat Completions API (any provider with /chat/completions).
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// 读取本地风格样例。读取失败时降级为空样例，不影响核心调用链。
function loadPostTrainExamples(): PostTrainExample[] {
  try {
    const raw = fs.readFileSync(examplesFilePath, "utf-8");
    return JSON.parse(raw) as PostTrainExample[];
  } catch {
    return [];
  }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function quoteDeviation(route?: Route): number {
  if (!route || route.expectedOut === 0) return 0;
  return Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
}

// LLM 解释层配置（OpenAI 兼容：base URL + API key + model）。
// 优先 LLM_*，也兼容 OPENAI_* / DEEPSEEK_*。未配置 key 或 LLM_ANALYSIS_ENABLED=false 时调用失败。
function getConfig() {
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY;
  const baseUrl = (
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const enabled = process.env.LLM_ANALYSIS_ENABLED !== "false";
  const responseLanguage = readLlmEnvConfig().responseLanguage;

  return { apiKey, baseUrl, model, enabled, responseLanguage };
}

function isZhipuProvider(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes("bigmodel.cn") || lower.includes("z.ai");
}

function llmRequestTimeoutMs(baseUrl: string): number {
  const fromEnv = Number(process.env.LLM_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return isZhipuProvider(baseUrl) ? 30_000 : 6_000;
}

function extractMessageText(message?: {
  content?: string;
  reasoning_content?: string;
}): string {
  const content = message?.content?.trim();
  if (content) return content;
  const reasoning = message?.reasoning_content?.trim();
  if (!reasoning) return "";
  // GLM thinking mode may put JSON in reasoning_content; prefer last JSON object block.
  const jsonMatch = reasoning.match(/\{[\s\S]*\}\s*$/);
  return jsonMatch?.[0]?.trim() ?? reasoning;
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

// 构造给大模型的最小上下文：传入规则引擎已算出的结果和必要 route 指标，
// 避免模型重新“裁决”交易。强制 JSON 输出，便于结构化消费。
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

// 剥离可能的 markdown 代码块后解析 JSON。仿 sentineldao 的 parseResponse。
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

// 调用 OpenAI 兼容 Chat Completions 生成结构化解释。超时 6 秒，防止外部模型拖慢安全评估链路。
// 失败（无 key / 超时 / HTTP 非 2xx / 解析失败）一律抛错，由调用方决定如何对外暴露。
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
    throw new Error(
      "LLM API key not configured (set LLM_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY)"
    );
  }

  const controller = new AbortController();
  const timeoutMs = llmRequestTimeoutMs(baseUrl);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const prompts = getLlmPromptBundle(responseLanguage);

  const requestBody: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: prompts.systemMessage,
      },
      {
        role: "user",
        content: buildPrompt(decision, route, configProfile, responseLanguage),
      },
    ],
  };
  if (isZhipuProvider(baseUrl)) {
    // GLM-4.7-Flash defaults to thinking mode; disable for direct JSON in content.
    requestBody.thinking = { type: "disabled" };
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      model?: string;
    };
    const content = extractMessageText(payload.choices?.[0]?.message);
    if (!content) {
      throw new Error("LLM returned empty content");
    }

    const parsed = parseLlmResponse(content, responseLanguage);
    return { ...parsed, model: payload.model || model };
  } finally {
    clearTimeout(timeout);
  }
}

// 统一出口：成功返回结构化 SafetyExplanation，失败抛错。
// 原有 ALLOW/REJECT/FALLBACK_TO_SAFE_ROUTE 决策仍由 agentService 的确定性规则产生。
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

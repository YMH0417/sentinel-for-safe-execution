import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import { Decision, Route, SafetyExplanation } from "../types.js";

// 新增：约束大模型表达方式的样例
interface PostTrainExample {
  decision: string;
  flags: string[];
  tone: string;
  example: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 新增：风格样例文件。JSON 本身不能写注释，所以说明放在这里。
const examplesFilePath = path.join(__dirname, "../config/llm-examples.json");

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// 新增：读取本地风格样例。
// 读取失败时直接降级为空样例，保证核心评估接口不被解释层影响。
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

// 新增：本地兜底解释器。
// 当未配置 API Key、模型超时或模型服务不可用时，仍能给用户自然语言说明。
function buildLocalNarrative(decision: Decision, route?: Route): string {
  if (!route) {
    return `The route could not be evaluated safely because "${decision.routeId}" was not found. The system rejected execution to avoid acting on unknown route data.`;
  }

  const deviation = quoteDeviation(route);
  const metrics = `Quote deviation is ${pct(deviation)}, historical failure rate is ${pct(route.historicalFailureRate)}, and pool risk is ${route.poolRiskScore}/100.`;

  if (decision.decision === "ALLOW") {
    return `This route can proceed because the combined risk score is ${decision.riskScore}/100 and no blocking risk flags were triggered. ${metrics} The main residual risk is normal market movement between quote and execution, so the configured loss limit should still remain active.`;
  }

  if (decision.decision === "FALLBACK_TO_SAFE_ROUTE") {
    return `This route is usable only with extra caution because the risk score is ${decision.riskScore}/100 and the active flags are ${decision.flags.join(", ") || "moderate-risk signals"}. ${metrics} The safer action is to switch to fallback route ${decision.fallbackRouteId ?? "the configured fallback"} before execution.`;
  }

  return `This route should be blocked because the risk score is ${decision.riskScore}/100 and the active flags are ${decision.flags.join(", ") || "critical-risk signals"}. ${metrics} Executing it could expose the user to failed settlement, excessive slippage, or pool-level manipulation risk.`;
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

// 新增：构造给大模型的最小上下文。
// 只传入规则引擎已经算出的结果和必要 route 指标，避免模型重新“裁决”交易。
function buildPrompt(decision: Decision, route: Route | undefined, configProfile: string): string {
  const examples = loadPostTrainExamples();
  return JSON.stringify(
    {
      task: "Explain the deterministic safety evaluation to an end user in natural language. Do not change the decision. Do not promise guaranteed execution. Mention why it succeeded or failed, the main risk, and the recommended next action. Keep it under 90 words.",
      configProfile,
      route: compactRoute(route),
      deterministicDecision: compactDecision(decision),
      postTrainStyleExamples: examples,
    },
    null,
    2
  );
}

// 新增：LLM 解释层配置。
// 支持 OpenAI 兼容接口；LLM_ANALYSIS_ENABLED=false 可关闭模型请求。
function getConfig() {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const enabled = process.env.LLM_ANALYSIS_ENABLED !== "false";

  return { apiKey, baseUrl, model, enabled };
}

// 新增：调用大模型生成用户可读解释。
// 这里把超时控制在 6 秒，防止外部模型拖慢或阻塞安全评估链路。
async function requestLlmNarrative(decision: Decision, route: Route | undefined, configProfile: string): Promise<{ narrative: string; model: string } | null> {
  const { apiKey, baseUrl, model, enabled } = getConfig();
  if (!enabled || !apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content: "You are Sentinel's safety-result explainer. Your output is concise, user-facing, and faithful to the deterministic risk engine.",
          },
          {
            role: "user",
            content: buildPrompt(decision, route, configProfile),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    return {
      narrative: content,
      model: payload.model || model,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// 新增：统一出口。优先使用 LLM 解释，失败则回退到本地解释。
// 原有 ALLOW/REJECT/FALLBACK_TO_SAFE_ROUTE 决策仍由 agentService 的确定性规则产生。
export async function explainSafetyDecision(
  decision: Decision,
  route: Route | undefined,
  configProfile: string
): Promise<SafetyExplanation> {
  const generatedAt = new Date().toISOString();
  const llmResult = await requestLlmNarrative(decision, route, configProfile);

  if (llmResult) {
    return {
      narrative: llmResult.narrative,
      source: "llm",
      model: llmResult.model,
      generatedAt,
    };
  }

  return {
    narrative: buildLocalNarrative(decision, route),
    source: "local-post-train",
    model: "built-in-safety-explainer",
    generatedAt,
  };
}

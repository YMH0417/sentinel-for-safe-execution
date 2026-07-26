// backend/src/services/agentService.ts — Dev E: Execution Safety Agent
// Rule-based 风险判断引擎 — deterministic 决策

import { fileURLToPath } from "url";
import { Decision, Route, RiskConfig } from "../types.js";
import * as path from "path";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFilePath = path.join(__dirname, "../config/risk-config.json");

export function loadRiskConfig(): RiskConfig {
  const raw = fs.readFileSync(configFilePath, "utf-8");
  return JSON.parse(raw) as RiskConfig;
}

function getRoutesPath(): string {
  return path.join(__dirname, "../../../shared/demo-data/routes.json");
}

type ProfileName = keyof RiskConfig["profiles"];

function resolveProfile(config: RiskConfig, configProfile: string): RiskConfig["profiles"]["normal"] {
  if (configProfile in config.profiles) {
    return config.profiles[configProfile as ProfileName];
  }
  return config.profiles[config.defaultProfile as ProfileName] ?? config.profiles.normal;
}

/**
 * 计算 risk score (0-100)
 */
function calculateRiskScore(
  route: Route,
  profile: RiskConfig["profiles"]["normal"]
): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  // Rule A: Quote Deviation
  const quoteDeviation = Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
  if (quoteDeviation > profile.maxQuoteDeviationThreshold) {
    flags.push("quote_deviation");
    score += Math.min(35, Math.round(quoteDeviation * 500));
  }

  // Rule B: Failure Risk
  if (route.historicalFailureRate > profile.failureThreshold) {
    flags.push("failure_risk");
    score += Math.min(30, Math.round((route.historicalFailureRate - profile.failureThreshold) * 200));
  }

  // Rule C: Pool Risk
  if (route.poolRiskScore > profile.poolRiskThreshold) {
    flags.push("pool_risk");
    score += Math.round(route.poolRiskScore / 3);
  }

  return { score: Math.min(100, score), flags };
}

function loadRoute(routeId: string): Route | undefined {
  const raw = fs.readFileSync(getRoutesPath(), "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };
  return data.routes.find(r => r.routeId === routeId);
}

/**
 * 核心评估函数 — Dev E 的 deliverable
 */
export function evaluateRoute(routeId: string, configProfile: string = "normal"): Decision {
  const route = loadRoute(routeId);
  if (!route) {
    const reason = `Route "${routeId}" not found in available routes.`;
    return {
      decision: "REJECT",
      riskScore: 100,
      reason,
      reasonTechnical: `route_not_found: no entry for routeId=${routeId} in shared/demo-data/routes.json`,
      routeId,
      fallbackRouteId: null,
      flags: ["route_not_found"],
    };
  }

  const config = loadRiskConfig();
  const profile = resolveProfile(config, configProfile);
  const { score, flags } = calculateRiskScore(route, profile);

  let decision: Decision["decision"];
  let reason: string;
  let reasonTechnical: string;

  if (score >= 70) {
    decision = "REJECT";
    reason = generateReason("reject", route, score, flags);
    reasonTechnical = buildTechnicalReason(route, profile, score, flags, "REJECT");
  } else if (score >= 40 && route.supportsFallback) {
    decision = "FALLBACK_TO_SAFE_ROUTE";
    reason = generateReason("fallback", route, score, flags);
    reasonTechnical = buildTechnicalReason(route, profile, score, flags, "FALLBACK_TO_SAFE_ROUTE", route.fallbackRouteId);
  } else {
    decision = "ALLOW";
    reason = generateReason("allow", route, score, flags);
    reasonTechnical = buildTechnicalReason(route, profile, score, flags, "ALLOW");
  }

  return {
    decision,
    riskScore: score,
    reason,
    reasonTechnical,
    routeId: route.routeId,
    fallbackRouteId: route.fallbackRouteId,
    flags,
  };
}

function buildTechnicalReason(
  route: Route,
  profile: RiskConfig["profiles"]["normal"],
  score: number,
  flags: string[],
  decision: Decision["decision"],
  fallbackRouteId: string | null = null
): string {
  const quoteDeviation = Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
  const parts = [
    `profile thresholds: quoteDeviation>${profile.maxQuoteDeviationThreshold}, failure>${profile.failureThreshold}, poolRisk>${profile.poolRiskThreshold}`,
    `route metrics: quoteDeviation=${(quoteDeviation * 100).toFixed(2)}%, failureRate=${(route.historicalFailureRate * 100).toFixed(0)}%, poolRiskScore=${route.poolRiskScore}`,
    `flags=[${flags.join(", ")}]`,
    `riskScore=${score}`,
    `decision=${decision}`,
  ];
  if (fallbackRouteId) {
    parts.push(`fallbackRouteId=${fallbackRouteId}`);
  }
  return parts.join(" | ");
}

function generateReason(type: "allow" | "reject" | "fallback", route: Route, score: number, flags: string[]): string {
  const issues: string[] = [];
  const quoteDeviation = Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
  if (quoteDeviation > 0.005) {
    issues.push(`报价偏差 ${(quoteDeviation * 100).toFixed(1)}%（预期 ${route.expectedOut}，实际报价 ${route.quotedOut}）`);
  }
  if (route.historicalFailureRate > 0.1) {
    issues.push(`历史失败率 ${(route.historicalFailureRate * 100).toFixed(0)}%`);
  }
  if (route.poolRiskScore > 50) {
    issues.push(`池子风险评分 ${route.poolRiskScore}/100`);
  }

  switch (type) {
    case "allow":
      return `风险评分 ${score}/100，处于安全范围。报价、失败率与池风险均在可接受阈值内，可以执行此路由。`;
    case "reject":
      return `风险评分 ${score}/100，已超过危险阈值（≥70）。${issues.length > 0 ? "主要问题：" + issues.join("；") + "。" : ""}建议拒绝执行，避免潜在损失。`;
    case "fallback":
      return `风险评分 ${score}/100，处于警告区间。${issues.length > 0 ? "发现：" + issues.join("；") + "。" : ""}建议切换到更安全的备用路由${route.fallbackRouteId ? `（${route.fallbackRouteId}）` : ""}。`;
    default:
      return "未知决策类型。";
  }
}

// backend/src/services/agentService.ts — Dev E: Execution Safety Agent

import { fileURLToPath } from "url";
import { Decision, DecisionEvidence, Route, RiskConfig } from "../types.js";
import * as path from "path";
import * as fs from "fs";
import { isDemoChainMode } from "../config/demoConfig.js";
import { getRouteById } from "./routeService.js";
import { getTokenRiskTag, inferQuoteParamsFromRouteId, QuoteParams } from "./chainQuoteService.js";

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

function calculateRiskScore(
  route: Route,
  profile: RiskConfig["profiles"]["normal"]
): { score: number; flags: string[] } {
  const flags: string[] = [...route.warningFlags];
  let score = 0;

  const quoteDeviation = Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
  if (quoteDeviation > profile.maxQuoteDeviationThreshold) {
    if (!flags.includes("quote_deviation")) flags.push("quote_deviation");
    score += Math.min(35, Math.round(quoteDeviation * 500));
  }

  if (route.historicalFailureRate > profile.failureThreshold) {
    if (!flags.includes("failure_risk")) flags.push("failure_risk");
    score += Math.min(30, Math.round((route.historicalFailureRate - profile.failureThreshold) * 200));
  }

  if (route.poolRiskScore > profile.poolRiskThreshold) {
    if (!flags.includes("pool_risk")) flags.push("pool_risk");
    score += Math.round(route.poolRiskScore / 3);
  }

  if (route.priceImpactBps && route.priceImpactBps > 500 && !flags.includes("high_price_impact")) {
    flags.push("high_price_impact");
  }

  return { score: Math.min(100, score), flags: [...new Set(flags)] };
}

function decisionEvidence(route: Route): DecisionEvidence {
  return {
    quotedOut: route.quotedOut,
    expectedOut: route.expectedOut,
    quoteDeviation:
      route.expectedOut === 0
        ? 0
        : Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut,
    historicalFailureRate: route.historicalFailureRate,
    poolRiskScore: route.poolRiskScore,
    ...(route.priceImpactBps !== undefined
      ? { priceImpactBps: route.priceImpactBps }
      : {}),
    ...(route.poolLabel ? { poolLabel: route.poolLabel } : {}),
  };
}

function loadMockRoute(routeId: string): Route | undefined {
  const raw = fs.readFileSync(getRoutesPath(), "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };
  return data.routes.find((r) => r.routeId === routeId);
}

async function loadRoute(routeId: string, quoteParams: QuoteParams = {}): Promise<Route | undefined> {
  if (isDemoChainMode()) {
    return getRouteById(routeId, inferQuoteParamsFromRouteId(routeId, quoteParams));
  }
  return loadMockRoute(routeId);
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
  if (route.priceImpactBps && route.priceImpactBps > 500) {
    issues.push(`价格冲击 ${route.priceImpactBps} bps`);
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

export async function evaluateRoute(
  routeId: string,
  configProfile: string = "normal",
  quoteParams: QuoteParams = {}
): Promise<Decision> {
  const route = await loadRoute(routeId, quoteParams);
  if (!route) {
    const reason = `Route "${routeId}" not found in available routes.`;
    return {
      decision: "REJECT",
      riskScore: 100,
      reason,
      reasonTechnical: `route_not_found: no entry for routeId=${routeId}`,
      routeId,
      fallbackRouteId: null,
      flags: ["route_not_found"],
    };
  }

  if (isDemoChainMode()) {
    const tokenOut = route.tokenOut.toUpperCase();
    if (tokenOut === "BAD" || tokenOut === "BAIT") {
      const riskTag = await getTokenRiskTag(tokenOut as "BAD" | "BAIT");
      const tokenFlag = tokenOut === "BAIT" ? "suspicious_token" : "high_token_risk";
      return {
        decision: "REJECT",
        riskScore: 100,
        reason:
          tokenOut === "BAIT"
            ? "目标资产被标记为诱骗型代币（BAIT），无论池子报价如何都不应执行。"
            : "目标资产被标记为高风险代币（BAD），即使池子流动性正常也应拒绝执行。",
        reasonTechnical: `token_risk: tokenOut=${tokenOut}, registryRiskTag=${riskTag}`,
        routeId: route.routeId,
        fallbackRouteId: null,
        flags: [tokenFlag, ...route.warningFlags],
        evidence: decisionEvidence(route),
      };
    }
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
    reasonTechnical = buildTechnicalReason(
      route,
      profile,
      score,
      flags,
      "FALLBACK_TO_SAFE_ROUTE",
      route.fallbackRouteId
    );
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
    evidence: decisionEvidence(route),
  };
}

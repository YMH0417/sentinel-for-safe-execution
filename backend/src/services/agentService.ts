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

/**
 * 计算 risk score (0-100)
 */
function calculateRiskScore(route: Route, config: RiskConfig): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  const profile = (config.profiles as any)[config.defaultProfile] || config.profiles.normal;

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
    return {
      decision: "REJECT",
      riskScore: 100,
      reason: `Route "${routeId}" not found in available routes.`,
      routeId,
      fallbackRouteId: null,
      flags: ["route_not_found"],
    };
  }

  const config = loadRiskConfig();
  if (configProfile !== config.defaultProfile) {
    (config as any).defaultProfile = configProfile;
  }

  const { score, flags } = calculateRiskScore(route, config);

  let decision: Decision["decision"];
  let reason: string;

  if (score >= 70) {
    decision = "REJECT";
    reason = generateReason("reject", route, score, flags);
  } else if (score >= 40 && route.supportsFallback) {
    decision = "FALLBACK_TO_SAFE_ROUTE";
    reason = generateReason("fallback", route, score, flags);
  } else {
    decision = "ALLOW";
    reason = generateReason("allow", route, score, flags);
  }

  return {
    decision,
    riskScore: score,
    reason,
    routeId: route.routeId,
    fallbackRouteId: route.fallbackRouteId,
    flags,
  };
}

function generateReason(type: "allow" | "reject" | "fallback", route: Route, score: number, flags: string[]): string {
  const deviations: string[] = [];
  const quoteDeviation = Math.abs(route.quotedOut - route.expectedOut) / route.expectedOut;
  if (quoteDeviation > 0.005) {
    deviations.push(`quote deviation ${(quoteDeviation * 100).toFixed(1)}%`);
  }
  if (route.historicalFailureRate > 0.1) {
    deviations.push(`failure rate ${(route.historicalFailureRate * 100).toFixed(0)}%`);
  }
  if (route.poolRiskScore > 50) {
    deviations.push(`pool risk score ${route.poolRiskScore}`);
  }

  switch (type) {
    case "allow":
      return `Risk score ${score}/100 is below threshold. All metrics within acceptable ranges. Route is safe to execute.`;
    case "reject":
      return `Risk score ${score}/100 exceeds 70 threshold. Flags: [${flags.join(", ")}]. ${deviations.length > 0 ? "Issues: " + deviations.join("; ") : ""}`;
    case "fallback":
      return `Risk score ${score}/100 is moderate. ${deviations.length > 0 ? "Concerns: " + deviations.join("; ") + ". " : ""}Switching to safer fallback route.`;
    default:
      return "Unknown decision type.";
  }
}

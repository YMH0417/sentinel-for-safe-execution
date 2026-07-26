// shared/types/decision.ts — Decision 统一类型定义（全队共享）

export type DecisionType = "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";

export interface Decision {
  decision: DecisionType;
  riskScore: number;
  reason: string;
  /** Judge-facing technical breakdown; optional for backward compatibility */
  reasonTechnical?: string;
  routeId: string;
  fallbackRouteId: string | null;
  flags: string[];
}

export interface EvaluateRequest {
  routeId: string;
  configProfile: "normal" | "conservative" | "aggressive";
}

export function createMockDecision(routeId: string, decisionType: DecisionType): Decision {
  const decisions: Record<DecisionType, Omit<Decision, "routeId" | "fallbackRouteId">> = {
    ALLOW: {
      decision: "ALLOW",
      riskScore: 0,
      reason: "All risk metrics within acceptable thresholds. Route is safe to execute.",
      flags: [],
    },
    REJECT: {
      decision: "REJECT",
      riskScore: 95,
      reason: "Quote deviation (8%), failure rate (45%), and pool risk (90) all exceed safety thresholds. SDA bridge delay detected.",
      flags: ["quote_deviation", "failure_risk", "pool_risk"],
    },
    FALLBACK_TO_SAFE_ROUTE: {
      decision: "FALLBACK_TO_SAFE_ROUTE",
      riskScore: 60,
      reason: "Moderate risk detected: quote deviation 4%, failure rate 25%, pool risk 90. Fallback to safer route available.",
      flags: ["quote_deviation", "failure_risk", "pool_risk"],
    },
  };

  const d = decisions[decisionType];
  const fallbacks: Record<string, string | null> = {
    "route-a": null,
    "route-b": "route-a",
    "route-c": "route-a",
  };

  return {
    ...d,
    routeId,
    fallbackRouteId: fallbacks[routeId] ?? null,
  };
}

// shared/types/event.ts — Event 统一类型定义（全队共享）

export interface Event {
  id: string;
  eventType: "RouteEvaluated" | "DecisionMade" | "ExecutionAttempted" | "ExecutionSuccess" | "ExecutionRejected" | "FallbackRequired";
  timestamp: number;
  routeId?: string;
  decision?: "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
  riskScore?: number;
  fallbackRouteId?: string;
  message: string;
  txHash?: string;
}

// backend/src/services/eventService.ts — Dev D: 事件日志管理
import { fileURLToPath } from "url";
import { Event, Route } from "../types.js";
import * as path from "path";
import * as fs from "fs";
import { evaluateRoute } from "./agentService.js";
import { executeRoute } from "./vaultService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const events: Event[] = [];

export function addEvent(event: Omit<Event, "id" | "timestamp">): Event {
  const fullEvent: Event = {
    ...event,
    id: `evt_${Date.now()}_${events.length + 1}`,
    timestamp: Date.now(),
  };
  events.push(fullEvent);
  return fullEvent;
}

export function getEvents(): Event[] {
  return [...events];
}

export function clearEvents(): void {
  events.length = 0;
}

export async function runFullFlow(
  routeId: string,
  tokenIn: string,
  tokenOut: string,
  amount: number,
  configProfile: string
): Promise<{ events: Event[]; decision: any }> {
  clearEvents();

  addEvent({
    eventType: "RouteEvaluated",
    routeId,
    message: `Route ${routeId} evaluated with ${tokenIn}→${tokenOut}, amount=${amount}`,
  });

  const decision = evaluateRoute(routeId, configProfile);
  addEvent({
    eventType: "DecisionMade",
    routeId,
    decision: decision.decision,
    riskScore: decision.riskScore,
    message: `Decision: ${decision.decision} (riskScore=${decision.riskScore}). ${decision.reason}`,
  });

  // 读取 route 数据获取金额（仅用于 ALLOW 场景执行）
  const routesRaw = fs.readFileSync(
    path.join(__dirname, "../../../shared/demo-data/routes.json"),
    "utf-8"
  );
  const routesData = JSON.parse(routesRaw) as { routes: Route[] };
  const route = routesData.routes.find((r: Route) => r.routeId === routeId);

  // 根据决策类型分发不同处理路径
  if (decision.decision === "ALLOW") {
    // 执行原 route
    const executeResult = await executeRoute(
      routeId,
      route?.amountIn || amount,
      route?.quotedOut || amount,
      Math.floor(Date.now() / 1000) + 3600,
      decision.riskScore,
      decision.decision,
      100
    );
    addEvent(executeResult.event);
  } else if (decision.decision === "REJECT") {
    // REJECT 场景：记录链上拦截事件
    addEvent({
      eventType: "ExecutionRejected",
      routeId,
      decision: decision.decision,
      riskScore: decision.riskScore,
      message: `Execution blocked by Safety Agent gate. Decision: ${decision.decision}, RiskScore: ${decision.riskScore}. ${decision.reason}`,
      txHash: undefined,
    });
  }

  // FALLBACK 场景：如果决策是 FALLBACK，记录 FallbackTriggered 事件
  if (decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId) {
    addEvent({
      eventType: "FallbackTriggered",
      routeId: decision.fallbackRouteId,
      message: `Fallback to ${decision.fallbackRouteId} (was ${routeId})`,
    });
  }

  return { events: getEvents(), decision };
}

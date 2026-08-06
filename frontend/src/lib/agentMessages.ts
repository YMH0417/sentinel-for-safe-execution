import type { Decision, Route as RouteType } from "../types";

function routeContext(route?: RouteType, decision?: Decision): string {
  return route?.label ?? decision?.routeId ?? "当前路由";
}

export function formatAgentRejectMessage(decision: Decision, route?: RouteType): string {
  if (decision.flags.includes("bad_token_blocked") || decision.flags.includes("high_token_risk")) {
    const pool = route?.poolLabel ?? "SAFE";
    return `【${routeContext(route, decision)}】目标为 BAD 高风险代币。Registry 已标记为 HIGH 风险，${pool} 池报价再好也不应兑换，Agent 拒绝执行。`;
  }
  if (decision.flags.includes("suspicious_token")) {
    return `【${routeContext(route, decision)}】目标为 BAIT 诱骗型代币，存在 honeypot / 无法卖出风险，无论报价如何均拒绝。`;
  }
  if (decision.flags.includes("sda_pool") || decision.flags.includes("execution_window_risk")) {
    return `【${routeContext(route, decision)}】SDA 池存在执行窗口风险：签名与上链间隔内报价易失效，历史失败率偏高。请改走同币对 SAFE 池。`;
  }
  if (decision.flags.includes("toxic_pool")) {
    const quoted = route?.quotedOut?.toFixed(4) ?? "—";
    const expected = route?.expectedOut?.toFixed(4) ?? "—";
    return `【${routeContext(route, decision)}】TOXIC 池报价 ${quoted} 明显高于公允价 ${expected}，疑似诱多报价，Agent 拒绝执行以免买入后无法获利退出。`;
  }
  if (decision.flags.includes("shallow_pool")) {
    const impact = route?.priceImpactBps;
    const impactText = impact != null ? `价格冲击约 ${impact} bps，` : "";
    return `【${routeContext(route, decision)}】SHALLOW 浅池流动性不足，${impactText}滑点与失败风险过高，Agent 拒绝直接执行。可改选 SAFE 池或降低兑换数量。`;
  }
  if (decision.flags.includes("quote_deviation") || decision.flags.includes("suspicious_quote")) {
    return `【${routeContext(route, decision)}】报价相对公允价偏差过大（风险分 ${decision.riskScore}/100），存在异常成交风险，Agent 拒绝执行。`;
  }
  if (decision.flags.includes("pool_risk")) {
    return `【${routeContext(route, decision)}】池子综合风险评分 ${route?.poolRiskScore ?? "—"}/100，超过 Agent 安全阈值，建议更换路由。`;
  }
  if (decision.flags.includes("route_not_found")) {
    return `路由 ${decision.routeId} 不存在或已失效，请重新获取报价后选择有效路由。`;
  }
  return decision.reason?.trim() || "Safety Agent 拒绝了当前路由，请手动选择其他路由后再执行";
}

export function formatAgentFallbackMessage(decision: Decision, route?: RouteType): string {
  const target = decision.fallbackRouteId ?? "同币对 SAFE 池";
  if (decision.flags.includes("shallow_pool")) {
    return `【${routeContext(route, decision)}】浅池流动性偏紧、价格冲击偏高（风险分 ${decision.riskScore}/100）。Agent 建议改走 ${target}，请勿在 SHALLOW 池强行大额成交。`;
  }
  if (decision.flags.includes("failure_risk")) {
    return `【${routeContext(route, decision)}】该路由历史失败率偏高。Agent 建议切换至 ${target} 以降低结算失败概率。`;
  }
  if (decision.flags.includes("quote_deviation")) {
    return `【${routeContext(route, decision)}】报价偏离公允价，处于警告区间（风险分 ${decision.riskScore}/100）。Agent 建议改走 ${target}。`;
  }
  return (
    decision.reason?.trim() ||
    `【${routeContext(route, decision)}】风险分 ${decision.riskScore}/100，Agent 建议切换到 ${target}，请手动切换后重新执行。`
  );
}

export function formatAgentInterceptMessage(
  decision: Decision,
  route?: RouteType
): string {
  if (decision.decision === "REJECT") {
    return formatAgentRejectMessage(decision, route);
  }
  if (decision.decision === "FALLBACK_TO_SAFE_ROUTE") {
    return formatAgentFallbackMessage(decision, route);
  }
  return decision.reason?.trim() || "";
}

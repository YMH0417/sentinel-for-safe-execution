import type { Event, SwapResult } from "../types";

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Reconstruct swap result from persisted backend events (Anvil demo chain). */
export function buildSwapResultFromEvents(events: Event[], txHash: string): SwapResult | null {
  const hash = txHash.toLowerCase();
  const related = events.filter(
    (event) =>
      event.txHash?.toLowerCase() === hash ||
      str(event.context?.txHash)?.toLowerCase() === hash
  );
  if (related.length === 0) return null;

  const terminal =
    [...related]
      .reverse()
      .find((event) => event.eventType === "SwapExecuted" || event.eventType === "SwapFailed") ??
    related[related.length - 1];

  const ctx = terminal.context ?? {};
  const attempted = related.find((event) => event.eventType === "ExecutionAttempted");

  const tokenIn = str(ctx.tokenIn) ?? "—";
  const tokenOut = str(ctx.tokenOut) ?? "—";
  const routeId = str(ctx.executedRouteId) ?? terminal.routeId ?? "";

  return {
    success: terminal.eventType === "SwapExecuted" && !ctx.errorCode,
    routeId,
    requestedRouteId: str(ctx.requestedRouteId) ?? routeId,
    executedRouteId: str(ctx.executedRouteId) ?? routeId,
    agentDecision: terminal.decision,
    agentBypassed:
      ctx.safetyMode === "force" ||
      (Array.isArray(ctx.flags) && ctx.flags.includes("agent_bypassed")),
    safetyMode: ctx.safetyMode === "force" ? "force" : "safe",
    poolLabel: str(ctx.poolLabel),
    executionMode: ctx.executionMode as SwapResult["executionMode"],
    tokenIn,
    tokenOut,
    amountIn: num(ctx.amountIn) ?? 0,
    quotedOut: num(ctx.quotedOut) ?? num(attempted?.context?.quotedOut) ?? 0,
    expectedOut: num(ctx.expectedOut) ?? num(attempted?.context?.expectedOut),
    actualOut: num(ctx.actualOut) ?? 0,
    amountOutMin: num(ctx.amountOutMin) ?? num(attempted?.context?.amountOutMin),
    amountOutMax: num(ctx.amountOutMax) ?? num(attempted?.context?.amountOutMax),
    slippageBps: num(ctx.slippageBps) ?? num(attempted?.context?.slippageBps),
    failureCode: str(ctx.errorCode),
    failureMessage: terminal.message,
    txHash: terminal.txHash ?? txHash,
    recipient: str(ctx.account) ?? "",
    gasUsed: str(ctx.gasUsed),
    onChainFailure: Boolean(str(ctx.gasUsed) && ctx.errorCode),
  };
}

export function executionSearchParams(txHash?: string): string {
  if (!txHash) return "/execution";
  return `/execution?tx=${encodeURIComponent(txHash)}`;
}

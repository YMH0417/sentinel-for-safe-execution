import type { SwapResult } from "../types.js";
import { recordLedgerTrade, type LedgerExecutionMode, type LedgerSafetyMode } from "./tradeLedgerService.js";

function executionModeFromResult(result: SwapResult): LedgerExecutionMode {
  if (result.sdaExecutionWindow) return "sda";
  if (result.executionMode === "direct") return "direct";
  return "router";
}

export function mirrorSwapToLedger(result: SwapResult, safetyMode: LedgerSafetyMode): void {
  if (!result.success || !result.txHash || !result.recipient) return;

  void recordLedgerTrade({
    user: result.recipient,
    routeId: result.executedRouteId ?? result.routeId,
    executionMode: executionModeFromResult(result),
    safetyMode,
    poolLabel: result.poolLabel,
    tokenIn: result.tokenIn,
    tokenOut: result.tokenOut,
    amountIn: result.amountIn,
    amountOut: result.actualOut,
    txHash: result.txHash,
    blockNumber: result.blockNumber,
    agentDecision: result.agentDecision,
    registerCheck: safetyMode === "safe" && executionModeFromResult(result) === "router",
  }).catch((err) => {
    console.warn("ledger mirror failed:", err instanceof Error ? err.message : err);
  });
}

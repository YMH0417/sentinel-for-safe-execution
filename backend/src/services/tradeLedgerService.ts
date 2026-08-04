import { decodeBadgeTiers } from "./ledgerBadgeRules.js";
import { getLedgerRepository } from "../storage/ledgerRepository.js";
import { usePostgresStorage } from "../storage/config.js";

export type LedgerExecutionMode = "router" | "direct" | "sda";
export type LedgerSafetyMode = "safe" | "force";

/** All on-chain settlements (normal route or not). */
export interface LedgerTradeRecord {
  id: string;
  user: string;
  routeId: string;
  executionMode: LedgerExecutionMode;
  safetyMode: LedgerSafetyMode;
  poolLabel?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  txHash: string;
  blockNumber?: number;
  agentDecision?: string;
  timestamp: number;
}

/** Vault/Agent-gated swap — separate from route label or safety mode. */
export interface CheckedTradeRef {
  tradeId: string;
  user: string;
  txHash: string;
  blockNumber?: number;
  recordedAt: number;
}

export interface RecordLedgerTradeInput {
  user: string;
  routeId: string;
  executionMode: LedgerExecutionMode;
  safetyMode: LedgerSafetyMode;
  poolLabel?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  txHash: string;
  blockNumber?: number;
  agentDecision?: string;
  /** Explicit: this tx passed Agent/Vault gate (stored in checkedTrades dict). */
  registerCheck?: boolean;
  /** @deprecated Legacy hybrid mirror — no-op */
  skipChainMirror?: boolean;
}

export async function isCheckedTrade(txHash: string): Promise<boolean> {
  const repo = await getLedgerRepository();
  return repo.isCheckedTrade(txHash);
}

export async function recordLedgerTrade(
  input: RecordLedgerTradeInput
): Promise<LedgerTradeRecord> {
  const repo = await getLedgerRepository();
  return repo.recordTrade(input);
}

export async function importLedgerTrades(inputs: RecordLedgerTradeInput[]): Promise<number> {
  const repo = await getLedgerRepository();
  return repo.importTrades(inputs);
}

export async function listCheckedTrades(user: string): Promise<CheckedTradeRef[]> {
  const repo = await getLedgerRepository();
  return repo.listCheckedTrades(user);
}

export async function getLedgerUserStats(user: string) {
  const repo = await getLedgerRepository();
  return repo.getUserStats(user);
}

export async function getLedgerAchievementsView(user: string): Promise<{
  address: string;
  source: "local" | "postgres";
  achievementsContract: null;
  checkCount: number;
  safeSwapCount: number;
  tradeCount: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
  badges: { tier: number; unlocked: boolean }[];
  checkedTrades: CheckedTradeRef[];
}> {
  const repo = await getLedgerRepository();
  const stats = await repo.getUserStats(user);
  return {
    address: stats.address,
    source: usePostgresStorage() ? "postgres" : "local",
    achievementsContract: null,
    checkCount: stats.checkCount,
    safeSwapCount: stats.safeTradeCount,
    tradeCount: stats.tradeCount,
    usdcVolumeHuman: stats.usdcVolumeHuman,
    badgeFlags: stats.badgeFlags,
    badges: decodeBadgeTiers(stats.badgeFlags),
    checkedTrades: await repo.listCheckedTrades(user),
  };
}

export async function listLedgerTrades(
  user: string,
  limit = 50
): Promise<LedgerTradeRecord[]> {
  const repo = await getLedgerRepository();
  return repo.listTrades(user, limit);
}

/** Global recent trades (all users) for pool-volume dashboard — no RPC scan. */
export async function listRecentGlobalLedgerTrades(
  limit: number
): Promise<LedgerTradeRecord[]> {
  const repo = await getLedgerRepository();
  return repo.listRecentGlobal(limit);
}

export async function getLedgerFilePath(): Promise<string> {
  const repo = await getLedgerRepository();
  return repo.getFilePath();
}

export async function clearLedger(): Promise<void> {
  const repo = await getLedgerRepository();
  await repo.clear();
}

/** Apply seed check count when chain bootstrap under-counts vault-gated txs. */
export async function applySeedCheckCount(
  user: string,
  targetCount: number,
  opts?: { onlyRouterTrades?: boolean }
): Promise<number> {
  const repo = await getLedgerRepository();
  return repo.applySeedCheckCount(user, targetCount, opts);
}

import { JsonRpcProvider } from "ethers";
import { getRpcUrl } from "../config/chainConfig.js";
import { type DemoPoolLabel, loadDemoConfig } from "../config/demoConfig.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { getCachedPoolsHealth } from "./poolHealthCacheService.js";
import {
  fetchRecentGlobalChainTrades,
  loadSafeReserveCache,
  usdcVolumeFromTrade,
  MAX_RECENT_CHAIN_TRADES,
  type IndexedChainTrade,
} from "./chainTradeIndexService.js";
import {
  listRecentGlobalLedgerTrades,
  type LedgerTradeRecord,
} from "./tradeLedgerService.js";

export { MAX_RECENT_CHAIN_TRADES as MAX_INDEXED_SWAPS };

export interface LabelVolumeRow {
  label: DemoPoolLabel;
  volumeUsdc: number;
  swapCount: number;
}

export interface PoolVolumeReport {
  swapRouter: string;
  maxEvents: number;
  eventsUsed: number;
  scannedFromBlock: number;
  scannedToBlock: number;
  checkedAt: string;
  pricingNote: string;
  byLabel: LabelVolumeRow[];
  abnormalPct: number;
  abnormalCount: number;
  poolCount: number;
}

const LABELS: DemoPoolLabel[] = ["SAFE", "SHALLOW", "TOXIC", "SDA"];

function emptyByLabel(): LabelVolumeRow[] {
  return LABELS.map((label) => ({ label, volumeUsdc: 0, swapCount: 0 }));
}

export function resolvePoolVolumeSource(): "ledger" | "chain" {
  const explicit = process.env.POOL_VOLUME_SOURCE?.trim().toLowerCase();
  if (explicit === "chain") return "chain";
  // Default: local ledger JSON (Neon in production). Ignore anvil-ledger unless legacy env.
  return "ledger";
}

function aggregateLedgerByLabel(trades: LedgerTradeRecord[]): LabelVolumeRow[] {
  const byLabelMap = new Map<DemoPoolLabel, LabelVolumeRow>(
    emptyByLabel().map((row) => [row.label, { ...row }])
  );

  for (const trade of trades) {
    const label = (trade.poolLabel as DemoPoolLabel | undefined) ?? "SAFE";
    if (!LABELS.includes(label)) continue;
    const row = byLabelMap.get(label)!;
    if (trade.tokenIn === "USDC" && trade.amountIn > 0) {
      row.volumeUsdc += trade.amountIn;
    }
    row.swapCount += 1;
  }

  for (const row of byLabelMap.values()) {
    row.volumeUsdc = Math.round(row.volumeUsdc * 100) / 100;
  }

  return LABELS.map((label) => byLabelMap.get(label)!);
}

function aggregateByLabel(
  trades: IndexedChainTrade[],
  config: Awaited<ReturnType<typeof getLiveDemoConfig>>,
  safeReserves: Awaited<ReturnType<typeof loadSafeReserveCache>>
): LabelVolumeRow[] {
  const byLabelMap = new Map<DemoPoolLabel, LabelVolumeRow>(
    emptyByLabel().map((row) => [row.label, { ...row }])
  );

  for (const trade of trades) {
    const row = byLabelMap.get(trade.poolLabel)!;
    row.volumeUsdc += usdcVolumeFromTrade(config, trade, safeReserves);
    row.swapCount += 1;
  }

  for (const row of byLabelMap.values()) {
    row.volumeUsdc = Math.round(row.volumeUsdc * 100) / 100;
  }

  return LABELS.map((label) => byLabelMap.get(label)!);
}

export async function buildEmptyPoolVolumeReport(): Promise<PoolVolumeReport> {
  const config = loadDemoConfig();
  const poolsHealth = await getCachedPoolsHealth().catch(() => null);
  const abnormalCount = poolsHealth ? poolsHealth.degraded + poolsHealth.empty : 0;
  const poolCount = poolsHealth?.poolCount ?? config.pools.length;
  const abnormalPct =
    poolCount > 0 ? Math.round((abnormalCount / poolCount) * 10000) / 100 : 0;

  return {
    swapRouter: config.swapRouter ?? "",
    maxEvents: MAX_RECENT_CHAIN_TRADES,
    eventsUsed: 0,
    scannedFromBlock: 0,
    scannedToBlock: 0,
    checkedAt: new Date().toISOString(),
    pricingNote: "awaiting indexer",
    byLabel: emptyByLabel(),
    abnormalPct,
    abnormalCount,
    poolCount,
  };
}

/** Global last N ledger trades — product DB (JSON → Neon). */
export async function getPoolVolumeFromLedger(): Promise<PoolVolumeReport> {
  const config = loadDemoConfig();
  const trades = await listRecentGlobalLedgerTrades(MAX_RECENT_CHAIN_TRADES);
  // Pool health optional (Settings RPC); dashboard no longer shows abnormal row
  const poolsHealth = await getCachedPoolsHealth().catch(() => null);
  const abnormalCount = poolsHealth ? poolsHealth.degraded + poolsHealth.empty : 0;
  const poolCount = poolsHealth?.poolCount ?? config.pools.length;
  const abnormalPct =
    poolCount > 0 ? Math.round((abnormalCount / poolCount) * 10000) / 100 : 0;

  return {
    swapRouter: config.swapRouter ?? "",
    maxEvents: MAX_RECENT_CHAIN_TRADES,
    eventsUsed: trades.length,
    scannedFromBlock: 0,
    scannedToBlock: 0,
    checkedAt: new Date().toISOString(),
    pricingNote: `Product ledger: last ${MAX_RECENT_CHAIN_TRADES} trades by pool label (USDC amountIn)`,
    byLabel: aggregateLedgerByLabel(trades),
    abnormalPct,
    abnormalCount,
    poolCount,
  };
}

/** Global last N on-chain trades (router + direct pair), aggregated volume per pool label. */
export async function getPoolVolumeFromChain(): Promise<PoolVolumeReport> {
  const config = await getLiveDemoConfig();
  if (!config.swapRouter) {
    throw new Error("swapRouter address missing in demo deployment config");
  }

  const provider = new JsonRpcProvider(getRpcUrl());
  const { trades, scannedFromBlock, scannedToBlock } = await fetchRecentGlobalChainTrades(
    MAX_RECENT_CHAIN_TRADES
  );

  const [safeReserves, poolsHealth] = await Promise.all([
    loadSafeReserveCache(provider, config),
    getCachedPoolsHealth().catch(() => null),
  ]);

  const abnormalCount = poolsHealth ? poolsHealth.degraded + poolsHealth.empty : 0;
  const poolCount = poolsHealth?.poolCount ?? config.pools.length;
  const abnormalPct =
    poolCount > 0 ? Math.round((abnormalCount / poolCount) * 10000) / 100 : 0;

  return {
    swapRouter: config.swapRouter,
    maxEvents: MAX_RECENT_CHAIN_TRADES,
    eventsUsed: trades.length,
    scannedFromBlock,
    scannedToBlock,
    checkedAt: new Date().toISOString(),
    pricingNote: `Global last ${MAX_RECENT_CHAIN_TRADES} on-chain trades (router + direct), USDC via SAFE quote`,
    byLabel: aggregateByLabel(trades, config, safeReserves),
    abnormalPct,
    abnormalCount,
    poolCount,
  };
}

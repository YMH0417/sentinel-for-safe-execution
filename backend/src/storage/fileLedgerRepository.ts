import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAddress } from "ethers";
import {
  evaluateBadgeFlags,
  type UserLedgerStats,
} from "../services/ledgerBadgeRules.js";
import type {
  CheckedTradeRef,
  LedgerTradeRecord,
  RecordLedgerTradeInput,
} from "../services/tradeLedgerService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "../../data");
const DEFAULT_LEDGER_FILE = join(DATA_DIR, "trade-ledger.json");

interface StoredUserStats {
  checkCount: number;
  tradeCount: number;
  safeTradeCount: number;
  usdcVolumeRaw: string;
  badgeFlags: number;
}

interface LedgerStoreV2 {
  version: 2;
  users: Record<string, StoredUserStats>;
  trades: LedgerTradeRecord[];
  checkedTrades: Record<string, CheckedTradeRef>;
  txIndex: Record<string, string>;
}

function ledgerFilePath(): string {
  return process.env.SENTINEL_LEDGER_FILE?.trim() || DEFAULT_LEDGER_FILE;
}

const emptyStore = (): LedgerStoreV2 => ({
  version: 2,
  users: {},
  trades: [],
  checkedTrades: {},
  txIndex: {},
});

function migrateStore(raw: unknown): LedgerStoreV2 {
  const r = raw as Record<string, unknown>;
  if (r.version === 2) {
    return raw as LedgerStoreV2;
  }
  const legacy = r as {
    version?: number;
    users?: Record<string, StoredUserStats>;
    trades?: Array<LedgerTradeRecord & { passedCheck?: boolean }>;
    txIndex?: Record<string, string>;
  };
  const next = emptyStore();
  next.users = legacy.users ?? {};
  next.txIndex = legacy.txIndex ?? {};
  for (const t of legacy.trades ?? []) {
    const { passedCheck, ...trade } = t;
    next.trades.push(trade);
    if (passedCheck) {
      next.checkedTrades[trade.txHash.toLowerCase()] = {
        tradeId: trade.id,
        user: trade.user,
        txHash: trade.txHash,
        blockNumber: trade.blockNumber,
        recordedAt: trade.timestamp,
      };
    }
  }
  return next;
}

function normalizeUser(input: string): string {
  return getAddress(input);
}

function emptyUserStats(): StoredUserStats {
  return {
    checkCount: 0,
    tradeCount: 0,
    safeTradeCount: 0,
    usdcVolumeRaw: "0",
    badgeFlags: 0,
  };
}

function refreshBadges(s: StoredUserStats): void {
  s.badgeFlags = evaluateBadgeFlags({
    checkCount: s.checkCount,
    tradeCount: s.tradeCount,
    safeTradeCount: s.safeTradeCount,
    usdcVolumeHuman: Number(s.usdcVolumeRaw) / 1e6,
    badgeFlags: s.badgeFlags,
  });
}

export class FileLedgerRepository {
  private store: LedgerStoreV2 | null = null;

  getFilePath(): string {
    return ledgerFilePath();
  }

  private ensureLoaded(): LedgerStoreV2 {
    if (this.store) return this.store;
    mkdirSync(DATA_DIR, { recursive: true });
    const file = ledgerFilePath();
    if (!existsSync(file)) {
      this.store = emptyStore();
      this.persist();
      return this.store;
    }
    this.store = migrateStore(
      JSON.parse(readFileSync(file, "utf-8").replace(/^\uFEFF/, ""))
    );
    return this.store;
  }

  private persist(): void {
    if (!this.store) return;
    writeFileSync(ledgerFilePath(), `${JSON.stringify(this.store, null, 2)}\n`, "utf-8");
  }

  private getUserStatsRef(user: string): StoredUserStats {
    const db = this.ensureLoaded();
    const key = normalizeUser(user);
    if (!db.users[key]) {
      db.users[key] = emptyUserStats();
    }
    return db.users[key];
  }

  private recomputeUserStats(user: string): StoredUserStats {
    const db = this.ensureLoaded();
    const key = normalizeUser(user);
    const userTrades = db.trades.filter((t) => t.user === key);
    const s = this.getUserStatsRef(user);
    s.tradeCount = userTrades.length;
    s.safeTradeCount = userTrades.filter(
      (t) => t.safetyMode === "safe" && t.executionMode === "router"
    ).length;
    s.checkCount = Object.values(db.checkedTrades).filter((c) => c.user === key).length;

    let usdcRaw = 0n;
    for (const t of userTrades) {
      if (t.tokenIn === "USDC" && t.amountIn > 0) {
        usdcRaw += BigInt(Math.round(t.amountIn * 1e6));
      }
    }
    s.usdcVolumeRaw = usdcRaw.toString();
    refreshBadges(s);
    return s;
  }

  private registerCheckedTrade(trade: LedgerTradeRecord): void {
    const db = this.ensureLoaded();
    const txKey = trade.txHash.toLowerCase();
    if (db.checkedTrades[txKey]) return;
    db.checkedTrades[txKey] = {
      tradeId: trade.id,
      user: trade.user,
      txHash: trade.txHash,
      blockNumber: trade.blockNumber,
      recordedAt: Date.now(),
    };
  }

  async isCheckedTrade(txHash: string): Promise<boolean> {
    const db = this.ensureLoaded();
    return Boolean(db.checkedTrades[txHash.toLowerCase()]);
  }

  async recordTrade(input: RecordLedgerTradeInput): Promise<LedgerTradeRecord> {
    const db = this.ensureLoaded();
    const txKey = input.txHash.toLowerCase();
    const existingId = db.txIndex[txKey];
    if (existingId) {
      const existing = db.trades.find((t) => t.id === existingId)!;
      if (input.registerCheck) {
        this.registerCheckedTrade(existing);
        this.recomputeUserStats(existing.user);
        this.persist();
      }
      return existing;
    }

    const user = normalizeUser(input.user);
    const trade: LedgerTradeRecord = {
      id: `trade_${randomUUID()}`,
      user,
      routeId: input.routeId,
      executionMode: input.executionMode,
      safetyMode: input.safetyMode,
      poolLabel: input.poolLabel,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      amountOut: input.amountOut,
      txHash: input.txHash,
      blockNumber: input.blockNumber,
      agentDecision: input.agentDecision,
      timestamp: Date.now(),
    };

    db.trades.push(trade);
    db.txIndex[txKey] = trade.id;

    if (input.registerCheck) {
      this.registerCheckedTrade(trade);
    }

    this.recomputeUserStats(user);
    this.persist();
    return trade;
  }

  async importTrades(inputs: RecordLedgerTradeInput[]): Promise<number> {
    const sorted = [...inputs].sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));
    let imported = 0;
    for (const input of sorted) {
      const db = this.ensureLoaded();
      if (db.txIndex[input.txHash.toLowerCase()]) continue;
      await this.recordTrade(input);
      imported += 1;
    }
    return imported;
  }

  async listCheckedTrades(user: string): Promise<CheckedTradeRef[]> {
    const key = normalizeUser(user);
    const db = this.ensureLoaded();
    return Object.values(db.checkedTrades)
      .filter((c) => c.user === key)
      .sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
  }

  async getUserStats(user: string): Promise<UserLedgerStats & { address: string }> {
    const s = this.recomputeUserStats(user);
    return {
      address: normalizeUser(user),
      checkCount: s.checkCount,
      tradeCount: s.tradeCount,
      safeTradeCount: s.safeTradeCount,
      usdcVolumeHuman: Number(s.usdcVolumeRaw) / 1e6,
      badgeFlags: s.badgeFlags,
    };
  }

  async listTrades(user: string, limit = 50): Promise<LedgerTradeRecord[]> {
    const key = normalizeUser(user);
    const db = this.ensureLoaded();
    return db.trades.filter((t) => t.user === key).slice(-limit).reverse();
  }

  async listRecentGlobal(limit: number): Promise<LedgerTradeRecord[]> {
    const db = this.ensureLoaded();
    return [...db.trades]
      .sort((a, b) => {
        const blockDiff = (b.blockNumber ?? 0) - (a.blockNumber ?? 0);
        if (blockDiff !== 0) return blockDiff;
        return b.timestamp - a.timestamp;
      })
      .slice(0, limit);
  }

  async clear(): Promise<void> {
    this.store = emptyStore();
    this.persist();
  }

  async applySeedCheckCount(
    user: string,
    targetCount: number,
    opts?: { onlyRouterTrades?: boolean }
  ): Promise<number> {
    const db = this.ensureLoaded();
    const key = normalizeUser(user);
    const current = Object.values(db.checkedTrades).filter((c) => c.user === key).length;
    if (current >= targetCount) return current;

    let candidates = db.trades
      .filter((t) => t.user === key)
      .filter((t) => !opts?.onlyRouterTrades || t.executionMode === "router")
      .filter((t) => !db.checkedTrades[t.txHash.toLowerCase()])
      .sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));

    if (opts?.onlyRouterTrades && candidates.length < targetCount - current) {
      candidates = db.trades
        .filter((t) => t.user === key)
        .filter((t) => !db.checkedTrades[t.txHash.toLowerCase()])
        .sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));
    }

    let added = 0;
    for (const trade of candidates) {
      if (current + added >= targetCount) break;
      this.registerCheckedTrade(trade);
      added += 1;
    }

    this.recomputeUserStats(user);
    this.persist();
    return current + added;
  }
}

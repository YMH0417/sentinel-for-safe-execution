import { randomUUID } from "crypto";
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
import { getSql } from "./db.js";

function normalizeUser(input: string): string {
  return getAddress(input);
}

type TradeRow = {
  id: string;
  user_address: string;
  route_id: string;
  execution_mode: string;
  safety_mode: string;
  pool_label: string | null;
  token_in: string;
  token_out: string;
  amount_in: number;
  amount_out: number | null;
  tx_hash: string;
  block_number: string | null;
  agent_decision: string | null;
  recorded_at_ms: string;
};

function rowToTrade(row: TradeRow): LedgerTradeRecord {
  return {
    id: row.id,
    user: row.user_address,
    routeId: row.route_id,
    executionMode: row.execution_mode as LedgerTradeRecord["executionMode"],
    safetyMode: row.safety_mode as LedgerTradeRecord["safetyMode"],
    poolLabel: row.pool_label ?? undefined,
    tokenIn: row.token_in,
    tokenOut: row.token_out,
    amountIn: row.amount_in,
    amountOut: row.amount_out ?? undefined,
    txHash: row.tx_hash,
    blockNumber: row.block_number != null ? Number(row.block_number) : undefined,
    agentDecision: row.agent_decision ?? undefined,
    timestamp: Number(row.recorded_at_ms),
  };
}

export class PostgresLedgerRepository {
  getFilePath(): string {
    return "postgres://ledger_trades";
  }

  private async findByTxHash(txHash: string): Promise<LedgerTradeRecord | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM ledger_trades WHERE tx_hash = ${txHash} LIMIT 1
    `) as TradeRow[];
    return rows[0] ? rowToTrade(rows[0]) : null;
  }

  async isCheckedTrade(txHash: string): Promise<boolean> {
    const sql = getSql();
    const rows = (await sql`
      SELECT 1 FROM ledger_checked_trades WHERE tx_hash = ${txHash} LIMIT 1
    `) as { "?column?": number }[];
    return rows.length > 0;
  }

  private async registerCheckedTrade(trade: LedgerTradeRecord): Promise<void> {
    const sql = getSql();
    await sql`
      INSERT INTO ledger_checked_trades (tx_hash, trade_id, user_address, block_number, recorded_at_ms)
      VALUES (
        ${trade.txHash},
        ${trade.id},
        ${trade.user},
        ${trade.blockNumber ?? null},
        ${Date.now()}
      )
      ON CONFLICT (tx_hash) DO NOTHING
    `;
  }

  async recordTrade(input: RecordLedgerTradeInput): Promise<LedgerTradeRecord> {
    const existing = await this.findByTxHash(input.txHash);
    if (existing) {
      if (input.registerCheck) {
        await this.registerCheckedTrade(existing);
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

    const sql = getSql();
    await sql`
      INSERT INTO ledger_trades (
        id, user_address, route_id, execution_mode, safety_mode, pool_label,
        token_in, token_out, amount_in, amount_out, tx_hash, block_number,
        agent_decision, recorded_at_ms
      ) VALUES (
        ${trade.id},
        ${trade.user},
        ${trade.routeId},
        ${trade.executionMode},
        ${trade.safetyMode},
        ${trade.poolLabel ?? null},
        ${trade.tokenIn},
        ${trade.tokenOut},
        ${trade.amountIn},
        ${trade.amountOut ?? null},
        ${trade.txHash},
        ${trade.blockNumber ?? null},
        ${trade.agentDecision ?? null},
        ${trade.timestamp}
      )
      ON CONFLICT (tx_hash) DO NOTHING
    `;

    if (input.registerCheck) {
      await this.registerCheckedTrade(trade);
    }

    return (await this.findByTxHash(trade.txHash)) ?? trade;
  }

  async importTrades(inputs: RecordLedgerTradeInput[]): Promise<number> {
    const sorted = [...inputs].sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));
    let imported = 0;
    for (const input of sorted) {
      const existing = await this.findByTxHash(input.txHash);
      if (existing) continue;
      await this.recordTrade(input);
      imported += 1;
    }
    return imported;
  }

  async listCheckedTrades(user: string): Promise<CheckedTradeRef[]> {
    const key = normalizeUser(user);
    const sql = getSql();
    const rows = (await sql`
      SELECT tx_hash, trade_id, user_address, block_number, recorded_at_ms
      FROM ledger_checked_trades
      WHERE user_address = ${key}
      ORDER BY block_number DESC NULLS LAST, recorded_at_ms DESC
    `) as Array<{
      tx_hash: string;
      trade_id: string;
      user_address: string;
      block_number: string | null;
      recorded_at_ms: string;
    }>;

    return rows.map((row) => ({
      tradeId: row.trade_id,
      user: row.user_address,
      txHash: row.tx_hash,
      blockNumber: row.block_number != null ? Number(row.block_number) : undefined,
      recordedAt: Number(row.recorded_at_ms),
    }));
  }

  async getUserStats(user: string): Promise<UserLedgerStats & { address: string }> {
    const key = normalizeUser(user);
    const sql = getSql();

    const [statsRow] = (await sql`
      SELECT
        COUNT(*)::int AS trade_count,
        COUNT(*) FILTER (
          WHERE safety_mode = 'safe' AND execution_mode = 'router'
        )::int AS safe_trade_count,
        COALESCE(SUM(amount_in) FILTER (WHERE token_in = 'USDC'), 0)::float AS usdc_volume_human
      FROM ledger_trades
      WHERE user_address = ${key}
    `) as Array<{
      trade_count: number;
      safe_trade_count: number;
      usdc_volume_human: number;
    }>;

    const [checkRow] = (await sql`
      SELECT COUNT(*)::int AS check_count
      FROM ledger_checked_trades
      WHERE user_address = ${key}
    `) as Array<{ check_count: number }>;

    const tradeCount = statsRow?.trade_count ?? 0;
    const safeTradeCount = statsRow?.safe_trade_count ?? 0;
    const checkCount = checkRow?.check_count ?? 0;
    const usdcVolumeHuman = statsRow?.usdc_volume_human ?? 0;
    const badgeFlags = evaluateBadgeFlags({
      checkCount,
      tradeCount,
      safeTradeCount,
      usdcVolumeHuman,
      badgeFlags: 0,
    });

    return {
      address: key,
      checkCount,
      tradeCount,
      safeTradeCount,
      usdcVolumeHuman,
      badgeFlags,
    };
  }

  async listTrades(user: string, limit = 50): Promise<LedgerTradeRecord[]> {
    const key = normalizeUser(user);
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM ledger_trades
      WHERE user_address = ${key}
      ORDER BY recorded_at_ms DESC
      LIMIT ${limit}
    `) as TradeRow[];
    return rows.map(rowToTrade);
  }

  async listRecentGlobal(limit: number): Promise<LedgerTradeRecord[]> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM ledger_trades
      ORDER BY block_number DESC NULLS LAST, recorded_at_ms DESC
      LIMIT ${limit}
    `) as TradeRow[];
    return rows.map(rowToTrade);
  }

  async clear(): Promise<void> {
    const sql = getSql();
    await sql`TRUNCATE ledger_checked_trades, ledger_trades RESTART IDENTITY CASCADE`;
  }

  async applySeedCheckCount(
    user: string,
    targetCount: number,
    opts?: { onlyRouterTrades?: boolean }
  ): Promise<number> {
    const key = normalizeUser(user);
    const checked = await this.listCheckedTrades(key);
    const current = checked.length;
    if (current >= targetCount) return current;

    const sql = getSql();
    const fetchCandidates = async (routerOnly: boolean): Promise<TradeRow[]> => {
      if (routerOnly) {
        return (await sql`
          SELECT t.*
          FROM ledger_trades t
          LEFT JOIN ledger_checked_trades c ON c.tx_hash = t.tx_hash
          WHERE t.user_address = ${key}
            AND c.tx_hash IS NULL
            AND t.execution_mode = 'router'
          ORDER BY t.block_number ASC NULLS LAST, t.recorded_at_ms ASC
        `) as TradeRow[];
      }
      return (await sql`
        SELECT t.*
        FROM ledger_trades t
        LEFT JOIN ledger_checked_trades c ON c.tx_hash = t.tx_hash
        WHERE t.user_address = ${key} AND c.tx_hash IS NULL
        ORDER BY t.block_number ASC NULLS LAST, t.recorded_at_ms ASC
      `) as TradeRow[];
    };

    let rows = await fetchCandidates(Boolean(opts?.onlyRouterTrades));
    if (opts?.onlyRouterTrades && rows.length < targetCount - current) {
      rows = await fetchCandidates(false);
    }

    let added = 0;
    for (const row of rows) {
      if (current + added >= targetCount) break;
      const trade = rowToTrade(row);
      if (await this.isCheckedTrade(trade.txHash)) continue;
      await this.registerCheckedTrade(trade);
      added += 1;
    }

    return current + added;
  }
}

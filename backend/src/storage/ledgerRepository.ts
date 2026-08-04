import type {
  CheckedTradeRef,
  LedgerTradeRecord,
  RecordLedgerTradeInput,
} from "../services/tradeLedgerService.js";
import type { UserLedgerStats } from "../services/ledgerBadgeRules.js";

export interface LedgerRepository {
  getFilePath(): string;
  isCheckedTrade(txHash: string): Promise<boolean>;
  recordTrade(input: RecordLedgerTradeInput): Promise<LedgerTradeRecord>;
  importTrades(inputs: RecordLedgerTradeInput[]): Promise<number>;
  listCheckedTrades(user: string): Promise<CheckedTradeRef[]>;
  getUserStats(user: string): Promise<UserLedgerStats & { address: string }>;
  listTrades(user: string, limit?: number): Promise<LedgerTradeRecord[]>;
  listRecentGlobal(limit: number): Promise<LedgerTradeRecord[]>;
  clear(): Promise<void>;
  applySeedCheckCount(
    user: string,
    targetCount: number,
    opts?: { onlyRouterTrades?: boolean }
  ): Promise<number>;
}

let ledgerRepo: LedgerRepository | null = null;

export async function getLedgerRepository(): Promise<LedgerRepository> {
  if (ledgerRepo) return ledgerRepo;
  const { usePostgresStorage } = await import("./config.js");
  if (usePostgresStorage()) {
    const { PostgresLedgerRepository } = await import("./postgresLedgerRepository.js");
    ledgerRepo = new PostgresLedgerRepository();
  } else {
    const { FileLedgerRepository } = await import("./fileLedgerRepository.js");
    ledgerRepo = new FileLedgerRepository();
  }
  return ledgerRepo;
}

export function resetLedgerRepositoryForTests(): void {
  ledgerRepo = null;
}

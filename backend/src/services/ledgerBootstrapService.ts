import { getAddress } from "ethers";
import {
  fetchWalletChainTrades,
  toHumanAmountIn,
  type IndexedChainTrade,
} from "./chainTradeIndexService.js";
import {
  importLedgerTrades,
  getLedgerAchievementsView,
  listLedgerTrades,
  clearLedger,
  recordLedgerTrade,
  type RecordLedgerTradeInput,
} from "./tradeLedgerService.js";
import { isHybridDemoMode } from "../config/ledgerConfig.js";

/** Default demo wallet (Monad test user / Anvil funded account). */
export const DEFAULT_BOOTSTRAP_WALLET = "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";

function chainTradeToLedgerInput(trade: IndexedChainTrade): RecordLedgerTradeInput {
  const executionMode =
    trade.kind === "direct" ? "direct" : trade.kind === "sda" ? "sda" : "router";
  const safetyMode =
    trade.kind === "router" && trade.passedCheck ? "safe" : "force";

  return {
    user: trade.user,
    routeId: trade.routeName,
    executionMode,
    safetyMode,
    poolLabel: trade.poolLabel,
    tokenIn: trade.tokenInSymbol,
    tokenOut: trade.tokenOutSymbol,
    amountIn: toHumanAmountIn(trade.tokenInSymbol, trade.amountIn),
    amountOut: toHumanAmountIn(trade.tokenOutSymbol, trade.amountOut),
    txHash: trade.txHash,
    blockNumber: trade.blockNumber,
    registerCheck: trade.kind === "router" && trade.passedCheck,
  };
}

/** Optional dev-only fake trades when `seedCheckCount` / `seedTotalTrades` are passed explicitly. */
async function seedDemoLedgerTrades(
  wallet: string,
  checkCount: number,
  totalTrades: number
): Promise<number> {
  const user = getAddress(wallet);
  let imported = 0;

  for (let i = 0; i < totalTrades; i++) {
    const isChecked = i < checkCount;
    const txHash = `0xseed${(i + 1).toString(16).padStart(60, "0")}`;
    await recordLedgerTrade({
      user,
      routeId: "route-usdc-good-safe",
      executionMode: isChecked ? "router" : "direct",
      safetyMode: isChecked ? "safe" : "force",
      poolLabel: "SAFE",
      tokenIn: "USDC",
      tokenOut: "GOOD",
      amountIn: 25 + i * 5,
      amountOut: 400 + i * 20,
      txHash,
      blockNumber: 50_800_000 + i,
      registerCheck: isChecked,
      skipChainMirror: true,
    });
    imported += 1;
  }

  return imported;
}

export interface LedgerBootstrapReport {
  wallet: string;
  tradesImported: number;
  passedCheckCount: number;
  seeded: boolean;
  stats: Awaited<ReturnType<typeof getLedgerAchievementsView>>;
}

/** Import on-chain history for a wallet. No auto-seed unless opts request it. */
export async function bootstrapLedgerFromChain(
  walletInput: string = DEFAULT_BOOTSTRAP_WALLET,
  opts?: { replace?: boolean; seedCheckCount?: number; seedTotalTrades?: number }
): Promise<LedgerBootstrapReport> {
  const wallet = getAddress(walletInput);
  if (opts?.replace) {
    await clearLedger();
  }

  const chainTrades = await fetchWalletChainTrades(wallet);
  const inputs = chainTrades.map(chainTradeToLedgerInput);
  let imported = await importLedgerTrades(inputs);
  let seeded = false;

  const seedCheck = opts?.seedCheckCount ?? 0;
  const seedTotal = opts?.seedTotalTrades ?? Math.max(seedCheck, 0);

  if (seedCheck > 0 && seedTotal > 0) {
    if (imported === 0) {
      imported = await seedDemoLedgerTrades(wallet, seedCheck, Math.max(seedTotal, seedCheck));
      seeded = true;
    }
  }

  const stats = await getLedgerAchievementsView(wallet);
  return {
    wallet,
    tradesImported: imported,
    passedCheckCount: stats.checkCount,
    seeded,
    stats,
  };
}

/** Seed local JSON baseline for hybrid pool-volume dashboard (Anvil chain seeded separately). */
export async function seedHybridLocalLedgerBaseline(
  wallet: string = DEFAULT_BOOTSTRAP_WALLET,
  checkCount = 8,
  totalTrades = 14
): Promise<number> {
  if ((await listLedgerTrades(wallet, 1)).length > 0) return 0;
  return seedDemoLedgerTrades(wallet, checkCount, Math.max(totalTrades, checkCount));
}

export async function maybeSeedHybridBaselineOnStart(): Promise<void> {
  if (!isHybridDemoMode()) return;
  if (process.env.LEDGER_SEED_ON_START?.trim().toLowerCase() === "false") return;
  const wallet =
    process.env.LEDGER_BOOTSTRAP_WALLET?.trim() || DEFAULT_BOOTSTRAP_WALLET;
  const imported = await seedHybridLocalLedgerBaseline(wallet);
  if (imported > 0) {
    console.log(`  Hybrid local ledger seeded: ${imported} baseline trades for ${wallet}`);
  }
}

export async function shouldAutoBootstrapLedger(): Promise<boolean> {
  if (process.env.LEDGER_BOOTSTRAP_ON_START?.trim().toLowerCase() !== "true") {
    return false;
  }
  return (await listLedgerTrades(DEFAULT_BOOTSTRAP_WALLET, 1)).length === 0;
}

export async function maybeBootstrapLedgerOnStart(): Promise<void> {
  if (!(await shouldAutoBootstrapLedger())) return;
  const wallet =
    process.env.LEDGER_BOOTSTRAP_WALLET?.trim() || DEFAULT_BOOTSTRAP_WALLET;
  try {
    const report = await bootstrapLedgerFromChain(wallet, { replace: false });
    console.log(
      `  Ledger bootstrap: ${report.tradesImported} trades, ${report.passedCheckCount} checked` +
        (report.seeded ? " (explicit seed)" : "") +
        ` for ${wallet}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  Ledger bootstrap skipped: ${message}`);
  }
}

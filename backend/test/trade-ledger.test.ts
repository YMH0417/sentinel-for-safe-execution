import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

test("checkedTrades dict is separate from normal trades", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-ledger-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.SENTINEL_LEDGER_FILE = join(dir, "trade-ledger.json");
  delete process.env.DATABASE_URL;

  const { resetLedgerRepositoryForTests } = await import("../src/storage/ledgerRepository.js");
  resetLedgerRepositoryForTests();

  const { recordLedgerTrade, getLedgerAchievementsView, clearLedger, isCheckedTrade } =
    await import("../src/services/tradeLedgerService.js");

  await clearLedger();
  const user = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  await recordLedgerTrade({
    user,
    routeId: "route-usdc-good-safe",
    executionMode: "router",
    safetyMode: "safe",
    tokenIn: "USDC",
    tokenOut: "GOOD",
    amountIn: 100,
    txHash: "0xabc123",
    registerCheck: true,
  });

  await recordLedgerTrade({
    user,
    routeId: "route-usdc-good-safe",
    executionMode: "direct",
    safetyMode: "force",
    tokenIn: "USDC",
    tokenOut: "GOOD",
    amountIn: 50,
    txHash: "0xdef456",
    registerCheck: false,
  });

  const view = await getLedgerAchievementsView(user);
  assert.equal(view.tradeCount, 2);
  assert.equal(view.checkCount, 1);
  assert.equal(await isCheckedTrade("0xabc123"), true);
  assert.equal(await isCheckedTrade("0xdef456"), false);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.SENTINEL_LEDGER_FILE;
  delete process.env.STORAGE_DRIVER;
  resetLedgerRepositoryForTests();
});

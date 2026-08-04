import { Contract, JsonRpcProvider, Wallet, id, getAddress } from "ethers";
import { sentinelLedgerAbi } from "../abi/demoAbis.js";
import { ANVIL_DEFAULT_PRIVATE_KEY } from "../config/chainConfig.js";
import {
  getLedgerRpcUrl,
  loadLedgerDemoConfig,
  shouldMirrorLedgerToChain,
} from "../config/ledgerConfig.js";
import type { RecordLedgerTradeInput } from "./tradeLedgerService.js";

const POOL_LABEL_MAP: Record<string, number> = {
  SAFE: 0,
  SHALLOW: 1,
  TOXIC: 2,
  SDA: 3,
};

function resolveMirrorPrivateKey(): string {
  return (
    process.env.LEDGER_MIRROR_PRIVATE_KEY?.trim() ||
    process.env.SWAP_PRIVATE_KEY?.trim() ||
    ANVIL_DEFAULT_PRIVATE_KEY
  );
}

function tokenAddress(symbol: string, tokens: ReturnType<typeof loadLedgerDemoConfig>["tokens"]): string {
  const key = symbol.toUpperCase() as keyof typeof tokens;
  const addr = tokens[key];
  if (!addr) {
    throw new Error(`Ledger mirror: token ${symbol} missing in anvil manifest`);
  }
  return getAddress(addr);
}

function executionMode(input: RecordLedgerTradeInput): number {
  if (input.executionMode === "sda") return 2;
  if (input.safetyMode === "safe" && input.executionMode === "router") return 0;
  return 1;
}

/** Mirror a recorded trade onto local Anvil SentinelLedger (reporter must be enabled). */
export async function mirrorTradeToAnvilLedger(input: RecordLedgerTradeInput): Promise<void> {
  if (!shouldMirrorLedgerToChain()) return;

  const ledgerConfig = loadLedgerDemoConfig();
  if (!ledgerConfig.ledger) {
    console.warn("  Ledger mirror skipped: no ledger address in anvil manifest");
    return;
  }

  const chainId = ledgerConfig.chainId ?? 31337;
  const provider = new JsonRpcProvider(getLedgerRpcUrl(), chainId, { staticNetwork: true });
  const signer = new Wallet(resolveMirrorPrivateKey(), provider);
  const ledger = new Contract(ledgerConfig.ledger, sentinelLedgerAbi, signer);

  const tokenInAddr = tokenAddress(input.tokenIn, ledgerConfig.tokens);
  const amountInRaw = BigInt(Math.round(input.amountIn * 1e6));
  const amountOutRaw = BigInt(Math.round((input.amountOut ?? 0) * 1e18));
  const poolLabel = POOL_LABEL_MAP[input.poolLabel?.toUpperCase() ?? "SAFE"] ?? 0;
  const routeIdBytes = id(input.routeId);

  await ledger.recordTrade(
    getAddress(input.user),
    routeIdBytes,
    executionMode(input),
    poolLabel,
    tokenInAddr,
    amountInRaw,
    amountOutRaw
  );
}

export function mirrorTradeToAnvilLedgerFireAndForget(input: RecordLedgerTradeInput): void {
  void mirrorTradeToAnvilLedger(input).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  Ledger mirror to Anvil failed: ${message}`);
  });
}

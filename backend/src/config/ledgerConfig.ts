import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { getAddress } from "ethers";
import { getRpcUrl } from "./chainConfig.js";
import type { DemoDeploymentConfig } from "./demoConfig.js";
import { resolveDeploymentPath } from "./demoProfile.js";
import { readJsonFile } from "../utils/readJsonFile.js";
import { resolveRepoFilePath } from "../utils/resolveRepoPath.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

export function isHybridDemoMode(): boolean {
  return process.env.DEMO_HYBRID_MODE?.trim().toLowerCase() === "true";
}

/** RPC for SentinelLedger reads/writes (same chain as demo unless hybrid Anvil). */
export function getLedgerRpcUrl(): string {
  const explicit = process.env.LEDGER_RPC_URL?.trim();
  if (explicit) return explicit;
  if (isHybridDemoMode()) {
    return process.env.ANVIL_RPC_URL?.trim() || "http://127.0.0.1:8545";
  }
  return getRpcUrl();
}

function resolveLedgerDeploymentPath(): string {
  const explicit = process.env.LEDGER_DEPLOYMENT_PATH?.trim();
  if (explicit) {
    const resolved = resolveRepoFilePath(explicit);
    if (fs.existsSync(resolved)) return resolved;
  }
  if (isHybridDemoMode()) {
    return resolveDeploymentPath("anvil-local");
  }
  const fromEnv = process.env.DEMO_DEPLOYMENT_PATH?.trim();
  if (fromEnv) {
    const resolved = resolveRepoFilePath(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }
  return resolveDeploymentPath();
}

let cachedLedgerConfig: DemoDeploymentConfig | null = null;

export function loadLedgerDemoConfig(): DemoDeploymentConfig {
  if (cachedLedgerConfig) return cachedLedgerConfig;

  const deploymentPath = resolveLedgerDeploymentPath();
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Ledger deployment file not found: ${deploymentPath}`);
  }

  const raw = readJsonFile<DemoDeploymentConfig>(deploymentPath);
  const ledgerFromEnv = process.env.DEMO_LEDGER_ADDRESS?.trim();

  cachedLedgerConfig = {
    ...raw,
    ledger: ledgerFromEnv
      ? getAddress(ledgerFromEnv.toLowerCase())
      : raw.ledger
        ? getAddress(raw.ledger.toLowerCase())
        : undefined,
    tokens: { ...(raw.tokens ?? {}) },
  };

  for (const sym of ["USDC", "GOOD", "BAD", "BAIT"] as const) {
    const addr = cachedLedgerConfig.tokens[sym];
    if (addr) {
      cachedLedgerConfig.tokens[sym] = getAddress(addr.toLowerCase());
    }
  }

  return cachedLedgerConfig;
}

export function getLedgerContractAddress(): string | undefined {
  try {
    return loadLedgerDemoConfig().ledger;
  } catch {
    const fromEnv = process.env.DEMO_LEDGER_ADDRESS?.trim();
    return fromEnv ? getAddress(fromEnv) : undefined;
  }
}

export function shouldMirrorLedgerToChain(): boolean {
  if (process.env.LEDGER_MIRROR_TO_CHAIN?.trim().toLowerCase() === "false") {
    return false;
  }
  return isHybridDemoMode() || process.env.LEDGER_MIRROR_TO_CHAIN?.trim().toLowerCase() === "true";
}

export function clearLedgerConfigCache(): void {
  cachedLedgerConfig = null;
}

import { getAddress, isHexString, Wallet, NonceManager } from "ethers";
import { JsonRpcProvider } from "ethers";
import { loadDemoConfig, isDemoChainMode } from "./demoConfig.js";
import { getDemoChainProfile } from "./demoProfile.js";

export interface ChainConfig {
  rpcUrl: string;
  vaultExecutionAddress: string;
}

export interface ChainExecutionConfig extends ChainConfig {
  executorPrivateKey: string;
}

export interface SwapExecutionConfig {
  rpcUrl: string;
  swapPrivateKey: string;
}

export class ChainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainConfigurationError";
  }
}

/** Anvil account #0 — fallback only for local demo deployments */
export const ANVIL_DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function isLocalDemoDeployment(): boolean {
  if (process.env.CHAIN_MODE?.trim().toLowerCase() === "mock") return false;

  try {
    const demo = loadDemoConfig();
    if (demo.deploymentTarget === "remote") return false;
    if (demo.deploymentTarget === "local") return true;
  } catch {
    /* fall through to profile */
  }

  try {
    return getDemoChainProfile().deploymentTarget === "local";
  } catch {
    return isDemoChainMode();
  }
}

export function isMockChainMode(): boolean {
  return process.env.CHAIN_MODE?.trim().toLowerCase() === "mock";
}

export function getRpcUrl(): string {
  const rpcUrl = process.env.RPC_URL?.trim();
  if (!rpcUrl) {
    throw new ChainConfigurationError("RPC_URL is required for chain queries");
  }
  return rpcUrl;
}

export function getChainConfig(): ChainConfig {
  const rpcUrl = process.env.RPC_URL?.trim();
  const configuredAddress = process.env.VAULT_EXECUTION_ADDRESS?.trim();

  if (!rpcUrl) {
    throw new ChainConfigurationError("RPC_URL is required for chain queries");
  }
  if (!configuredAddress) {
    throw new ChainConfigurationError(
      "VAULT_EXECUTION_ADDRESS is required for chain queries"
    );
  }

  try {
    return {
      rpcUrl,
      vaultExecutionAddress: getAddress(configuredAddress),
    };
  } catch {
    throw new ChainConfigurationError(
      "VAULT_EXECUTION_ADDRESS must be a valid Ethereum address"
    );
  }
}

export function getChainExecutionConfig(): ChainExecutionConfig {
  const chainConfig = getChainConfig();
  const executorPrivateKey = resolvePrivateKey(
    process.env.EXECUTOR_PRIVATE_KEY?.trim(),
    "EXECUTOR_PRIVATE_KEY"
  );

  return { ...chainConfig, executorPrivateKey };
}

function resolvePrivateKey(explicit: string | undefined, label: string): string {
  const fromEnv = process.env.SWAP_PRIVATE_KEY?.trim() || explicit;

  if (fromEnv) {
    if (!isHexString(fromEnv, 32)) {
      throw new ChainConfigurationError(`${label} must be a 32-byte hex private key`);
    }
    return fromEnv;
  }

  if (isLocalDemoDeployment()) {
    return ANVIL_DEFAULT_PRIVATE_KEY;
  }

  throw new ChainConfigurationError(`${label} or SWAP_PRIVATE_KEY is required`);
}

export function getSwapExecutionConfig(): SwapExecutionConfig {
  const rpcUrl = getRpcUrl();
  const swapPrivateKey = resolvePrivateKey(
    process.env.SWAP_PRIVATE_KEY?.trim() || process.env.EXECUTOR_PRIVATE_KEY?.trim(),
    "SWAP_PRIVATE_KEY"
  );
  return { rpcUrl, swapPrivateKey };
}

let swapWalletSingleton: Wallet | null = null;
let swapSignerSingleton: NonceManager | null = null;
let swapProviderSingleton: JsonRpcProvider | null = null;

export function getSwapProvider(): JsonRpcProvider {
  if (!swapProviderSingleton) {
    swapProviderSingleton = new JsonRpcProvider(getRpcUrl());
  }
  return swapProviderSingleton;
}

export function getSwapWallet(): Wallet {
  if (!swapWalletSingleton) {
    const { swapPrivateKey } = getSwapExecutionConfig();
    swapWalletSingleton = new Wallet(swapPrivateKey, getSwapProvider());
  }
  return swapWalletSingleton;
}

/** Signer with local nonce tracking for sequential demo swaps */
export function getSwapSigner(): NonceManager {
  if (!swapSignerSingleton) {
    swapSignerSingleton = new NonceManager(getSwapWallet());
  }
  return swapSignerSingleton;
}

function addressFromDeployment(
  getter: (cfg: ReturnType<typeof loadDemoConfig>) => string | undefined
): string | undefined {
  try {
    if (!isDemoChainMode()) return undefined;
    const value = getter(loadDemoConfig());
    return value ? getAddress(value) : undefined;
  } catch {
    return undefined;
  }
}

export function getOptionalSwapRouterAddress(): string | undefined {
  const configured =
    process.env.DEMO_SWAP_ROUTER_ADDRESS?.trim() ||
    process.env.DEMO_SWAP_ROUTER?.trim();
  if (configured) {
    try {
      return getAddress(configured);
    } catch {
      return undefined;
    }
  }
  return addressFromDeployment((cfg) => cfg.swapRouter);
}

export function getOptionalVaultAddress(): string | undefined {
  const configured = process.env.VAULT_EXECUTION_ADDRESS?.trim();
  if (configured) {
    try {
      return getAddress(configured);
    } catch {
      return undefined;
    }
  }
  return addressFromDeployment((cfg) => cfg.vaultExecution);
}

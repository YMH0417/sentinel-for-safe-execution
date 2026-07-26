import { getAddress, isHexString } from "ethers";

export interface ChainConfig {
  rpcUrl: string;
  vaultExecutionAddress: string;
}

export interface ChainExecutionConfig extends ChainConfig {
  executorPrivateKey: string;
}

export class ChainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainConfigurationError";
  }
}

export function isMockChainMode(): boolean {
  return process.env.CHAIN_MODE?.trim().toLowerCase() === "mock";
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
  const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY?.trim();

  if (!executorPrivateKey) {
    throw new ChainConfigurationError(
      "EXECUTOR_PRIVATE_KEY is required for chain execution"
    );
  }
  if (!isHexString(executorPrivateKey, 32)) {
    throw new ChainConfigurationError(
      "EXECUTOR_PRIVATE_KEY must be a 32-byte hex private key"
    );
  }

  return { ...chainConfig, executorPrivateKey };
}

import { Contract, JsonRpcProvider, getAddress } from "ethers";
import type { InterfaceAbi } from "ethers";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import { getChainConfig } from "../config/chainConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vaultAbiPath = path.join(
  __dirname,
  "../../../contracts/abi/VaultExecution.json"
);

export function loadVaultAbi(): InterfaceAbi {
  return JSON.parse(fs.readFileSync(vaultAbiPath, "utf-8")) as InterfaceAbi;
}

export interface VaultNonceResult {
  user: string;
  nonce: string;
  chainId: string;
  contractAddress: string;
}

export async function getVaultNonce(user: string): Promise<VaultNonceResult> {
  const normalizedUser = getAddress(user);
  const config = getChainConfig();
  const provider = new JsonRpcProvider(config.rpcUrl);
  const vault = new Contract(
    config.vaultExecutionAddress,
    loadVaultAbi(),
    provider
  );

  const [nonce, network] = await Promise.all([
    vault.nonces(normalizedUser) as Promise<bigint>,
    provider.getNetwork(),
  ]);

  return {
    user: normalizedUser,
    nonce: nonce.toString(),
    chainId: network.chainId.toString(),
    contractAddress: config.vaultExecutionAddress,
  };
}

import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
} from "ethers";
import type { ContractTransactionReceipt } from "ethers";
import { getChainExecutionConfig } from "../config/chainConfig.js";
import { getVaultNonce, loadVaultAbi } from "./chainService.js";
import type { DecisionType, Event, ExecutionPermit } from "../types.js";

export class VaultExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>
  ) {
    super(message);
    this.name = "VaultExecutionError";
  }
}

export interface VaultExecutionResult {
  success: boolean;
  event: Omit<Event, "id" | "timestamp">;
}

const customErrorMessages: Record<string, string> = {
  InvalidAmountIn: "Permit amountIn must be greater than zero",
  InvalidRouteId: "Permit routeId is invalid",
  InvalidSignature: "DevE permit signature is invalid",
  VaultIsPaused: "Vault execution is paused",
  ZeroAddress: "Permit user cannot be the zero address",
};

function findRevertData(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const candidate = error as Record<string, unknown>;
  if (typeof candidate.data === "string") return candidate.data;

  for (const key of ["error", "info"]) {
    const nested = findRevertData(candidate[key]);
    if (nested) return nested;
  }

  return undefined;
}

function parseCustomError(error: unknown, vaultInterface: Interface): VaultExecutionError {
  const revertData = findRevertData(error);
  if (revertData) {
    try {
      const parsed = vaultInterface.parseError(revertData);
      if (parsed) {
        const values = parsed.args.toArray().map(String);
        const details = Object.fromEntries(
          parsed.fragment.inputs.map((input, index) => [
            input.name || `arg${index}`,
            values[index],
          ])
        );
        const message =
          customErrorMessages[parsed.name] ||
          `${parsed.name}${values.length ? `: ${values.join(", ")}` : ""}`;
        return new VaultExecutionError(parsed.name, message, details);
      }
    } catch {
      // Fall through to the generic RPC error below.
    }
  }

  const message = error instanceof Error ? error.message : "Chain execution failed";
  return new VaultExecutionError("CHAIN_EXECUTION_FAILED", message);
}

function getVaultEvent(
  receipt: ContractTransactionReceipt,
  vaultInterface: Interface
) {
  for (const log of receipt.logs) {
    try {
      const parsed = vaultInterface.parseLog(log);
      if (parsed?.name === "VaultExecuted" || parsed?.name === "VaultRejected") {
        return parsed;
      }
    } catch {
      // Ignore logs emitted by other contracts.
    }
  }
  return null;
}

export async function executeSignedPermit(
  permit: ExecutionPermit,
  signature: string,
  decision: DecisionType,
  routeId: string
): Promise<VaultExecutionResult> {
  const config = getChainExecutionConfig();
  const currentNonce = await getVaultNonce(permit.user);

  if (currentNonce.nonce !== permit.nonce) {
    throw new VaultExecutionError(
      "NONCE_MISMATCH",
      `Permit nonce ${permit.nonce} does not match chain nonce ${currentNonce.nonce}`,
      { expected: currentNonce.nonce, provided: permit.nonce }
    );
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const executor = new Wallet(config.executorPrivateKey, provider);
  const abi = loadVaultAbi();
  const vaultInterface = new Interface(abi);
  const vault = new Contract(config.vaultExecutionAddress, abi, executor);
  const args = [
    permit.user,
    permit.routeId,
    permit.amountIn,
    permit.amountOutQuoted,
    permit.deadline,
    permit.riskScore,
    permit.decision,
    permit.nonce,
    signature,
  ] as const;

  try {
    const expectedExecuted = (await vault.executeRoute.staticCall(...args)) as boolean;
    const transaction = await vault.executeRoute(...args);
    const receipt = await transaction.wait();

    if (!receipt || receipt.status !== 1) {
      throw new VaultExecutionError(
        "TRANSACTION_FAILED",
        "executeRoute transaction was not confirmed successfully"
      );
    }

    const vaultEvent = getVaultEvent(receipt, vaultInterface);
    const txHash = receipt.hash;

    if (vaultEvent?.name === "VaultExecuted") {
      return {
        success: true,
        event: {
          eventType: "ExecutionSuccess",
          routeId,
          decision,
          riskScore: Number(permit.riskScore),
          message: `VaultExecuted on-chain in block ${receipt.blockNumber}`,
          txHash,
          context: {
            account: permit.user,
            amountInRaw: permit.amountIn,
            quotedOutRaw: permit.amountOutQuoted,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            executionMode: "vault",
            safetyMode: "vault",
            executedRouteId: routeId,
          },
        },
      };
    }

    if (vaultEvent?.name === "VaultRejected" || expectedExecuted === false) {
      const reason =
        vaultEvent?.name === "VaultRejected"
          ? String(vaultEvent.args.reason)
          : "Vault returned executed=false";
      return {
        success: false,
        event: {
          eventType: "ExecutionRejected",
          routeId,
          decision,
          riskScore: Number(permit.riskScore),
          message: reason,
          txHash,
          context: {
            account: permit.user,
            amountInRaw: permit.amountIn,
            quotedOutRaw: permit.amountOutQuoted,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            executionMode: "vault",
            safetyMode: "vault",
            requestedRouteId: routeId,
          },
        },
      };
    }

    throw new VaultExecutionError(
      "MISSING_VAULT_EVENT",
      "Transaction succeeded without VaultExecuted or VaultRejected"
    );
  } catch (error) {
    if (error instanceof VaultExecutionError) throw error;
    throw parseCustomError(error, vaultInterface);
  }
}

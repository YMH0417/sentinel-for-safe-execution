import { createHash } from "crypto";
import { getAddress } from "ethers";
import type {
  Decision,
  DecisionType,
  Event,
  ExecutionPermit,
} from "../types.js";

const MOCK_CHAIN_ID = "31337";
const MOCK_VAULT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const nonces = new Map<string, bigint>();

export interface MockNonceResult {
  user: string;
  nonce: string;
  chainId: string;
  contractAddress: string;
}

export interface MockExecutionResult {
  success: boolean;
  event: Omit<Event, "id" | "timestamp">;
}

export function getMockVaultNonce(user: string): MockNonceResult {
  const normalizedUser = getAddress(user);
  return {
    user: normalizedUser,
    nonce: (nonces.get(normalizedUser) ?? 0n).toString(),
    chainId: MOCK_CHAIN_ID,
    contractAddress: MOCK_VAULT_ADDRESS,
  };
}

function mockTransactionHash(routeId: string, nonce: string): string {
  return `0x${createHash("sha256")
    .update(`${routeId}:${nonce}:${Date.now()}`)
    .digest("hex")}`;
}

export function executeMockPermit(
  permit: ExecutionPermit,
  decision: DecisionType,
  routeId: string
): MockExecutionResult {
  const current = getMockVaultNonce(permit.user);
  if (current.nonce !== permit.nonce) {
    throw new Error(
      `Permit nonce ${permit.nonce} does not match mock nonce ${current.nonce}`
    );
  }

  nonces.set(current.user, BigInt(current.nonce) + 1n);
  const success = decision !== "REJECT";
  return {
    success,
    event: {
      eventType: success ? "ExecutionSuccess" : "ExecutionRejected",
      routeId,
      decision,
      riskScore: Number(permit.riskScore),
      message: success
        ? "Executed successfully in local mock chain mode"
        : "Execution rejected by Safety Agent in local mock chain mode",
      txHash: mockTransactionHash(routeId, current.nonce),
    },
  };
}

export function executeMockLegacy(decision: Decision): MockExecutionResult {
  const routeId =
    decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId
      ? decision.fallbackRouteId
      : decision.routeId;
  const success = decision.decision !== "REJECT";

  return {
    success,
    event: {
      eventType: success ? "ExecutionSuccess" : "ExecutionRejected",
      routeId,
      decision: decision.decision,
      riskScore: decision.riskScore,
      fallbackRouteId: decision.fallbackRouteId ?? undefined,
      message: success
        ? "Executed successfully in local mock chain mode"
        : "Execution rejected by Safety Agent in local mock chain mode",
      txHash: mockTransactionHash(routeId, "legacy"),
    },
  };
}

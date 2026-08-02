import { id, JsonRpcProvider, Wallet } from "ethers";
import {
  getOptionalVaultAddress,
  getRpcUrl,
  ANVIL_DEFAULT_PRIVATE_KEY,
  isLocalDemoDeployment,
} from "../config/chainConfig.js";
import { getVaultNonce } from "./chainService.js";
import type { Decision, DecisionType, ExecutionPermit } from "../types.js";

export class AgentSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSignError";
  }
}

const contractDecision: Record<DecisionType, 0 | 1 | 2> = {
  ALLOW: 0,
  REJECT: 1,
  FALLBACK_TO_SAFE_ROUTE: 2,
};

export function getAgentPrivateKey(): string {
  const agentKey = process.env.AGENT_PRIVATE_KEY?.trim();
  if (agentKey) return agentKey;

  if (isLocalDemoDeployment()) {
    return process.env.EXECUTOR_PRIVATE_KEY?.trim() || ANVIL_DEFAULT_PRIVATE_KEY;
  }

  throw new AgentSignError(
    "AGENT_PRIVATE_KEY is required for Agent signing on remote demo profiles"
  );
}

export function isAgentSigningConfigured(): boolean {
  try {
    getAgentPrivateKey();
    return Boolean(getOptionalVaultAddress());
  } catch {
    return false;
  }
}

export async function signExecutionPermit(params: {
  user: string;
  routeName: string;
  amountInRaw: bigint;
  amountOutQuotedRaw: bigint;
  deadline: number;
  decision: Decision;
  useFallbackRoute?: boolean;
}): Promise<{ permit: ExecutionPermit; signature: string; routeIdBytes32: string }> {
  const vaultAddress = getOptionalVaultAddress();
  if (!vaultAddress) {
    throw new AgentSignError("VAULT_EXECUTION_ADDRESS is required for agent signing");
  }

  const effectiveRouteName =
    params.useFallbackRoute && params.decision.fallbackRouteId
      ? params.decision.fallbackRouteId
      : params.decision.routeId;

  const routeIdBytes32 = id(effectiveRouteName);
  const nonceInfo = await getVaultNonce(params.user);
  const provider = new JsonRpcProvider(getRpcUrl());
  const network = await provider.getNetwork();
  const agent = new Wallet(getAgentPrivateKey(), provider);

  const permit: ExecutionPermit = {
    user: params.user,
    routeId: routeIdBytes32,
    amountIn: params.amountInRaw.toString(),
    amountOutQuoted: params.amountOutQuotedRaw.toString(),
    deadline: String(params.deadline),
    riskScore: String(params.decision.riskScore),
    decision: contractDecision[params.decision.decision],
    nonce: nonceInfo.nonce,
  };

  const signature = await agent.signTypedData(
    {
      name: "Sentinel Vault Execution",
      version: "1",
      chainId: network.chainId,
      verifyingContract: vaultAddress,
    },
    {
      ExecutionPermit: [
        { name: "user", type: "address" },
        { name: "routeId", type: "bytes32" },
        { name: "amountIn", type: "uint256" },
        { name: "amountOutQuoted", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "riskScore", type: "uint256" },
        { name: "decision", type: "uint8" },
        { name: "nonce", type: "uint256" },
      ],
    },
    {
      user: permit.user,
      routeId: permit.routeId,
      amountIn: permit.amountIn,
      amountOutQuoted: permit.amountOutQuoted,
      deadline: permit.deadline,
      riskScore: permit.riskScore,
      decision: permit.decision,
      nonce: permit.nonce,
    }
  );

  return { permit, signature, routeIdBytes32 };
}

export function defaultSwapDeadline(secondsFromNow = 600): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

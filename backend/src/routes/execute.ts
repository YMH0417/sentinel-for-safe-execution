// backend/src/routes/execute.ts — nonce query + signed permit execution
import { Router, Request, Response } from "express";
import {
  encodeBytes32String,
  isAddress,
  isHexString,
  ZeroAddress,
} from "ethers";
import { getRouteById } from "../services/routeService.js";
import { addEvent } from "../services/eventService.js";
import { getVaultNonce } from "../services/chainService.js";
import {
  executeSignedPermit,
  VaultExecutionError,
} from "../services/vaultService.js";
import { ChainConfigurationError } from "../config/chainConfig.js";
import { isMockChainMode } from "../config/chainConfig.js";
import { evaluateRoute } from "../services/agentService.js";
import {
  executeMockLegacy,
  executeMockPermit,
  getMockVaultNonce,
} from "../services/mockChainService.js";
import type {
  ContractDecision,
  DecisionType,
  ExecuteRequest,
  ExecutionPermit,
} from "../types.js";

const router = Router();

const contractDecision: Record<DecisionType, ContractDecision> = {
  ALLOW: 0,
  REJECT: 1,
  FALLBACK_TO_SAFE_ROUTE: 2,
};

function isAmountString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)(\.\d+)?$/.test(value);
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function validatePermitFields(permit: ExecutionPermit): string | null {
  if (!isAddress(permit.user) || permit.user === ZeroAddress) {
    return "permit.user must be a non-zero Ethereum address";
  }
  if (!isHexString(permit.routeId, 32)) {
    return "permit.routeId must be a 32-byte hex value";
  }

  for (const field of [
    "amountIn",
    "amountOutQuoted",
    "deadline",
    "riskScore",
    "nonce",
  ] as const) {
    const validator = field === "amountIn" || field === "amountOutQuoted" ? isAmountString : isDecimalString;
    if (!validator(permit[field])) {
      return `permit.${field} must be a non-negative decimal string`;
    }
  }

  if (BigInt(permit.amountIn) === 0n) {
    return "permit.amountIn must be greater than zero";
  }
  if (BigInt(permit.riskScore) > 100n) {
    return "permit.riskScore must be between 0 and 100";
  }
  if (![0, 1, 2].includes(permit.decision)) {
    return "permit.decision must be 0, 1, or 2";
  }
  if (BigInt(permit.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
    return "permit.deadline has expired";
  }

  return null;
}

async function validateExecuteRequest(
  body: unknown
): Promise<{ request?: ExecuteRequest; effectiveRouteId?: string; error?: string }> {
  if (!body || typeof body !== "object") {
    return { error: "request body must be an object" };
  }

  const candidate = body as Partial<ExecuteRequest>;
  const evaluation = candidate.evaluation;
  const permit = candidate.permit;
  const signature = candidate.signature;

  if (!evaluation || typeof evaluation !== "object") {
    return { error: "evaluation is required" };
  }
  if (!permit || typeof permit !== "object") {
    return { error: "permit is required" };
  }
  if (!isHexString(signature, 65)) {
    return { error: "signature must be a 65-byte hex value" };
  }
  if (!["ALLOW", "REJECT", "FALLBACK_TO_SAFE_ROUTE"].includes(evaluation.decision)) {
    return { error: "evaluation.decision is invalid" };
  }
  if (
    !Number.isInteger(evaluation.riskScore) ||
    evaluation.riskScore < 0 ||
    evaluation.riskScore > 100
  ) {
    return { error: "evaluation.riskScore must be an integer between 0 and 100" };
  }

  const permitError = validatePermitFields(permit);
  if (permitError) return { error: permitError };

  const effectiveRouteId =
    evaluation.decision === "FALLBACK_TO_SAFE_ROUTE"
      ? evaluation.fallbackRouteId
      : evaluation.routeId;
  if (!effectiveRouteId) {
    return { error: "evaluation.fallbackRouteId is required for fallback" };
  }

  let encodedRouteId: string;
  try {
    encodedRouteId = encodeBytes32String(effectiveRouteId);
  } catch {
    return { error: "effective routeId must fit in bytes32 UTF-8 encoding" };
  }

  if (permit.routeId.toLowerCase() !== encodedRouteId.toLowerCase()) {
    return { error: "permit.routeId does not match the evaluated route" };
  }
  if (permit.decision !== contractDecision[evaluation.decision]) {
    return { error: "permit.decision does not match evaluation.decision" };
  }
  if (BigInt(permit.riskScore) !== BigInt(evaluation.riskScore)) {
    return { error: "permit.riskScore does not match evaluation.riskScore" };
  }

  const route = await getRouteById(effectiveRouteId);
  if (!route) {
    return { error: `Route ${effectiveRouteId} not found` };
  }
  if (
    Math.abs(parseFloat(permit.amountIn) - route.amountIn) > 0.0001 ||
    Math.abs(parseFloat(permit.amountOutQuoted) - route.quotedOut) > 0.05
  ) {
    return { error: "permit amounts do not match the evaluated route data" };
  }

  return {
    request: candidate as ExecuteRequest,
    effectiveRouteId,
  };
}

router.get("/nonce", async (req: Request, res: Response) => {
  const user = typeof req.query.user === "string" ? req.query.user : "";

  if (!isAddress(user)) {
    return res.status(400).json({
      error: {
        code: "INVALID_USER_ADDRESS",
        message: "user must be a valid Ethereum address",
      },
    });
  }

  if (isMockChainMode()) {
    return res.json(getMockVaultNonce(user));
  }

  try {
    const result = await getVaultNonce(user);
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chain query failed";
    const status = err instanceof ChainConfigurationError ? 503 : 502;
    return res.status(status).json({
      error: {
        code:
          err instanceof ChainConfigurationError
            ? "CHAIN_CONFIGURATION_ERROR"
            : "CHAIN_QUERY_FAILED",
        message,
      },
    });
  }
});

type MockHandleResult =
  | {
      success: boolean;
      event: ReturnType<typeof addEvent>;
      decision: ExecuteRequest["evaluation"];
    }
  | { error: string; status: number };

/**
 * Local demo helper: frontend currently pads UTF-8 route ids as if they were
 * hex (e.g. "route-a" → "0x...route-a"), which fails strict bytes32 checks.
 * In mock mode we trust evaluation and rewrite permit fields for the demo.
 */
async function handleMockPermitBody(body: unknown): Promise<MockHandleResult> {
  if (!body || typeof body !== "object") {
    return { error: "request body must be an object", status: 400 };
  }

  const candidate = body as Partial<ExecuteRequest> & {
    routeId?: string;
    configProfile?: string;
  };

  // Legacy shape: { routeId } without permit
  if (typeof candidate.routeId === "string" && !candidate.permit) {
    const route = await getRouteById(candidate.routeId);
    if (!route) {
      return { error: `Route ${candidate.routeId} not found`, status: 404 };
    }
    const decision = await evaluateRoute(
      candidate.routeId,
      typeof candidate.configProfile === "string"
        ? candidate.configProfile
        : "normal"
    );
    const result = executeMockLegacy(decision);
    return {
      success: result.success,
      event: addEvent(result.event),
      decision,
    };
  }

  const evaluation = candidate.evaluation;
  if (!evaluation || typeof evaluation !== "object") {
    return { error: "evaluation is required", status: 400 };
  }
  if (!["ALLOW", "REJECT", "FALLBACK_TO_SAFE_ROUTE"].includes(evaluation.decision)) {
    return { error: "evaluation.decision is invalid", status: 400 };
  }

  const effectiveRouteId =
    evaluation.decision === "FALLBACK_TO_SAFE_ROUTE"
      ? evaluation.fallbackRouteId
      : evaluation.routeId;
  if (!effectiveRouteId) {
    return {
      error: "evaluation.fallbackRouteId is required for fallback",
      status: 400,
    };
  }

  const route = await getRouteById(effectiveRouteId);
  if (!route) {
    return { error: `Route ${effectiveRouteId} not found`, status: 404 };
  }

  const permitIn = candidate.permit;
  const user =
    permitIn && typeof permitIn === "object" && typeof permitIn.user === "string"
      ? permitIn.user
      : "";
  if (!isAddress(user) || user === ZeroAddress) {
    return {
      error: "permit.user must be a non-zero Ethereum address",
      status: 400,
    };
  }

  let encodedRouteId: string;
  try {
    encodedRouteId = encodeBytes32String(effectiveRouteId);
  } catch {
    return {
      error: "effective routeId must fit in bytes32 UTF-8 encoding",
      status: 400,
    };
  }

  const currentNonce = getMockVaultNonce(user).nonce;
  const permit: ExecutionPermit = {
    user,
    routeId: encodedRouteId,
    amountIn: String(route.amountIn),
    amountOutQuoted: String(route.quotedOut),
    deadline: String(
      Math.max(
        Number(permitIn?.deadline) || 0,
        Math.floor(Date.now() / 1000) + 3600
      )
    ),
    riskScore: String(evaluation.riskScore),
    decision: contractDecision[evaluation.decision],
    nonce:
      typeof permitIn?.nonce === "string" && isDecimalString(permitIn.nonce)
        ? permitIn.nonce
        : currentNonce,
  };

  try {
    const result = executeMockPermit(permit, evaluation.decision, effectiveRouteId);
    return {
      success: result.success,
      event: addEvent(result.event),
      decision: evaluation,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Mock execution failed";
    return { error: message, status: 400 };
  }
}

router.post("/", async (req: Request, res: Response) => {
  if (isMockChainMode()) {
    const mockResult = await handleMockPermitBody(req.body);
    if ("error" in mockResult) {
      return res.status(mockResult.status).json({
        error: {
          code: "INVALID_EXECUTION_REQUEST",
          message: mockResult.error,
        },
      });
    }
    return res.json({
      success: mockResult.success,
      event: mockResult.event,
      decision: mockResult.decision,
    });
  }

  const validation = await validateExecuteRequest(req.body);
  if (!validation.request || !validation.effectiveRouteId) {
    return res.status(400).json({
      error: {
        code: "INVALID_EXECUTION_REQUEST",
        message: validation.error || "Invalid execution request",
      },
    });
  }

  const { evaluation, permit, signature } = validation.request;

  try {

    const result = await executeSignedPermit(
      permit,
      signature,
      evaluation.decision,
      validation.effectiveRouteId
    );
    const event = addEvent(result.event);
    return res.json({ success: result.success, event, decision: evaluation });
  } catch (err: unknown) {
    if (err instanceof ChainConfigurationError) {
      return res.status(503).json({
        error: { code: err.name, message: err.message },
      });
    }
    if (err instanceof VaultExecutionError) {
      return res.status(422).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }

    const message = err instanceof Error ? err.message : "Chain execution failed";
    return res.status(502).json({
      error: { code: "CHAIN_EXECUTION_FAILED", message },
    });
  }
});

export default router;

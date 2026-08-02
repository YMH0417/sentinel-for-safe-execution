import {
  Contract,
  JsonRpcProvider,
  id,
  getAddress,
  keccak256,
  randomBytes,
  toUtf8Bytes,
  type ContractTransactionReceipt,
} from "ethers";
import {
  demoErc20Abi,
  demoPairAbi,
  demoPoolRegistryAbi,
  demoScenarioDeployerAbi,
  demoSwapRouterAbi,
} from "../abi/demoAbis.js";
import {
  ChainConfigurationError,
  getOptionalSwapRouterAddress,
  getOptionalVaultAddress,
  getRpcUrl,
  getSwapSigner,
  getSwapWallet,
} from "../config/chainConfig.js";
import {
  DemoDeploymentConfig,
  DemoTokenSymbol,
  labelFromNumber,
  resolveTokenSymbol,
} from "../config/demoConfig.js";
import {
  decimalsForSymbol,
  parseRouteName,
  tokenSymbolFromKey,
} from "../config/demoRoutes.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import {
  getAmountOut,
  toHumanAmount,
  toRawAmount,
} from "./poolQuoteMath.js";
import type { Decision, DecisionType, SwapRequest, SwapResult } from "../types.js";
import { evaluateRoute, loadRiskConfig } from "./agentService.js";
import { getChainRouteById } from "./chainQuoteService.js";
import {
  defaultSwapDeadline,
  isAgentSigningConfigured,
  signExecutionPermit,
} from "./agentSignService.js";
import { addEvent } from "./eventService.js";
import {
  SDA_EXECUTION_WINDOW_SECONDS,
  waitForSdaExecutionWindow,
} from "./sdaWindowService.js";
import { withTimeout, waitForReceipt } from "../utils/withTimeout.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

/** Serialize on-chain swaps — shared wallet nonce must not race */
let swapChain = Promise.resolve();
const SWAP_LOCK_TIMEOUT_MS = 180_000;

function withSwapLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = swapChain.then(
    () =>
      withTimeout(
        fn(),
        SWAP_LOCK_TIMEOUT_MS,
        "Swap queue timed out — a prior on-chain swap may still be pending"
      ),
    () =>
      withTimeout(
        fn(),
        SWAP_LOCK_TIMEOUT_MS,
        "Swap queue timed out — a prior on-chain swap may still be pending"
      )
  );
  swapChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export class SwapExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SwapExecutionError";
  }
}

export type SwapFailureStage =
  | "evaluation"
  | "precondition"
  | "execution"
  | "configuration";

export interface SwapFailureClassification {
  failureStage: SwapFailureStage;
  prevented: boolean;
}

const PRECONDITION_ERROR_CODES = new Set([
  "INVALID_REQUEST",
  "ROUTE_NOT_FOUND",
  "INVALID_ROUTE",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_ALLOWANCE",
  "INSUFFICIENT_LIQUIDITY",
  "USER_PAYER_REQUIRES_ROUTER",
]);

export function classifySwapFailure(
  error: unknown
): SwapFailureClassification {
  if (error instanceof ChainConfigurationError) {
    return { failureStage: "configuration", prevented: false };
  }
  if (error instanceof SwapExecutionError) {
    if (error.code === "SWAP_REJECTED_BY_AGENT" || error.code === "SWAP_FALLBACK_REQUIRED") {
      return { failureStage: "evaluation", prevented: true };
    }
    if (PRECONDITION_ERROR_CODES.has(error.code)) {
      return { failureStage: "precondition", prevented: false };
    }
  }
  return { failureStage: "execution", prevented: false };
}

function getMaxSlippageBps(): number {
  const config = loadRiskConfig() as { maxSlippageBps?: number };
  return config.maxSlippageBps ?? 100;
}

function getMaxUnsafeSlippageBps(): number {
  const config = loadRiskConfig() as { maxUnsafeSlippageBps?: number };
  return config.maxUnsafeSlippageBps ?? 10_000;
}

function resolveSlippageBps(params: SwapRequest): number {
  const configMax = getMaxUnsafeSlippageBps();
  const defaultBps = getMaxSlippageBps();
  if (params.slippageBps === undefined) return defaultBps;
  return Math.min(params.slippageBps, configMax);
}

function applyMinOut(referenceOutRaw: bigint, slippageBps: number): bigint {
  return (referenceOutRaw * BigInt(10_000 - slippageBps)) / 10_000n;
}

function applyMaxOut(referenceOutRaw: bigint, slippageBps: number): bigint {
  return (referenceOutRaw * BigInt(10_000 + slippageBps)) / 10_000n;
}

function assertQuoteWithinSlippageBand(
  quotedOutRaw: bigint,
  expectedOutRaw: bigint,
  slippageBps: number,
  decOut: number
): { amountOutMinRaw: bigint; amountOutMaxRaw: bigint } {
  const amountOutMinRaw = applyMinOut(expectedOutRaw, slippageBps);
  const amountOutMaxRaw = applyMaxOut(expectedOutRaw, slippageBps);

  if (quotedOutRaw < amountOutMinRaw) {
    throw new SwapExecutionError("SLIPPAGE_EXCEEDED", "Quoted output below minimum (fair price − slippage)", {
      quotedOut: toHumanAmount(quotedOutRaw, decOut),
      expectedOut: toHumanAmount(expectedOutRaw, decOut),
      amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
      amountOutMax: toHumanAmount(amountOutMaxRaw, decOut),
      slippageBps,
    });
  }

  if (quotedOutRaw > amountOutMaxRaw) {
    throw new SwapExecutionError(
      "QUOTE_DEVIATION_EXCEEDED",
      "Quoted output above maximum (fair price + slippage)",
      {
        quotedOut: toHumanAmount(quotedOutRaw, decOut),
        expectedOut: toHumanAmount(expectedOutRaw, decOut),
        amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
        amountOutMax: toHumanAmount(amountOutMaxRaw, decOut),
        slippageBps,
      }
    );
  }

  return { amountOutMinRaw, amountOutMaxRaw };
}

function validateSafeSettlement(
  actualOutRaw: bigint,
  decOut: number
): { ok: boolean; failureCode?: string; failureMessage?: string } {
  if (actualOutRaw <= 0n) {
    return {
      ok: false,
      failureCode: "NO_OUTPUT_RECEIVED",
      failureMessage: "On-chain swap produced zero tokenOut balance change",
    };
  }
  return { ok: true };
}

function validateOnChainSettlement(
  actualOutRaw: bigint,
  expectedOutRaw: bigint,
  amountOutMinRaw: bigint,
  amountOutMaxRaw: bigint,
  slippageBps: number,
  decOut: number
): { ok: boolean; failureCode?: string; failureMessage?: string } {
  if (actualOutRaw <= 0n) {
    return {
      ok: false,
      failureCode: "NO_OUTPUT_RECEIVED",
      failureMessage: "On-chain swap produced zero tokenOut balance change",
    };
  }
  if (actualOutRaw < amountOutMinRaw) {
    return {
      ok: false,
      failureCode: "SETTLEMENT_BELOW_MIN",
      failureMessage: `Actual output ${toHumanAmount(actualOutRaw, decOut)} below minimum ${toHumanAmount(amountOutMinRaw, decOut)}`,
    };
  }
  if (actualOutRaw > amountOutMaxRaw) {
    return {
      ok: false,
      failureCode: "SUSPICIOUS_SETTLEMENT",
      failureMessage: `Actual output ${toHumanAmount(actualOutRaw, decOut)} exceeds fair price + slippage (${toHumanAmount(amountOutMaxRaw, decOut)})`,
    };
  }
  return { ok: true };
}

async function assertUserCanPay(
  provider: JsonRpcProvider,
  user: string,
  tokenAddress: string,
  routerAddress: string,
  amountInRaw: bigint,
  symbol: string
): Promise<void> {
  const token = new Contract(tokenAddress, demoErc20Abi, provider);
  const [balance, allowance] = await Promise.all([
    token.balanceOf(user) as Promise<bigint>,
    token.allowance(user, routerAddress) as Promise<bigint>,
  ]);

  if (balance < amountInRaw) {
    throw new SwapExecutionError(
      "INSUFFICIENT_BALANCE",
      `Insufficient ${symbol} balance in wallet ${user}`,
      {
        required: amountInRaw.toString(),
        balance: balance.toString(),
      }
    );
  }

  if (allowance < amountInRaw) {
    throw new SwapExecutionError(
      "INSUFFICIENT_ALLOWANCE",
      `Approve DemoSwapRouter to spend ${symbol} before swapping`,
      {
        router: routerAddress,
        token: tokenAddress,
        required: amountInRaw.toString(),
        allowance: allowance.toString(),
      }
    );
  }
}

async function readSwapReserves(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenInAddress: string
): Promise<{ reserveIn: bigint; reserveOut: bigint; token0: string }> {
  return withRpcRetry(async () => {
    const pair = new Contract(pairAddress, demoPairAbi, provider);
    const token0 = (await pair.token0()) as string;
    const reserves = (await pair.getReserves()) as [bigint, bigint, number];
    const tokenInIsToken0 = token0.toLowerCase() === tokenInAddress.toLowerCase();
    return tokenInIsToken0
      ? { reserveIn: reserves[0], reserveOut: reserves[1], token0 }
      : { reserveIn: reserves[1], reserveOut: reserves[0], token0 };
  });
}

function findPool(config: DemoDeploymentConfig, routeId: string) {
  const pool = config.pools.find((p) => p.routeName === routeId);
  if (!pool) {
    throw new SwapExecutionError("ROUTE_NOT_FOUND", `Route ${routeId} not found`, { routeId });
  }
  return pool;
}

function resolveSymbols(
  routeId: string,
  pool: DemoDeploymentConfig["pools"][number],
  config: DemoDeploymentConfig,
  params: SwapRequest
): { tokenIn: DemoTokenSymbol; tokenOut: DemoTokenSymbol } {
  const parsed = parseRouteName(routeId);
  if (parsed) {
    const tokenIn = tokenSymbolFromKey(parsed.tokenInKey)!;
    const tokenOut = tokenSymbolFromKey(parsed.tokenOutKey)!;
    return { tokenIn, tokenOut };
  }
  const tokenIn =
    resolveTokenSymbol(config, params.tokenIn ?? "") ??
    inferSymbolFromAddress(config, pool.tokenIn);
  const tokenOut =
    resolveTokenSymbol(config, params.tokenOut ?? "") ??
    inferSymbolFromAddress(config, pool.tokenOut);
  if (!tokenIn || !tokenOut) {
    throw new SwapExecutionError("INVALID_ROUTE", `Cannot resolve tokens for ${routeId}`);
  }
  return { tokenIn, tokenOut };
}

function inferSymbolFromAddress(
  config: DemoDeploymentConfig,
  address: string
): DemoTokenSymbol | undefined {
  const lower = address.toLowerCase();
  for (const [symbol, addr] of Object.entries(config.tokens)) {
    if (addr && addr.toLowerCase() === lower) {
      return symbol as DemoTokenSymbol;
    }
  }
  return undefined;
}

async function resolveExecutionPlan(
  params: SwapRequest,
  tokenIn: DemoTokenSymbol,
  tokenOut: DemoTokenSymbol
): Promise<{
  executedRouteId: string;
  agentDecision: Decision;
  executionDecision: Decision;
  agentBypassed?: boolean;
}> {
  if (params.skipEvaluate || params.force) {
    return {
      executedRouteId: params.routeId,
      agentDecision: {
        decision: "ALLOW",
        riskScore: 0,
        reason: params.force ? "Force swap (Agent bypassed)" : "Evaluate skipped",
        routeId: params.routeId,
        fallbackRouteId: null,
        flags: params.force ? ["agent_bypassed"] : [],
      },
      executionDecision: {
        decision: "ALLOW",
        riskScore: 0,
        reason: "Execution permit for on-chain router gate",
        routeId: params.routeId,
        fallbackRouteId: null,
        flags: [],
      },
      agentBypassed: Boolean(params.force),
    };
  }

  let decision = await evaluateRoute(params.routeId, params.configProfile ?? "normal", {
    tokenIn,
    tokenOut,
    amountIn: params.amountIn,
  });
  const requestedDecision = decision;
  const eventContext = {
    correlationId: params.correlationId,
    tokenIn,
    tokenOut,
    amountIn: params.amountIn,
    requestedRouteId: params.routeId,
    configProfile: params.configProfile ?? "normal",
    safetyMode: "safe" as const,
  };

  addEvent({
    eventType: "RouteEvaluated",
    routeId: params.routeId,
    message: `Safe swap evaluate ${params.routeId}`,
    context: eventContext,
  });
  addEvent({
    eventType: "DecisionMade",
    routeId: params.routeId,
    decision: decision.decision,
    riskScore: decision.riskScore,
    fallbackRouteId: decision.fallbackRouteId ?? undefined,
    message: decision.reason,
    context: {
      ...eventContext,
      flags: decision.flags,
      quotedOut: decision.evidence?.quotedOut,
      expectedOut: decision.evidence?.expectedOut,
      quoteDeviation: decision.evidence?.quoteDeviation,
      historicalFailureRate: decision.evidence?.historicalFailureRate,
      poolRiskScore: decision.evidence?.poolRiskScore,
      priceImpactBps: decision.evidence?.priceImpactBps,
      poolLabel: decision.evidence?.poolLabel,
    },
  });

  if (decision.decision === "REJECT") {
    throw new SwapExecutionError("SWAP_REJECTED_BY_AGENT", decision.reason, { decision });
  }

  if (decision.decision === "FALLBACK_TO_SAFE_ROUTE") {
    addEvent({
      eventType: "FallbackRequired",
      routeId: params.routeId,
      fallbackRouteId: decision.fallbackRouteId ?? undefined,
      decision: "FALLBACK_TO_SAFE_ROUTE",
      riskScore: requestedDecision.riskScore,
      message: `Agent recommends ${decision.fallbackRouteId ?? "safe route"} (manual switch required)`,
      context: {
        ...eventContext,
        flags: requestedDecision.flags,
      },
    });
    throw new SwapExecutionError(
      "SWAP_FALLBACK_REQUIRED",
      decision.reason,
      { decision: requestedDecision }
    );
  }

  return {
    executedRouteId: params.routeId,
    agentDecision: requestedDecision,
    executionDecision: decision,
    agentBypassed: false,
  };
}

export async function getTokenBalances(
  holder: string,
  config?: DemoDeploymentConfig
): Promise<Partial<Record<DemoTokenSymbol, import("../types.js").TokenBalance>>> {
  const live = config ?? (await getLiveDemoConfig());
  const provider = new JsonRpcProvider(getRpcUrl());
  const result: Partial<Record<DemoTokenSymbol, import("../types.js").TokenBalance>> = {};

  for (const symbol of ["USDC", "GOOD", "BAD", "BAIT"] as DemoTokenSymbol[]) {
    const address = live.tokens[symbol];
    if (!address) continue;
    const token = new Contract(address, demoErc20Abi, provider);
    const raw = (await withRpcRetry(() => token.balanceOf(holder) as Promise<bigint>));
    const decimals = decimalsForSymbol(symbol);
    result[symbol] = {
      symbol,
      address,
      raw: raw.toString(),
      human: toHumanAmount(raw, decimals),
    };
  }
  return result;
}

function buildSdaSwapId(recipient: string, routeName: string): string {
  return keccak256(
    toUtf8Bytes(`${recipient.toLowerCase()}:${routeName}:${Date.now()}:${randomBytes(8)}`)
  );
}

async function executeSdaDelayedRouterSwap(params: {
  router: Contract;
  provider: JsonRpcProvider;
  recipient: string;
  executedRouteId: string;
  amountInRaw: bigint;
  amountOutMinRaw: bigint;
  decOut: number;
  swapRequest: SwapRequest;
  correlationId?: string;
}): Promise<{
  receipt: ContractTransactionReceipt;
  swapId: string;
  sdaOpenTxHash: string;
  sdaReadyAt: number;
  sdaWaitedSeconds: number;
  quotedOutAtOpen: number;
}> {
  const routeIdBytes32 = id(params.executedRouteId);
  const swapId = buildSdaSwapId(params.recipient, params.executedRouteId);

  const openTx = await params.router.openSdaExecutionWindow(
    swapId,
    params.recipient,
    routeIdBytes32,
    params.amountInRaw,
    params.amountOutMinRaw,
    params.recipient
  );
  const openReceipt = (await waitForReceipt(openTx)) as ContractTransactionReceipt | null;
  if (!openReceipt || openReceipt.status === 0) {
    throw new SwapExecutionError("SWAP_REVERTED", "SDA execution window open reverted on-chain", {
      txHash: openReceipt?.hash,
    });
  }

  let quotedOutAtOpen = 0;
  for (const log of openReceipt.logs) {
    try {
      const parsed = params.router.interface.parseLog(log);
      if (parsed?.name === "SdaExecutionWindowOpened") {
        quotedOutAtOpen = toHumanAmount(parsed.args.quotedOutAtOpen as bigint, params.decOut);
        break;
      }
    } catch {
      // ignore unrelated logs
    }
  }

  const readyAtBn: bigint = await params.router.getSdaWindowReadyAt(swapId);
  const sdaReadyAt = Number(readyAtBn);
  const fastForward =
    params.swapRequest.fastForwardSdaWindow === true ||
    params.swapRequest.correlationId?.startsWith("batch-") === true;

  addEvent({
    eventType: "SdaExecutionWindowWaiting",
    routeId: params.executedRouteId,
    message: fastForward
      ? `SDA window fast-forward (${SDA_EXECUTION_WINDOW_SECONDS}s simulated)`
      : `SDA execution window open — waiting ${SDA_EXECUTION_WINDOW_SECONDS}s for bridge finality`,
    txHash: openReceipt.hash,
    context: {
      correlationId: params.correlationId,
      account: params.recipient,
      swapId,
      sdaReadyAt,
      sdaWindowSeconds: SDA_EXECUTION_WINDOW_SECONDS,
      fastForward,
      quotedOutAtOpen,
      poolLabel: "SDA",
    },
  });

  const { waitedSeconds } = await waitForSdaExecutionWindow(params.provider, readyAtBn, {
    wallClockWait: !fastForward,
    fastForward,
  });

  const completeTx = await params.router.completeSdaExecutionWindow(swapId);
  const receipt = (await waitForReceipt(completeTx)) as ContractTransactionReceipt | null;
  if (!receipt) {
    throw new SwapExecutionError("SWAP_FAILED", "SDA completion produced no receipt");
  }
  if (receipt.status === 0) {
    throw new SwapExecutionError("SWAP_REVERTED", "SDA completion reverted on-chain", {
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  }

  return {
    receipt,
    swapId,
    sdaOpenTxHash: openReceipt.hash,
    sdaReadyAt,
    sdaWaitedSeconds: waitedSeconds,
    quotedOutAtOpen,
  };
}

export async function executeDemoSwap(params: SwapRequest): Promise<SwapResult> {
  return withSwapLock(() => executeDemoSwapInner(params));
}

/** Safe swap: evaluate + optional fallback + slippage guard (+ router one-tx when configured) */
export async function executeSafeSwap(params: SwapRequest): Promise<SwapResult> {
  return executeDemoSwap({ ...params, skipEvaluate: false, force: false });
}

/** Force swap bypassing Agent (dev / verify-all) */
export async function executeForceSwap(params: SwapRequest): Promise<SwapResult> {
  return executeDemoSwap({ ...params, skipEvaluate: true, force: true });
}

async function executeDemoSwapInner(params: SwapRequest): Promise<SwapResult> {
  if (!params.routeId) {
    throw new SwapExecutionError("INVALID_REQUEST", "routeId is required");
  }
  if (!params.amountIn || params.amountIn <= 0) {
    throw new SwapExecutionError("INVALID_REQUEST", "amountIn must be positive");
  }

  const config = await getLiveDemoConfig();
  const requestedRouteId = params.routeId;
  const draftPool = findPool(config, requestedRouteId);
  const { tokenIn, tokenOut } = resolveSymbols(requestedRouteId, draftPool, config, params);

  const {
    executedRouteId,
    agentDecision,
    executionDecision,
    agentBypassed,
  } = await resolveExecutionPlan(params, tokenIn, tokenOut);
  const pool = findPool(config, executedRouteId);
  const poolLabel = labelFromNumber(pool.label);

  const wallet = getSwapWallet();
  const signer = getSwapSigner();
  const recipient = params.recipient ? getAddress(params.recipient) : wallet.address;
  const provider = new JsonRpcProvider(getRpcUrl());

  const decIn = decimalsForSymbol(tokenIn);
  const decOut = decimalsForSymbol(tokenOut);
  const amountInRaw = toRawAmount(params.amountIn, decIn);
  const slippageEnforced = params.force === true;
  const slippageBps = slippageEnforced ? resolveSlippageBps(params) : 0;

  const balancesBefore = await getTokenBalances(recipient, config);

  const { reserveIn, reserveOut, token0 } = await readSwapReserves(
    provider,
    pool.pair,
    pool.tokenIn
  );
  const quotedOutRaw = getAmountOut(amountInRaw, reserveIn, reserveOut);
  if (quotedOutRaw <= 0n) {
    throw new SwapExecutionError("INSUFFICIENT_LIQUIDITY", "Quoted output is zero");
  }

  const routeQuote = await getChainRouteById(executedRouteId, {
    tokenIn,
    tokenOut,
    amountIn: params.amountIn,
  });
  const expectedOutHuman = routeQuote?.expectedOut ?? toHumanAmount(quotedOutRaw, decOut);
  const expectedOutRaw = toRawAmount(expectedOutHuman, decOut);

  let amountOutMinRaw: bigint;
  let amountOutMaxRaw: bigint;
  if (slippageEnforced) {
    ({ amountOutMinRaw, amountOutMaxRaw } = assertQuoteWithinSlippageBand(
      quotedOutRaw,
      expectedOutRaw,
      slippageBps,
      decOut
    ));
  } else {
    // Safe mode: Agent owns routing policy; router minOut=0 so only on-chain liquidity applies.
    amountOutMinRaw = 0n;
    amountOutMaxRaw = expectedOutRaw;
  }

  const routerAddress = getOptionalSwapRouterAddress();
  const payerIsUser = recipient.toLowerCase() !== wallet.address.toLowerCase();
  const useRouter =
    params.useRouter !== false &&
    Boolean(routerAddress) &&
    isAgentSigningConfigured() &&
    payerIsUser;

  addEvent({
    eventType: "ExecutionAttempted",
    routeId: executedRouteId,
    decision: agentDecision.decision,
    riskScore: agentDecision.riskScore,
    fallbackRouteId: agentDecision.fallbackRouteId ?? undefined,
    message: `Swap execution attempted through ${useRouter ? "router" : "direct"} mode`,
    context: {
      correlationId: params.correlationId,
      account: recipient,
      tokenIn,
      tokenOut,
      amountIn: params.amountIn,
      quotedOut: toHumanAmount(quotedOutRaw, decOut),
      expectedOut: expectedOutHuman,
      amountOutMin: slippageEnforced ? toHumanAmount(amountOutMinRaw, decOut) : undefined,
      amountOutMax: slippageEnforced ? toHumanAmount(amountOutMaxRaw, decOut) : undefined,
      slippageBps: slippageEnforced ? slippageBps : undefined,
      executionMode: useRouter ? "router" : "direct",
      safetyMode: params.force ? "force" : "safe",
      requestedRouteId,
      executedRouteId,
      pairAddress: pool.pair,
      poolLabel,
      configProfile: params.configProfile ?? "normal",
      flags: agentDecision.flags,
    },
  });

  let receipt: ContractTransactionReceipt | null;
  let executionMode: "router" | "direct" = "direct";
  let sdaMeta: Pick<
    SwapResult,
    | "sdaExecutionWindow"
    | "sdaWindowSeconds"
    | "sdaWaitedSeconds"
    | "sdaOpenTxHash"
    | "sdaReadyAt"
    | "quotedOutAtOpen"
  > = {};

  if (useRouter && routerAddress) {
    executionMode = "router";
    if (payerIsUser) {
      await assertUserCanPay(
        provider,
        recipient,
        pool.tokenIn,
        routerAddress,
        amountInRaw,
        tokenIn
      );
    }

    const router = new Contract(routerAddress, demoSwapRouterAbi, signer);

    if (poolLabel === "SDA" && agentBypassed) {
      const sdaResult = await executeSdaDelayedRouterSwap({
        router,
        provider,
        recipient,
        executedRouteId,
        amountInRaw,
        amountOutMinRaw,
        decOut,
        swapRequest: params,
        correlationId: params.correlationId,
      });
      receipt = sdaResult.receipt;
      sdaMeta = {
        sdaExecutionWindow: true,
        sdaWindowSeconds: SDA_EXECUTION_WINDOW_SECONDS,
        sdaWaitedSeconds: sdaResult.sdaWaitedSeconds,
        sdaOpenTxHash: sdaResult.sdaOpenTxHash,
        sdaReadyAt: sdaResult.sdaReadyAt,
        quotedOutAtOpen: sdaResult.quotedOutAtOpen,
      };
    } else {
      const permitDecision: Decision = {
        ...executionDecision,
        decision: "ALLOW" as DecisionType,
        routeId: executedRouteId,
      };
      const { permit, signature, routeIdBytes32 } = await signExecutionPermit({
        user: recipient,
        routeName: executedRouteId,
        amountInRaw,
        amountOutQuotedRaw: quotedOutRaw,
        deadline: defaultSwapDeadline(),
        decision: permitDecision,
      });

      const tx = await router.swapWithPermit(
        recipient,
        routeIdBytes32,
        amountInRaw,
        quotedOutRaw,
        amountOutMinRaw,
        Number(permit.deadline),
        Number(permit.riskScore),
        permit.decision,
        permit.nonce,
        signature,
        recipient
      );
      receipt = (await waitForReceipt(tx)) as ContractTransactionReceipt | null;
      if (!receipt) {
        throw new SwapExecutionError("SWAP_FAILED", "Router swap produced no receipt");
      }
      if (receipt.status === 0) {
        throw new SwapExecutionError("SWAP_REVERTED", "Router swap reverted on-chain", {
          txHash: receipt.hash,
          gasUsed: receipt.gasUsed.toString(),
        });
      }
    }
  } else {
    if (payerIsUser) {
      throw new SwapExecutionError(
        "USER_PAYER_REQUIRES_ROUTER",
        "User wallet swaps require DemoSwapRouter (approve token first)",
        { recipient, swapWallet: wallet.address }
      );
    }
    const scenarioDeployerAddr = await new Contract(config.registry, demoPoolRegistryAbi, provider)
      .deployer()
      .then((a: string) => getAddress(a));
    const deployerContract = new Contract(scenarioDeployerAddr, demoScenarioDeployerAbi, signer);
    const fundTx = await deployerContract.fundSwapper(pool.tokenIn, wallet.address, amountInRaw);
    await waitForReceipt(fundTx);

    const { reserveIn: rIn2, reserveOut: rOut2, token0: t0 } = await readSwapReserves(
      provider,
      pool.pair,
      pool.tokenIn
    );
    const freshQuotedOut = getAmountOut(amountInRaw, rIn2, rOut2);
    if (slippageEnforced && (freshQuotedOut < amountOutMinRaw || freshQuotedOut > amountOutMaxRaw)) {
      throw new SwapExecutionError(
        freshQuotedOut < amountOutMinRaw ? "SLIPPAGE_EXCEEDED" : "QUOTE_DEVIATION_EXCEEDED",
        freshQuotedOut < amountOutMinRaw
          ? "Output below minimum after re-quote"
          : "Output above maximum after re-quote",
        {
          quotedOut: toHumanAmount(freshQuotedOut, decOut),
          expectedOut: expectedOutHuman,
          amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
          amountOutMax: toHumanAmount(amountOutMaxRaw, decOut),
          slippageBps,
        }
      );
    }

    const amount0Out = pool.tokenOut.toLowerCase() === t0.toLowerCase() ? freshQuotedOut : 0n;
    const amount1Out = pool.tokenOut.toLowerCase() === t0.toLowerCase() ? 0n : freshQuotedOut;

    const tokenInContract = new Contract(pool.tokenIn, demoErc20Abi, signer);
    await waitForReceipt(await tokenInContract.transfer(pool.pair, amountInRaw));

    const pair = new Contract(pool.pair, demoPairAbi, signer);
    const swapTx = await pair.swap(amount0Out, amount1Out, recipient);
    receipt = (await waitForReceipt(swapTx)) as ContractTransactionReceipt | null;
    if (!receipt) {
      throw new SwapExecutionError("SWAP_FAILED", "Swap transaction produced no receipt");
    }
    if (receipt.status === 0) {
      throw new SwapExecutionError("SWAP_REVERTED", "Direct swap reverted on-chain", {
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
      });
    }
  }

  const balancesAfter = await getTokenBalances(recipient, config);
  const beforeOut = balancesBefore[tokenOut]?.human ?? 0;
  const afterOut = balancesAfter[tokenOut]?.human ?? 0;
  const beforeIn = balancesBefore[tokenIn]?.human ?? 0;
  const afterIn = balancesAfter[tokenIn]?.human ?? 0;
  const actualOutHuman = afterOut - beforeOut;
  const actualOutRaw = toRawAmount(actualOutHuman, decOut);

  const settlement = slippageEnforced
    ? validateOnChainSettlement(
        actualOutRaw,
        expectedOutRaw,
        amountOutMinRaw,
        amountOutMaxRaw,
        slippageBps,
        decOut
      )
    : validateSafeSettlement(actualOutRaw, decOut);

  return {
    success: settlement.ok,
    routeId: executedRouteId,
    requestedRouteId,
    executedRouteId,
    agentDecision: agentBypassed ? undefined : agentDecision.decision,
    agentBypassed,
    safetyMode: params.force ? "force" : "safe",
    poolLabel,
    executionMode,
    tokenIn,
    tokenOut,
    amountIn: params.amountIn,
    quotedOut: toHumanAmount(quotedOutRaw, decOut),
    expectedOut: expectedOutHuman,
    actualOut: actualOutHuman,
    amountOutMin: slippageEnforced ? toHumanAmount(amountOutMinRaw, decOut) : undefined,
    amountOutMax: slippageEnforced ? toHumanAmount(amountOutMaxRaw, decOut) : undefined,
    slippageBps: slippageEnforced ? slippageBps : undefined,
    failureCode: settlement.failureCode,
    failureMessage: settlement.failureMessage,
    recipient,
    pairAddress: pool.pair,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    balancesBefore,
    balancesAfter,
    balanceDelta: {
      [tokenIn]: afterIn - beforeIn,
      [tokenOut]: actualOutHuman,
    },
    ...sdaMeta,
  };
}

export async function executeAllDemoSwaps(
  amountIn = 1,
  recipient?: string,
  skipEvaluate = true
): Promise<{ passed: number; failed: number; results: SwapResult[]; errors: Array<{ routeId: string; error: string }> }> {
  const config = await getLiveDemoConfig();
  const results: SwapResult[] = [];
  const errors: Array<{ routeId: string; error: string }> = [];

  for (const pool of config.pools) {
    const correlationId = `batch-${Date.now()}-${pool.routeName}`;
    try {
      const parsed = parseRouteName(pool.routeName);
      if (!parsed) continue;
      const tokenIn = tokenSymbolFromKey(parsed.tokenInKey)!;
      const tokenOut = tokenSymbolFromKey(parsed.tokenOutKey)!;
      const exec = skipEvaluate ? executeForceSwap : executeSafeSwap;
      const result = await exec({
        routeId: pool.routeName,
        amountIn,
        tokenIn,
        tokenOut,
        recipient,
        correlationId,
      });
      results.push(result);
      addEvent({
        eventType: "SwapExecuted",
        routeId: result.executedRouteId ?? result.routeId,
        decision: result.agentDecision,
        message: `Batch swap ${result.tokenIn}→${result.tokenOut} mode=${result.executionMode} out=${result.actualOut}`,
        txHash: result.txHash,
        context: {
          correlationId,
          account: result.recipient,
          tokenIn: result.tokenIn,
          tokenOut: result.tokenOut,
          amountIn: result.amountIn,
          quotedOut: result.quotedOut,
          actualOut: result.actualOut,
          amountOutMin: result.amountOutMin,
          slippageBps: result.slippageBps,
          gasUsed: result.gasUsed,
          blockNumber: result.blockNumber,
          executionMode: result.executionMode,
          safetyMode: skipEvaluate ? "force" : "safe",
          requestedRouteId: result.requestedRouteId,
          executedRouteId: result.executedRouteId,
          pairAddress: result.pairAddress,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failure = classifySwapFailure(err);
      errors.push({
        routeId: pool.routeName,
        error: message,
      });
      addEvent({
        eventType: "SwapFailed",
        routeId: pool.routeName,
        message,
        context: {
          correlationId,
          amountIn,
          account: recipient,
          safetyMode: skipEvaluate ? "force" : "safe",
          requestedRouteId: pool.routeName,
          errorCode:
            err instanceof SwapExecutionError ? err.code : "SWAP_FAILED",
          ...failure,
        },
      });
    }
  }

  return {
    passed: results.length,
    failed: errors.length,
    results,
    errors,
  };
}

export function assertSwapConfigured(): void {
  try {
    getSwapWallet();
    getRpcUrl();
  } catch (err) {
    throw new ChainConfigurationError(
      err instanceof Error ? err.message : "Swap not configured"
    );
  }
}

export function isRouterSwapAvailable(): boolean {
  return Boolean(getOptionalSwapRouterAddress()) && isAgentSigningConfigured();
}

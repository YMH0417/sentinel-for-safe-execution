import {
  Contract,
  JsonRpcProvider,
  id,
  getAddress,
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
import {
  defaultSwapDeadline,
  isAgentSigningConfigured,
  signExecutionPermit,
} from "./agentSignService.js";
import { addEvent } from "./eventService.js";

/** Serialize on-chain swaps — shared wallet nonce must not race */
let swapChain = Promise.resolve();

function withSwapLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = swapChain.then(fn, fn);
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
    if (error.code === "SWAP_REJECTED_BY_AGENT") {
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

function applyMinOut(quotedOutRaw: bigint, slippageBps: number): bigint {
  return (quotedOutRaw * BigInt(10_000 - slippageBps)) / 10_000n;
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
  const pair = new Contract(pairAddress, demoPairAbi, provider);
  const token0 = (await pair.token0()) as string;
  const reserves = (await pair.getReserves()) as [bigint, bigint, number];
  const tokenInIsToken0 = token0.toLowerCase() === tokenInAddress.toLowerCase();
  return tokenInIsToken0
    ? { reserveIn: reserves[0], reserveOut: reserves[1], token0 }
    : { reserveIn: reserves[1], reserveOut: reserves[0], token0 };
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
}> {
  if (params.skipEvaluate || params.force) {
    const decision: Decision = {
      decision: "ALLOW",
      riskScore: 0,
      reason: params.force ? "Force swap (evaluate skipped)" : "Evaluate skipped",
      routeId: params.routeId,
      fallbackRouteId: null,
      flags: [],
    };
    return {
      executedRouteId: params.routeId,
      agentDecision: decision,
      executionDecision: decision,
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

  let executedRouteId = params.routeId;
  if (decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId) {
    executedRouteId = decision.fallbackRouteId;
    decision = await evaluateRoute(executedRouteId, params.configProfile ?? "normal", {
      tokenIn,
      tokenOut,
      amountIn: params.amountIn,
    });
    if (decision.decision === "REJECT") {
      throw new SwapExecutionError("SWAP_REJECTED_BY_AGENT", decision.reason, {
        decision,
        fallbackFrom: params.routeId,
      });
    }
    addEvent({
      eventType: "FallbackRequired",
      routeId: params.routeId,
      fallbackRouteId: executedRouteId,
      decision: "FALLBACK_TO_SAFE_ROUTE",
      riskScore: requestedDecision.riskScore,
      message: `Fallback to ${executedRouteId}`,
      context: {
        ...eventContext,
        executedRouteId,
        flags: requestedDecision.flags,
      },
    });
  }

  return {
    executedRouteId,
    agentDecision: requestedDecision,
    executionDecision: decision,
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
    const raw = (await token.balanceOf(holder)) as bigint;
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
  } = await resolveExecutionPlan(params, tokenIn, tokenOut);
  const pool = findPool(config, executedRouteId);

  const wallet = getSwapWallet();
  const signer = getSwapSigner();
  const recipient = params.recipient ? getAddress(params.recipient) : wallet.address;
  const provider = wallet.provider as JsonRpcProvider;

  const decIn = decimalsForSymbol(tokenIn);
  const decOut = decimalsForSymbol(tokenOut);
  const amountInRaw = toRawAmount(params.amountIn, decIn);
  const slippageBps = getMaxSlippageBps();

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
  const amountOutMinRaw = applyMinOut(quotedOutRaw, slippageBps);

  const routerAddress = getOptionalSwapRouterAddress();
  const payerIsUser = recipient.toLowerCase() !== wallet.address.toLowerCase();
  const useRouter =
    params.useRouter !== false &&
    Boolean(routerAddress) &&
    isAgentSigningConfigured() &&
    (!params.force || payerIsUser);

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
      amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
      slippageBps,
      executionMode: useRouter ? "router" : "direct",
      safetyMode: params.force ? "force" : "safe",
      requestedRouteId,
      executedRouteId,
      pairAddress: pool.pair,
      configProfile: params.configProfile ?? "normal",
      flags: agentDecision.flags,
    },
  });

  let receipt: ContractTransactionReceipt | null;
  let executionMode: "router" | "direct" = "direct";
  let actualOutRaw = quotedOutRaw;

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

    const router = new Contract(routerAddress, demoSwapRouterAbi, signer);
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
    receipt = (await tx.wait()) as ContractTransactionReceipt | null;
    if (!receipt) {
      throw new SwapExecutionError("SWAP_FAILED", "Router swap produced no receipt");
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
    await fundTx.wait();

    const { reserveIn: rIn2, reserveOut: rOut2, token0: t0 } = await readSwapReserves(
      provider,
      pool.pair,
      pool.tokenIn
    );
    const freshQuotedOut = getAmountOut(amountInRaw, rIn2, rOut2);
    const freshMinOut = applyMinOut(freshQuotedOut, slippageBps);
    if (freshQuotedOut < amountOutMinRaw) {
      throw new SwapExecutionError("SLIPPAGE_EXCEEDED", "Output below minimum after re-quote", {
        quotedOut: toHumanAmount(freshQuotedOut, decOut),
        amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
      });
    }

    actualOutRaw = freshQuotedOut;
    const amount0Out = pool.tokenOut.toLowerCase() === t0.toLowerCase() ? freshQuotedOut : 0n;
    const amount1Out = pool.tokenOut.toLowerCase() === t0.toLowerCase() ? 0n : freshQuotedOut;

    const tokenInContract = new Contract(pool.tokenIn, demoErc20Abi, signer);
    await (await tokenInContract.transfer(pool.pair, amountInRaw)).wait();

    const pair = new Contract(pool.pair, demoPairAbi, signer);
    const swapTx = await pair.swap(amount0Out, amount1Out, recipient);
    receipt = (await swapTx.wait()) as ContractTransactionReceipt | null;
    if (!receipt) {
      throw new SwapExecutionError("SWAP_FAILED", "Swap transaction produced no receipt");
    }
  }

  const balancesAfter = await getTokenBalances(recipient, config);
  const beforeOut = balancesBefore[tokenOut]?.human ?? 0;
  const afterOut = balancesAfter[tokenOut]?.human ?? 0;
  const beforeIn = balancesBefore[tokenIn]?.human ?? 0;
  const afterIn = balancesAfter[tokenIn]?.human ?? 0;

  return {
    success: true,
    routeId: executedRouteId,
    requestedRouteId,
    executedRouteId,
    agentDecision: agentDecision.decision,
    executionMode,
    tokenIn,
    tokenOut,
    amountIn: params.amountIn,
    quotedOut: toHumanAmount(quotedOutRaw, decOut),
    actualOut: afterOut - beforeOut,
    amountOutMin: toHumanAmount(amountOutMinRaw, decOut),
    slippageBps,
    recipient,
    pairAddress: pool.pair,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    balancesBefore,
    balancesAfter,
    balanceDelta: {
      [tokenIn]: afterIn - beforeIn,
      [tokenOut]: afterOut - beforeOut,
    },
  };
}

export async function executeAll36Swaps(
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

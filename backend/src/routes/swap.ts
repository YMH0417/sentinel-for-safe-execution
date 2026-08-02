import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";

import { isAddress, getAddress } from "ethers";

import { isDemoChainMode } from "../config/demoConfig.js";
import { loadRiskConfig } from "../services/agentService.js";
import { AgentSignError } from "../services/agentSignService.js";

import { getSwapWallet, ChainConfigurationError } from "../config/chainConfig.js";

import {

  assertSwapConfigured,

  executeAllDemoSwaps,

  executeForceSwap,

  executeSafeSwap,

  getTokenBalances,

  isRouterSwapAvailable,

  classifySwapFailure,

  SwapExecutionError,

  planWalletDemoSwap,

} from "../services/swapService.js";

import { addEvent } from "../services/eventService.js";

import type { SwapRequest } from "../types.js";



const router = Router();



function demoOnly(_req: Request, res: Response, next: () => void) {

  if (!isDemoChainMode()) {

    return res.status(404).json({ error: "Swap API requires demo chain mode" });

  }

  next();

}



router.use(demoOnly);



router.get("/wallet", (_req: Request, res: Response) => {

  try {

    assertSwapConfigured();

    const wallet = getSwapWallet();

    res.json({

      address: wallet.address,

      routerAvailable: isRouterSwapAvailable(),

      hint: "Default recipient when POST /api/swap omits recipient",

    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Swap wallet unavailable";

    res.status(503).json({ error: message });

  }

});



router.get("/balances/:address", async (req: Request, res: Response) => {

  const address = req.params.address;

  if (!isAddress(address)) {

    return res.status(400).json({ error: "Invalid Ethereum address" });

  }



  try {

    const balances = await getTokenBalances(getAddress(address));

    res.json({ address: getAddress(address), balances });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Balance query failed";

    res.status(503).json({ error: message });

  }

});



router.get("/balances", async (_req: Request, res: Response) => {

  try {

    const wallet = getSwapWallet();

    const balances = await getTokenBalances(wallet.address);

    res.json({ address: wallet.address, balances });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Balance query failed";

    res.status(503).json({ error: message });

  }

});



function parseSwapBody(
  body: Partial<SwapRequest>,
  safetyMode: "safe" | "force" = "safe"
): SwapRequest | { error: string } {

  if (!body.routeId) return { error: "routeId is required" };

  if (body.amountIn === undefined || Number(body.amountIn) <= 0) {

    return { error: "amountIn must be a positive number" };

  }

  if (body.recipient && !isAddress(body.recipient)) {

    return { error: "recipient must be a valid address" };

  }

  if (body.slippageBps !== undefined && safetyMode === "force") {
    const bps = Number(body.slippageBps);
    const configMax = loadRiskConfig().maxUnsafeSlippageBps ?? 10_000;
    if (!Number.isInteger(bps) || bps < 0 || bps > configMax) {
      return { error: `slippageBps must be an integer from 0 to ${configMax}` };
    }
  }

  return {

    routeId: body.routeId,

    amountIn: Number(body.amountIn),

    tokenIn: body.tokenIn,

    tokenOut: body.tokenOut,

    recipient: body.recipient ? getAddress(body.recipient) : undefined,

    skipEvaluate: body.skipEvaluate,

    configProfile: body.configProfile,

    useRouter: body.useRouter,

    slippageBps:
      safetyMode === "force" && body.slippageBps !== undefined
        ? Number(body.slippageBps)
        : undefined,

    force: safetyMode === "force" ? true : body.force,

  };

}



async function handleSwap(
  req: Request,
  res: Response,
  executor: (request: SwapRequest) => Promise<import("../types.js").SwapResult>,
  safetyMode: "safe" | "force"
) {

  const parsed = parseSwapBody(req.body as Partial<SwapRequest>, safetyMode);

  if ("error" in parsed) {

    return res.status(400).json({ error: parsed.error });

  }

  const correlationId = randomUUID();


  try {

    assertSwapConfigured();

    const result = await executor({ ...parsed, correlationId });

    addEvent({
      eventType: result.success ? "SwapExecuted" : "SwapFailed",
      routeId: result.executedRouteId ?? result.routeId,
      decision: result.agentDecision,
      message: result.success
        ? `Swap ${result.tokenIn}→${result.tokenOut} mode=${result.executionMode} out=${result.actualOut}`
        : result.failureMessage ?? `Swap settlement failed ${result.tokenIn}→${result.tokenOut}`,
      txHash: result.txHash,
      context: {
        correlationId,
        account: result.recipient,
        tokenIn: result.tokenIn,
        tokenOut: result.tokenOut,
        amountIn: result.amountIn,
        quotedOut: result.quotedOut,
        expectedOut: result.expectedOut,
        actualOut: result.actualOut,
        amountOutMin: result.amountOutMin,
        amountOutMax: result.amountOutMax,
        slippageBps: result.slippageBps,
        gasUsed: result.gasUsed,
        blockNumber: result.blockNumber,
        executionMode: result.executionMode,
        safetyMode,
        requestedRouteId: result.requestedRouteId,
        executedRouteId: result.executedRouteId,
        pairAddress: result.pairAddress,
        configProfile: parsed.configProfile ?? "normal",
        errorCode: result.failureCode,
        poolLabel: result.poolLabel,
        agentBypassed: result.agentBypassed,
      },
    });

    res.json(result);

  } catch (err) {
    const failure = classifySwapFailure(err);

    const errorCode =
      err instanceof SwapExecutionError
        ? err.code
        : err instanceof ChainConfigurationError
          ? err.name
          : "SWAP_FAILED";

    addEvent({

      eventType: "SwapFailed",

      routeId: parsed.routeId,

      message: err instanceof Error ? err.message : "Swap failed",

      context: {
        correlationId,
        tokenIn: parsed.tokenIn,
        tokenOut: parsed.tokenOut,
        amountIn: parsed.amountIn,
        account: parsed.recipient,
        safetyMode,
        requestedRouteId: parsed.routeId,
        configProfile: parsed.configProfile ?? "normal",
        errorCode,
        ...(err instanceof SwapExecutionError ? err.details : undefined),
        ...failure,
      },

    });



    if (err instanceof SwapExecutionError) {

      const status =
        err.code === "SWAP_REJECTED_BY_AGENT" || err.code === "SWAP_FALLBACK_REQUIRED"
          ? 422
          : err.code === "SLIPPAGE_EXCEEDED" || err.code === "QUOTE_DEVIATION_EXCEEDED"
            ? 409
            : 400;

      return res.status(status).json({

        error: { code: err.code, message: err.message, details: err.details },

      });

    }

    if (err instanceof ChainConfigurationError) {

      return res.status(503).json({ error: err.message });

    }

    const message = err instanceof Error ? err.message : "Swap failed";

    res.status(502).json({ error: message });

  }

}



router.post("/wallet/plan", async (req: Request, res: Response) => {
  const safetyMode: "safe" | "force" = req.body?.force === true ? "force" : "safe";
  const parsed = parseSwapBody(req.body as Partial<SwapRequest>, safetyMode);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }
  if (!parsed.recipient) {
    return res.status(400).json({ error: "recipient is required for wallet swap" });
  }

  try {
    const plan = await planWalletDemoSwap(parsed);
    res.json(plan);
  } catch (err) {
    if (err instanceof SwapExecutionError) {
      const status =
        err.code === "SWAP_REJECTED_BY_AGENT" || err.code === "SWAP_FALLBACK_REQUIRED"
          ? 422
          : err.code === "SLIPPAGE_EXCEEDED" || err.code === "QUOTE_DEVIATION_EXCEEDED"
            ? 409
            : err.code === "WALLET_SWAP_REQUIRES_AGENT" ||
                err.code === "WALLET_SWAP_AGENT_SIGN_UNAVAILABLE"
              ? 422
              : 400;
      return res.status(status).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    if (err instanceof AgentSignError) {
      return res.status(503).json({
        error: {
          code: "WALLET_SWAP_AGENT_SIGN_UNAVAILABLE",
          message: err.message,
        },
      });
    }
    const message = err instanceof Error ? err.message : "Wallet swap plan failed";
    res.status(502).json({ error: message });
  }
});

/** Default: evaluate + fallback + slippage; uses router one-tx when configured */

router.post("/safe", (req, res) =>
  handleSwap(req, res, executeSafeSwap, "safe")
);



/** Dev: bypass Agent (was skipEvaluate) */

router.post("/force", (req, res) =>
  handleSwap(req, res, executeForceSwap, "force")
);



/** Alias: safe swap is the default product path */

router.post("/", (req, res) =>
  handleSwap(req, res, executeSafeSwap, "safe")
);



router.post("/verify-all", async (req: Request, res: Response) => {

  const amountIn = req.body?.amountIn !== undefined ? Number(req.body.amountIn) : 1;

  const useSafe = req.body?.safe === true;

  const recipient =

    typeof req.body?.recipient === "string" && isAddress(req.body.recipient)

      ? getAddress(req.body.recipient)

      : undefined;



  if (amountIn <= 0) {

    return res.status(400).json({ error: "amountIn must be positive" });

  }



  try {

    assertSwapConfigured();

    const batch = await executeAllDemoSwaps(amountIn, recipient, !useSafe);



    addEvent({

      eventType: "SwapBatchCompleted",

      message: `${batch.passed + batch.failed}-route verify (${useSafe ? "safe" : "force"}): ${batch.passed} passed, ${batch.failed} failed`,

      context: {
        account: recipient ?? getSwapWallet().address,
        amountIn,
        safetyMode: useSafe ? "safe" : "force",
        batchPassed: batch.passed,
        batchFailed: batch.failed,
        batchTotal: batch.passed + batch.failed,
      },

    });



    res.json({

      passed: batch.passed,

      failed: batch.failed,

      total: batch.passed + batch.failed,

      amountIn,

      mode: useSafe ? "safe" : "force",

      recipient: recipient ?? getSwapWallet().address,

      routerAvailable: isRouterSwapAvailable(),

      results: batch.results.map((r) => ({

        routeId: r.executedRouteId ?? r.routeId,

        requestedRouteId: r.requestedRouteId,

        txHash: r.txHash,

        tokenIn: r.tokenIn,

        tokenOut: r.tokenOut,

        actualOut: r.actualOut,

        executionMode: r.executionMode,

      })),

      errors: batch.errors,

    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Batch swap failed";

    res.status(503).json({ error: message });

  }

});



export default router;

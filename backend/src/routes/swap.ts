import { Router, Request, Response } from "express";

import { isAddress, getAddress } from "ethers";

import { isDemoChainMode } from "../config/demoConfig.js";

import { getSwapWallet, ChainConfigurationError } from "../config/chainConfig.js";

import {

  assertSwapConfigured,

  executeAll36Swaps,

  executeForceSwap,

  executeSafeSwap,

  getTokenBalances,

  isRouterSwapAvailable,

  SwapExecutionError,

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



function parseSwapBody(body: Partial<SwapRequest>): SwapRequest | { error: string } {

  if (!body.routeId) return { error: "routeId is required" };

  if (body.amountIn === undefined || Number(body.amountIn) <= 0) {

    return { error: "amountIn must be a positive number" };

  }

  if (body.recipient && !isAddress(body.recipient)) {

    return { error: "recipient must be a valid address" };

  }

  return {

    routeId: body.routeId,

    amountIn: Number(body.amountIn),

    tokenIn: body.tokenIn,

    tokenOut: body.tokenOut,

    recipient: body.recipient ? getAddress(body.recipient) : undefined,

    skipEvaluate: body.skipEvaluate,

    force: body.force,

    configProfile: body.configProfile,

    useRouter: body.useRouter,

  };

}



async function handleSwap(req: Request, res: Response, executor: (r: SwapRequest) => Promise<import("../types.js").SwapResult>) {

  const parsed = parseSwapBody(req.body as Partial<SwapRequest>);

  if ("error" in parsed) {

    return res.status(400).json({ error: parsed.error });

  }



  try {

    assertSwapConfigured();

    const result = await executor(parsed);



    addEvent({

      eventType: "SwapExecuted",

      routeId: result.executedRouteId ?? result.routeId,

      message: `Swap ${result.tokenIn}→${result.tokenOut} mode=${result.executionMode} out=${result.actualOut}`,

      txHash: result.txHash,

    });



    res.json(result);

  } catch (err) {

    addEvent({

      eventType: "SwapFailed",

      routeId: parsed.routeId,

      message: err instanceof Error ? err.message : "Swap failed",

    });



    if (err instanceof SwapExecutionError) {

      const status =

        err.code === "SWAP_REJECTED_BY_AGENT" ? 422 : err.code === "SLIPPAGE_EXCEEDED" ? 409 : 400;

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



/** Default: evaluate + fallback + slippage; uses router one-tx when configured */

router.post("/safe", (req, res) => handleSwap(req, res, executeSafeSwap));



/** Dev: bypass Agent (was skipEvaluate) */

router.post("/force", (req, res) => handleSwap(req, res, executeForceSwap));



/** Alias: safe swap is the default product path */

router.post("/", (req, res) => handleSwap(req, res, executeSafeSwap));



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

    const batch = await executeAll36Swaps(amountIn, recipient, !useSafe);



    addEvent({

      eventType: "SwapBatchCompleted",

      message: `36-route verify (${useSafe ? "safe" : "force"}): ${batch.passed} passed, ${batch.failed} failed`,

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



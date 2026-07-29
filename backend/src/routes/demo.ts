import { Router, Request, Response } from "express";
import { Contract, JsonRpcProvider } from "ethers";
import { isDemoChainMode } from "../config/demoConfig.js";
import { decimalsForSymbol } from "../config/demoRoutes.js";
import { demoPoolRegistryAbi } from "../abi/demoAbis.js";
import { getRpcUrl, getOptionalSwapRouterAddress } from "../config/chainConfig.js";
import { getLiveDemoConfig } from "../services/demoRegistryService.js";
import type { DemoTokenSymbol } from "../config/demoConfig.js";

const router = Router();

const TOKEN_META: Record<
  DemoTokenSymbol,
  { name: string; riskTag: "NONE" | "HIGH" | "BAIT" }
> = {
  USDC: { name: "USD Coin", riskTag: "NONE" },
  GOOD: { name: "Good Token", riskTag: "NONE" },
  BAD: { name: "Bad Token", riskTag: "HIGH" },
  BAIT: { name: "Bait Token", riskTag: "BAIT" },
};

router.get("/tokens", async (_req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Demo endpoints require demo chain mode" });
  }

  try {
    const config = await getLiveDemoConfig();
    const provider = new JsonRpcProvider(getRpcUrl());
    const registry = new Contract(config.registry, demoPoolRegistryAbi, provider);

    const symbols = Object.keys(config.tokens) as DemoTokenSymbol[];
    const tokens = await Promise.all(
      symbols.map(async (symbol) => {
        const address = config.tokens[symbol]!;
        const onChainTag = Number(await registry.tokenRiskTag(address));
        const meta = TOKEN_META[symbol];
        return {
          symbol,
          name: meta.name,
          address,
          decimals: decimalsForSymbol(symbol),
          riskTag: meta.riskTag,
          registryRiskTag: onChainTag,
        };
      })
    );

    res.json({ tokens, priceRatio: "USDC:GOOD:BAD:BAIT = 1:20:100:1" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tokens";
    res.status(503).json({ error: message });
  }
});

router.get("/pools", async (_req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Demo endpoints require demo chain mode" });
  }

  try {
    const config = await getLiveDemoConfig();
    const provider = new JsonRpcProvider(getRpcUrl());
    const registry = new Contract(config.registry, demoPoolRegistryAbi, provider);
    const [poolCount, isSealed] = await Promise.all([
      registry.poolCount() as Promise<bigint>,
      registry.isSealed() as Promise<boolean>,
    ]);

    const addressToSymbol = new Map<string, DemoTokenSymbol>();
    for (const [symbol, address] of Object.entries(config.tokens)) {
      if (address) addressToSymbol.set(address.toLowerCase(), symbol as DemoTokenSymbol);
    }

    const pools = config.pools.map((pool) => ({
      routeId: pool.routeName,
      routeName: pool.routeName,
      pair: pool.pair,
      tokenIn: addressToSymbol.get(pool.tokenIn.toLowerCase()) ?? pool.tokenIn,
      tokenOut: addressToSymbol.get(pool.tokenOut.toLowerCase()) ?? pool.tokenOut,
      tokenInAddress: pool.tokenIn,
      tokenOutAddress: pool.tokenOut,
      label: pool.label,
      poolLabel: pool.label === 0 ? "SAFE" : pool.label === 1 ? "SHALLOW" : "TOXIC",
      isReferencePool: pool.isReferencePool,
    }));

    res.json({
      registry: config.registry,
      poolCount: Number(poolCount),
      isSealed,
      pools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pools";
    res.status(503).json({ error: message });
  }
});

router.get("/status", async (_req: Request, res: Response) => {
  if (!isDemoChainMode()) {
    return res.status(404).json({ error: "Demo endpoints require demo chain mode" });
  }

  try {
    const config = await getLiveDemoConfig();
    const { getSwapWallet } = await import("../config/chainConfig.js");
    const { assertSwapConfigured } = await import("../services/swapService.js");

    let swapReady = false;
    let swapWallet: string | null = null;
    try {
      assertSwapConfigured();
      swapWallet = getSwapWallet().address;
      swapReady = true;
    } catch {
      swapReady = false;
    }

    res.json({
      registry: config.registry,
      poolCount: config.pools.length,
      tokens: config.tokens,
      swapRouter: getOptionalSwapRouterAddress() ?? null,
      priceRatio: "USDC:GOOD:BAD:BAIT = 1:20:100:1",
      swapReady,
      swapWallet,
      swapEndpoints: [
        "POST /api/swap",
        "POST /api/swap/verify-all",
        "GET /api/swap/wallet",
        "GET /api/swap/balances",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load demo status";
    res.status(503).json({ error: message });
  }
});

export default router;

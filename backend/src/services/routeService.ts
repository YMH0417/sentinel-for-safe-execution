// backend/src/services/routeService.ts

import { fileURLToPath } from "url";
import { Route, QuoteResponse } from "../types.js";
import * as path from "path";
import * as fs from "fs";
import { isDemoChainMode } from "../config/demoConfig.js";
import {
  getChainQuote,
  getChainRouteById,
  inferQuoteParamsFromRouteId,
  QuoteParams,
} from "./chainQuoteService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFilePath = path.join(__dirname, "../../../shared/demo-data/routes.json");

function getMockRoutes(tokenIn?: string, tokenOut?: string, amount?: number): QuoteResponse {
  const raw = fs.readFileSync(routesFilePath, "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };

  let filtered = data.routes;
  if (tokenIn) {
    filtered = filtered.filter((r) => r.tokenIn.toLowerCase() === tokenIn.toLowerCase());
  }
  if (tokenOut) {
    filtered = filtered.filter((r) => r.tokenOut.toLowerCase() === tokenOut.toLowerCase());
  }

  return {
    tokenIn: tokenIn || "USDT",
    tokenOut: tokenOut || "USDC",
    amountIn: amount || 1000,
    routes: filtered,
  };
}

export async function getRoutes(
  tokenIn?: string,
  tokenOut?: string,
  amount?: number
): Promise<QuoteResponse> {
  if (isDemoChainMode()) {
    return getChainQuote({ tokenIn, tokenOut, amountIn: amount });
  }
  return getMockRoutes(tokenIn, tokenOut, amount);
}

export async function getRouteById(
  routeId: string,
  params: QuoteParams = {}
): Promise<Route | undefined> {
  if (isDemoChainMode()) {
    const quoteParams = inferQuoteParamsFromRouteId(routeId, params);
    return getChainRouteById(routeId, quoteParams);
  }

  const raw = fs.readFileSync(routesFilePath, "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };
  return data.routes.find((r) => r.routeId === routeId);
}

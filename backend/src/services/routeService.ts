// backend/src/services/routeService.ts — Dev C: 市场模拟 / Mock Route
// 从 shared/demo-data/routes.json 读取 route 数据

import { fileURLToPath } from "url";
import { Route, QuoteResponse } from "../types.js";
import * as path from "path";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFilePath = path.join(__dirname, "../../../shared/demo-data/routes.json");

export function getRoutes(tokenIn?: string, tokenOut?: string, amount?: number): QuoteResponse {
  const raw = fs.readFileSync(routesFilePath, "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };

  let filtered = data.routes;
  if (tokenIn) {
    filtered = filtered.filter(r => r.tokenIn.toLowerCase() === tokenIn.toLowerCase());
  }
  if (tokenOut) {
    filtered = filtered.filter(r => r.tokenOut.toLowerCase() === tokenOut.toLowerCase());
  }

  return {
    tokenIn: tokenIn || "USDT",
    tokenOut: tokenOut || "USDC",
    amountIn: amount || 1000,
    routes: filtered,
  };
}

export function getRouteById(routeId: string): Route | undefined {
  const raw = fs.readFileSync(routesFilePath, "utf-8");
  const data = JSON.parse(raw) as { routes: Route[] };
  return data.routes.find(r => r.routeId === routeId);
}

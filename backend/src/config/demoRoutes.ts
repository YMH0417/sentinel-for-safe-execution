import { id } from "ethers";
import type { DemoTokenSymbol } from "./demoConfig.js";

export const DEMO_TOKEN_KEYS = ["usdc", "good", "bad", "bait"] as const;
export const DEMO_POOL_KEYS = ["safe", "shallow", "toxic"] as const;

export type DemoTokenKey = (typeof DEMO_TOKEN_KEYS)[number];
export type DemoPoolKey = (typeof DEMO_POOL_KEYS)[number];

export interface ParsedRouteName {
  tokenInKey: DemoTokenKey;
  tokenOutKey: DemoTokenKey;
  poolKey: DemoPoolKey;
}

const TOKEN_KEY_TO_SYMBOL: Record<DemoTokenKey, DemoTokenSymbol> = {
  usdc: "USDC",
  good: "GOOD",
  bad: "BAD",
  bait: "BAIT",
};

const SYMBOL_TO_TOKEN_KEY: Record<DemoTokenSymbol, DemoTokenKey> = {
  USDC: "usdc",
  GOOD: "good",
  BAD: "bad",
  BAIT: "bait",
};

export function tokenSymbolFromKey(tokenKey: string): DemoTokenSymbol | undefined {
  return TOKEN_KEY_TO_SYMBOL[tokenKey.toLowerCase() as DemoTokenKey];
}

export function tokenKeyFromSymbol(symbol: DemoTokenSymbol): DemoTokenKey {
  return SYMBOL_TO_TOKEN_KEY[symbol];
}

export function decimalsForSymbol(symbol: DemoTokenSymbol): number {
  return symbol === "USDC" ? 6 : 18;
}

export function buildRouteName(
  tokenInKey: DemoTokenKey,
  tokenOutKey: DemoTokenKey,
  poolKey: DemoPoolKey
): string {
  return `route-${tokenInKey}-${tokenOutKey}-${poolKey}`;
}

export function parseRouteName(routeName: string): ParsedRouteName | null {
  const match = routeName.match(
    /^route-(usdc|good|bad|bait)-(usdc|good|bad|bait)-(safe|shallow|toxic)$/i
  );
  if (!match) return null;
  const tokenInKey = match[1].toLowerCase() as DemoTokenKey;
  const tokenOutKey = match[2].toLowerCase() as DemoTokenKey;
  if (tokenInKey === tokenOutKey) return null;
  return {
    tokenInKey,
    tokenOutKey,
    poolKey: match[3].toLowerCase() as DemoPoolKey,
  };
}

export function buildSafeRouteName(tokenInKey: DemoTokenKey, tokenOutKey: DemoTokenKey): string {
  return buildRouteName(tokenInKey, tokenOutKey, "safe");
}

export function generateAllRouteNames(): string[] {
  const names: string[] = [];
  for (const tokenInKey of DEMO_TOKEN_KEYS) {
    for (const tokenOutKey of DEMO_TOKEN_KEYS) {
      if (tokenInKey === tokenOutKey) continue;
      for (const poolKey of DEMO_POOL_KEYS) {
        names.push(buildRouteName(tokenInKey, tokenOutKey, poolKey));
      }
    }
  }
  return names;
}

let routeIdToNameMap: Map<string, string> | null = null;

export function getRouteIdToNameMap(): Map<string, string> {
  if (!routeIdToNameMap) {
    routeIdToNameMap = new Map();
    for (const name of generateAllRouteNames()) {
      routeIdToNameMap.set(id(name), name);
    }
  }
  return routeIdToNameMap;
}

export function routeNameFromRouteId(routeId: string): string {
  const normalized = routeId.startsWith("0x") ? routeId : id(routeId);
  return getRouteIdToNameMap().get(normalized) ?? routeId;
}

import { parseRouteName, tokenSymbolFromKey } from "./demoRoutes.js";

/**
 * Safe swap auto-switches to same-pair SAFE route when Agent returns FALLBACK.
 * Applies to all SHALLOW pools; tokenOut BAD/BAIT never reach FALLBACK (hard REJECT).
 */
export function supportsAgentAutoFallback(routeId: string): boolean {
  const parsed = parseRouteName(routeId.trim());
  if (!parsed || parsed.poolKey !== "shallow") return false;
  const tokenOut = tokenSymbolFromKey(parsed.tokenOutKey);
  if (tokenOut === "BAD" || tokenOut === "BAIT") return false;
  return true;
}

const ROUTE_NAME_RE =
  /^route-(usdc|good|bad|bait)-(usdc|good|bad|bait)-(safe|shallow|toxic|sda)$/i;

const BLOCKED_TOKEN_OUT = new Set(["bad", "bait"]);

/**
 * Safe swap auto-switches to same-pair SAFE when Agent returns FALLBACK.
 * All SHALLOW routes except tokenOut BAD/BAIT.
 */
export function supportsAgentAutoFallback(routeId: string): boolean {
  const match = routeId.trim().match(ROUTE_NAME_RE);
  if (!match) return false;
  const tokenIn = match[1].toLowerCase();
  const tokenOut = match[2].toLowerCase();
  const pool = match[3].toLowerCase();
  if (tokenIn === tokenOut || pool !== "shallow") return false;
  if (BLOCKED_TOKEN_OUT.has(tokenOut)) return false;
  return true;
}

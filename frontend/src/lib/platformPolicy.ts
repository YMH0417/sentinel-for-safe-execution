import type { PlatformPolicy } from "../api/client";

export const PLATFORM_POLICY_STORAGE_KEY = "sentinel:platform-policy";

export const DEFAULT_PLATFORM_POLICY: PlatformPolicy = {
  multisigSimEnabled: false,
  blockBadToken: false,
};

export interface PlatformPolicyBlock {
  reason: string;
  flag: "bad_token_blocked";
}

export function readPlatformPolicyFromStorage(): PlatformPolicy | null {
  try {
    const raw = localStorage.getItem(PLATFORM_POLICY_STORAGE_KEY);
    if (!raw) return null;
    return normalizePlatformPolicy(JSON.parse(raw) as Partial<PlatformPolicy>);
  } catch {
    return null;
  }
}

export function writePlatformPolicyToStorage(policy: PlatformPolicy): void {
  try {
    localStorage.setItem(PLATFORM_POLICY_STORAGE_KEY, JSON.stringify(policy));
    window.dispatchEvent(new CustomEvent("sentinel:platform-policy:change"));
  } catch {
    /* private mode / quota */
  }
}

export function normalizePlatformPolicy(
  raw: Partial<PlatformPolicy> | null | undefined
): PlatformPolicy {
  const multisigSimEnabled = Boolean(raw?.multisigSimEnabled);
  return {
    multisigSimEnabled,
    blockBadToken: multisigSimEnabled && Boolean(raw?.blockBadToken),
  };
}

function blockedBadTokenSymbol(tokenIn: string, tokenOut: string): string | null {
  if (tokenIn.toUpperCase() === "BAD") return "BAD";
  if (tokenOut.toUpperCase() === "BAD") return "BAD";
  return null;
}

export function checkPlatformPolicyBlock(
  policy: PlatformPolicy | null | undefined,
  ctx: {
    tokenIn: string;
    tokenOut: string;
  }
): PlatformPolicyBlock | null {
  const active = normalizePlatformPolicy(policy ?? undefined);
  if (!active.multisigSimEnabled || !active.blockBadToken) return null;

  const symbol = blockedBadTokenSymbol(ctx.tokenIn, ctx.tokenOut);
  if (!symbol) return null;

  return {
    flag: "bad_token_blocked",
    reason: `${symbol} 代币已锁定多签，无法转出。`,
  };
}

export function policyContextFromRoute(
  route: import("../types").Route | undefined,
  tokenIn: string,
  tokenOut: string
) {
  return {
    tokenIn: route?.tokenIn ?? tokenIn,
    tokenOut: route?.tokenOut ?? tokenOut,
  };
}

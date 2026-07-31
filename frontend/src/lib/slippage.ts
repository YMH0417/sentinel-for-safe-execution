export function computeMinOut(expectedOut: number, slippageBps: number): number {
  return expectedOut * (1 - slippageBps / 10_000);
}

export function computeMaxOut(expectedOut: number, slippageBps: number): number {
  return expectedOut * (1 + slippageBps / 10_000);
}

export type SlippageViolationCode = "SLIPPAGE_EXCEEDED" | "QUOTE_DEVIATION_EXCEEDED";

export function checkSlippageBand(
  quotedOut: number,
  expectedOut: number,
  slippageBps: number
): {
  code: SlippageViolationCode;
  amountOutMin: number;
  amountOutMax: number;
} | null {
  const amountOutMin = computeMinOut(expectedOut, slippageBps);
  const amountOutMax = computeMaxOut(expectedOut, slippageBps);
  if (quotedOut < amountOutMin) {
    return { code: "SLIPPAGE_EXCEEDED", amountOutMin, amountOutMax };
  }
  if (quotedOut > amountOutMax) {
    return { code: "QUOTE_DEVIATION_EXCEEDED", amountOutMin, amountOutMax };
  }
  return null;
}

export function formatSlippagePercent(slippageBps: number): string {
  return `${(slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 0 : 1)}%`;
}

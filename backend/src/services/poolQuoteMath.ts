const FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;

export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return 0n;
  }
  const amountInWithFee = amountIn * FEE_NUMERATOR;
  return (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
}

export function getSpotPriceHuman(
  reserveIn: bigint,
  reserveOut: bigint,
  decIn: number,
  decOut: number
): number {
  if (reserveIn === 0n) return 0;
  const scaleIn = 10 ** decIn;
  const scaleOut = 10 ** decOut;
  return Number(reserveOut * BigInt(scaleIn)) / Number(reserveIn * BigInt(scaleOut));
}

export function getPriceImpactBps(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  const actualOut = getAmountOut(amountIn, reserveIn, reserveOut);
  const spotOut = (amountIn * reserveOut) / reserveIn;
  if (spotOut <= actualOut) return 0;
  return Number(((spotOut - actualOut) * 10_000n) / spotOut);
}

export function toHumanAmount(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export function toRawAmount(human: number, decimals: number): bigint {
  return BigInt(Math.round(human * 10 ** decimals));
}

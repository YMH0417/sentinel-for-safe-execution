/** Badge tier thresholds — kept in sync with SentinelLedger.sol */
export const BADGE_TIER_COUNT = 5;

export const VOLUME_10K = 10_000;
export const VOLUME_50K = 50_000;
export const VOLUME_100K = 100_000;
export const VOLUME_1M = 1_000_000;

export interface UserLedgerStats {
  checkCount: number;
  tradeCount: number;
  safeTradeCount: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
}

/** checkCount = number of trades that passed Agent/Vault gate (not standalone Agent API calls). */
export function evaluateBadgeFlags(stats: UserLedgerStats): number {
  let flags = 0;
  const { checkCount, tradeCount, usdcVolumeHuman: vol } = stats;

  if (checkCount >= 1) flags |= 1 << 0; // 开张：第一笔 Safe 放行成交
  if (vol >= VOLUME_10K && checkCount >= 3) flags |= 1 << 1;
  if (vol >= VOLUME_50K && checkCount >= 5) flags |= 1 << 2;
  if (vol >= VOLUME_100K && checkCount >= 10) flags |= 1 << 3;
  if (vol >= VOLUME_1M && checkCount >= 10) flags |= 1 << 4;

  return flags;
}

export function decodeBadgeTiers(badgeFlags: number): { tier: number; unlocked: boolean }[] {
  const tiers: { tier: number; unlocked: boolean }[] = [];
  for (let tier = 0; tier < BADGE_TIER_COUNT; tier++) {
    tiers.push({ tier, unlocked: (badgeFlags & (1 << tier)) !== 0 });
  }
  return tiers;
}

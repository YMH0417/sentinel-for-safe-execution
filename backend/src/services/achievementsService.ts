import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { sentinelAchievementsAbi, BADGE_TIER_COUNT } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

export interface OnChainBadgeTier {
  tier: number;
  unlocked: boolean;
}

export interface OnChainAchievements {
  address: string;
  achievementsContract: string;
  checkCount: number;
  safeSwapCount: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
  badges: OnChainBadgeTier[];
}

export function decodeBadgeTiers(badgeFlags: number): OnChainBadgeTier[] {
  const tiers: OnChainBadgeTier[] = [];
  for (let tier = 0; tier < BADGE_TIER_COUNT; tier++) {
    tiers.push({
      tier,
      unlocked: (badgeFlags & (1 << tier)) !== 0,
    });
  }
  return tiers;
}

export async function getOnChainAchievements(holderInput: string): Promise<OnChainAchievements> {
  const holder = getAddress(holderInput);
  const config = await getLiveDemoConfig();
  const achievementsAddress = config.achievements;
  if (!achievementsAddress) {
    throw new Error("Achievements contract not configured in deployment manifest");
  }

  const provider = new JsonRpcProvider(getRpcUrl());
  const contract = new Contract(achievementsAddress, sentinelAchievementsAbi, provider);
  const stats = await withRpcRetry(
    () => contract.stats(holder) as Promise<[bigint, bigint, bigint, number]>
  );
  const usdcVolume = stats[0];
  const checkCount = Number(stats[1]);
  const safeSwapCount = Number(stats[2]);
  const badgeFlags = Number(stats[3]);

  return {
    address: holder,
    achievementsContract: achievementsAddress,
    checkCount,
    safeSwapCount,
    usdcVolumeHuman: Number(usdcVolume) / 1e6,
    badgeFlags,
    badges: decodeBadgeTiers(badgeFlags),
  };
}

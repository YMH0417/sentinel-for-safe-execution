import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { sentinelLedgerAbi, BADGE_TIER_COUNT } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { loadDemoConfig } from "../config/demoConfig.js";
import { withRpcRetry } from "../utils/rpcRetry.js";
import { decodeBadgeTiers } from "./ledgerBadgeRules.js";
import { getLedgerAchievementsView } from "./tradeLedgerService.js";

export interface OnChainBadgeTier {
  tier: number;
  unlocked: boolean;
}

export interface OnChainAchievements {
  address: string;
  source: "local" | "postgres" | "chain";
  achievementsContract: string | null;
  checkCount: number;
  safeSwapCount: number;
  tradeCount?: number;
  usdcVolumeHuman: number;
  badgeFlags: number;
  badges: OnChainBadgeTier[];
}

export { decodeBadgeTiers };

/** Product badges read local DB by default (JSON → Neon on Vercel). */
export function useLocalLedger(): boolean {
  const source = process.env.SENTINEL_LEDGER_SOURCE?.trim().toLowerCase();
  if (source === "local") return true;
  if (source === "chain") return false;
  return true;
}

async function getOnChainLedgerAchievements(holderInput: string): Promise<OnChainAchievements> {
  const holder = getAddress(holderInput);
  const config = loadDemoConfig();
  const ledgerAddress = config.ledger;
  if (!ledgerAddress) {
    throw new Error("Ledger contract not configured in deployment manifest");
  }

  const provider = new JsonRpcProvider(getRpcUrl());
  const contract = new Contract(ledgerAddress, sentinelLedgerAbi, provider);
  const stats = await withRpcRetry(
    () => contract.stats(holder) as Promise<[bigint, bigint, bigint, bigint, number]>
  );
  const usdcVolume = stats[0];
  const checkCount = Number(stats[1]);
  const tradeCount = Number(stats[2]);
  const safeSwapCount = Number(stats[3]);
  const badgeFlags = Number(stats[4]);

  return {
    address: holder,
    source: "chain",
    achievementsContract: ledgerAddress,
    checkCount,
    safeSwapCount,
    tradeCount,
    usdcVolumeHuman: Number(usdcVolume) / 1e6,
    badgeFlags,
    badges: decodeBadgeTiers(badgeFlags),
  };
}

export async function getUserAchievements(holderInput: string): Promise<OnChainAchievements> {
  if (useLocalLedger()) {
    return getLedgerAchievementsView(holderInput);
  }

  try {
    return await getOnChainLedgerAchievements(holderInput);
  } catch {
    return getLedgerAchievementsView(holderInput);
  }
}

/** @deprecated Use getUserAchievements */
export async function getOnChainAchievements(holderInput: string): Promise<OnChainAchievements> {
  return getUserAchievements(holderInput);
}

export { BADGE_TIER_COUNT };

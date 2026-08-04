import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress } from "ethers";
import {
  api,
  computeSecurityScore,
  computeUserStats,
  type PoolVolumeReport,
  type TokenBalance,
} from "../api/client";
import type { Event } from "../types";

const CACHE_TTL_MS = 45_000;
const SLOW_FETCH_MS = 6_000;

interface DashboardSnapshot {
  events: Event[];
  poolVolume: PoolVolumeReport | null;
  balances: Record<string, TokenBalance>;
  score: number;
  usdcVolumeHuman: number;
  account: string | null;
  fetchedAt: number;
}

let memoryCache: DashboardSnapshot | null = null;

function readCache(account: string | null): DashboardSnapshot | null {
  if (!memoryCache) return null;
  if (Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS) return null;
  if (memoryCache.account !== account) {
    return {
      ...memoryCache,
      balances: {},
      usdcVolumeHuman: 0,
      account,
    };
  }
  return memoryCache;
}

function writeCache(snapshot: DashboardSnapshot) {
  memoryCache = snapshot;
}

function resolveChecksumAccount(account: string | null): string | null {
  if (!account) return null;
  try {
    return getAddress(account);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function useDashboardData(account: string | null) {
  const cached = readCache(account);
  const [events, setEvents] = useState<Event[]>(cached?.events ?? []);
  const [poolVolume, setPoolVolume] = useState<PoolVolumeReport | null>(cached?.poolVolume ?? null);
  const [balances, setBalances] = useState<Record<string, TokenBalance>>(cached?.balances ?? {});
  const [score, setScore] = useState(cached?.score ?? 85);
  const [usdcVolumeHuman, setUsdcVolumeHuman] = useState(cached?.usdcVolumeHuman ?? 0);
  const [refreshing, setRefreshing] = useState(false);
  const [poolVolumePending, setPoolVolumePending] = useState(!cached?.poolVolume);
  const requestId = useRef(0);

  const applySnapshot = useCallback(
    (
      ev: Event[],
      pv: PoolVolumeReport | null,
      bal: Record<string, TokenBalance>,
      volumeHuman: number
    ) => {
      const nextScore = computeSecurityScore(ev);
      setEvents(ev);
      setPoolVolume(pv);
      setBalances(bal);
      setUsdcVolumeHuman(volumeHuman);
      setScore(nextScore);
      writeCache({
        events: ev,
        poolVolume: pv,
        balances: bal,
        score: nextScore,
        usdcVolumeHuman: volumeHuman,
        account,
        fetchedAt: Date.now(),
      });
    },
    [account]
  );

  const loadSlowData = useCallback(
    async (
      id: number,
      checksumAccount: string | null,
      ev: Event[],
      fallback: {
        poolVolume: PoolVolumeReport | null;
        balances: Record<string, TokenBalance>;
        usdcVolumeHuman: number;
      }
    ) => {
      const [pv, bal, volumeHuman] = await Promise.all([
        withTimeout(api.poolVolume().catch(() => null), SLOW_FETCH_MS, fallback.poolVolume),
        checksumAccount
          ? withTimeout(
              api
                .balances(checksumAccount)
                .then((r) => r.balances)
                .catch(() => fallback.balances),
              SLOW_FETCH_MS,
              fallback.balances
            )
          : Promise.resolve(fallback.balances),
        checksumAccount
          ? withTimeout(
              api
                .demoAchievements(checksumAccount)
                .then((view) => view.usdcVolumeHuman)
                .catch(() => null),
              SLOW_FETCH_MS,
              null
            )
          : Promise.resolve<number | null>(null),
      ]);

      if (id !== requestId.current) return;

      const resolvedVolume =
        volumeHuman != null ? volumeHuman : computeUserStats(ev, account).safeVolumeUsd;
      applySnapshot(ev, pv ?? fallback.poolVolume, bal, resolvedVolume);
      setPoolVolumePending(false);
    },
    [account, applySnapshot]
  );

  const loadData = useCallback(
    async (opts?: { background?: boolean }) => {
      const id = ++requestId.current;
      const showOverlay = !opts?.background;
      if (showOverlay) setRefreshing(true);

      const checksumAccount = resolveChecksumAccount(account);
      const fallback = {
        poolVolume: memoryCache?.poolVolume ?? null,
        balances: memoryCache?.balances ?? {},
        usdcVolumeHuman: memoryCache?.usdcVolumeHuman ?? 0,
      };

      let latestEvents = memoryCache?.events ?? [];

      try {
        const ev = await api.events().catch(() => [] as Event[]);
        if (id !== requestId.current) return;

        latestEvents = ev;
        applySnapshot(
          ev,
          fallback.poolVolume,
          fallback.balances,
          fallback.usdcVolumeHuman
        );
      } finally {
        if (id === requestId.current && showOverlay) {
          setRefreshing(false);
        }
      }

      void loadSlowData(id, checksumAccount, latestEvents, fallback);
    },
    [account, applySnapshot, loadSlowData]
  );

  useEffect(() => {
    const hit = readCache(account);
    if (hit) {
      setEvents(hit.events);
      setPoolVolume(hit.poolVolume);
      setBalances(hit.balances);
      setScore(hit.score);
      setUsdcVolumeHuman(hit.usdcVolumeHuman);
      setPoolVolumePending(!hit.poolVolume);
      void loadData({ background: true });
      return;
    }

    setPoolVolumePending(true);
    void loadData({ background: false });
  }, [account, loadData]);

  const refresh = useCallback(async () => {
    await loadData({ background: false });
  }, [loadData]);

  return {
    events,
    poolVolume,
    balances,
    score,
    usdcVolumeHuman,
    refreshing,
    poolVolumePending,
    refresh,
  };
}

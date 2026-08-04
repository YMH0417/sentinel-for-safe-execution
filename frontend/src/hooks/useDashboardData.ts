import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress } from "ethers";
import {
  api,
  computeSecurityScore,
  computeUserStats,
  type DebugStatus,
  type PoolVolumeReport,
  type PoolsHealthReport,
  type TokenBalance,
} from "../api/client";
import type { Event } from "../types";

const CACHE_TTL_MS = 45_000;
const SLOW_FETCH_MS = 6_000;

interface DashboardSnapshot {
  events: Event[];
  pools: PoolsHealthReport | null;
  poolVolume: PoolVolumeReport | null;
  status: DebugStatus | null;
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
  const [pools, setPools] = useState<PoolsHealthReport | null>(cached?.pools ?? null);
  const [poolVolume, setPoolVolume] = useState<PoolVolumeReport | null>(cached?.poolVolume ?? null);
  const [status, setStatus] = useState<DebugStatus | null>(cached?.status ?? null);
  const [balances, setBalances] = useState<Record<string, TokenBalance>>(cached?.balances ?? {});
  const [score, setScore] = useState(cached?.score ?? 85);
  const [usdcVolumeHuman, setUsdcVolumeHuman] = useState(cached?.usdcVolumeHuman ?? 0);
  const [refreshing, setRefreshing] = useState(false);
  const [poolsPending, setPoolsPending] = useState(!cached?.pools);
  const [poolVolumePending, setPoolVolumePending] = useState(!cached?.poolVolume);
  const requestId = useRef(0);

  const applySnapshot = useCallback(
    (
      ev: Event[],
      ph: PoolsHealthReport | null,
      pv: PoolVolumeReport | null,
      st: DebugStatus | null,
      bal: Record<string, TokenBalance>,
      volumeHuman: number
    ) => {
      setEvents(ev);
      setPools(ph);
      setPoolVolume(pv);
      setStatus(st);
      setBalances(bal);
      setUsdcVolumeHuman(volumeHuman);
      setScore(computeSecurityScore(ev, ph ?? undefined));
      writeCache({
        events: ev,
        pools: ph,
        poolVolume: pv,
        status: st,
        balances: bal,
        score: computeSecurityScore(ev, ph ?? undefined),
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
        pools: PoolsHealthReport | null;
        poolVolume: PoolVolumeReport | null;
        status: DebugStatus | null;
        balances: Record<string, TokenBalance>;
        usdcVolumeHuman: number;
      }
    ) => {
      const [ph, pv, bal, volumeHuman] = await Promise.all([
        withTimeout(api.poolsHealth().catch(() => null), SLOW_FETCH_MS, fallback.pools),
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
      applySnapshot(ev, ph ?? fallback.pools, pv ?? fallback.poolVolume, fallback.status, bal, resolvedVolume);
      setPoolsPending(false);
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
        pools: memoryCache?.pools ?? null,
        poolVolume: memoryCache?.poolVolume ?? null,
        status: memoryCache?.status ?? null,
        balances: memoryCache?.balances ?? {},
        usdcVolumeHuman: memoryCache?.usdcVolumeHuman ?? 0,
      };

      let latestEvents = memoryCache?.events ?? [];

      try {
        const [[ev, st], phHint] = await Promise.all([
          Promise.all([
            api.events().catch(() => [] as Event[]),
            api.debugStatus().catch(() => fallback.status),
          ]),
          withTimeout(api.poolsHealth().catch(() => null), 2_500, fallback.pools),
        ]);

        if (id !== requestId.current) return;

        latestEvents = ev;
        applySnapshot(
          ev,
          phHint,
          fallback.poolVolume,
          st,
          fallback.balances,
          fallback.usdcVolumeHuman
        );
      } finally {
        if (id === requestId.current && showOverlay) {
          setRefreshing(false);
        }
      }

      void loadSlowData(id, checksumAccount, latestEvents, {
        ...fallback,
        status: memoryCache?.status ?? fallback.status,
      });
    },
    [account, applySnapshot, loadSlowData]
  );

  useEffect(() => {
    const hit = readCache(account);
    if (hit) {
      setEvents(hit.events);
      setPools(hit.pools);
      setPoolVolume(hit.poolVolume);
      setStatus(hit.status);
      setBalances(hit.balances);
      setScore(hit.score);
      setUsdcVolumeHuman(hit.usdcVolumeHuman);
      setPoolsPending(!hit.pools);
      setPoolVolumePending(!hit.poolVolume);
      void loadData({ background: true });
      return;
    }

    setPoolsPending(true);
    setPoolVolumePending(true);
    void loadData({ background: false });
  }, [account, loadData]);

  const refresh = useCallback(async () => {
    await loadData({ background: false });
  }, [loadData]);

  return {
    events,
    pools,
    poolVolume,
    status,
    balances,
    score,
    usdcVolumeHuman,
    refreshing,
    poolsPending,
    poolVolumePending,
    refresh,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress } from "ethers";
import {
  api,
  computeSecurityScore,
  type DebugStatus,
  type PoolsHealthReport,
  type TokenBalance,
} from "../api/client";
import type { Event } from "../types";

const CACHE_TTL_MS = 45_000;

interface DashboardSnapshot {
  events: Event[];
  pools: PoolsHealthReport | null;
  status: DebugStatus | null;
  balances: Record<string, TokenBalance>;
  score: number;
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
      account,
    };
  }
  return memoryCache;
}

function writeCache(snapshot: DashboardSnapshot) {
  memoryCache = snapshot;
}

export function useDashboardData(account: string | null) {
  const cached = readCache(account);
  const [events, setEvents] = useState<Event[]>(cached?.events ?? []);
  const [pools, setPools] = useState<PoolsHealthReport | null>(cached?.pools ?? null);
  const [status, setStatus] = useState<DebugStatus | null>(cached?.status ?? null);
  const [balances, setBalances] = useState<Record<string, TokenBalance>>(cached?.balances ?? {});
  const [score, setScore] = useState(cached?.score ?? 85);
  const [refreshing, setRefreshing] = useState(false);
  const [poolsPending, setPoolsPending] = useState(!cached?.pools);
  const requestId = useRef(0);

  const applySnapshot = useCallback(
    (ev: Event[], ph: PoolsHealthReport | null, st: DebugStatus | null, bal: Record<string, TokenBalance>) => {
      setEvents(ev);
      setPools(ph);
      setStatus(st);
      setBalances(bal);
      setScore(computeSecurityScore(ev, ph ?? undefined));
      writeCache({
        events: ev,
        pools: ph,
        status: st,
        balances: bal,
        score: computeSecurityScore(ev, ph ?? undefined),
        account,
        fetchedAt: Date.now(),
      });
    },
    [account]
  );

  const loadData = useCallback(
    async (opts?: { background?: boolean; forceRefresh?: boolean }) => {
      const id = ++requestId.current;
      if (!opts?.background) setRefreshing(true);

      const fast = Promise.all([
        api.events().catch(() => [] as Event[]),
        api.debugStatus().catch(() => null),
      ]);

      const slowPools = api.poolsHealth({ force: opts?.forceRefresh }).catch(() => null);
      const slowBalances = account
        ? api.balances(getAddress(account)).then((r) => r.balances).catch(() => ({} as Record<string, TokenBalance>))
        : Promise.resolve({} as Record<string, TokenBalance>);

      try {
        const [[ev, st], ph, bal] = await Promise.all([fast, slowPools, slowBalances]);
        if (id !== requestId.current) return;
        applySnapshot(ev, ph, st, bal);
        setPoolsPending(false);
      } finally {
        if (id === requestId.current) {
          setRefreshing(false);
        }
      }
    },
    [account, applySnapshot]
  );

  useEffect(() => {
    const hit = readCache(account);
    if (hit) {
      setEvents(hit.events);
      setPools(hit.pools);
      setStatus(hit.status);
      setBalances(hit.balances);
      setScore(hit.score);
      setPoolsPending(!hit.pools);
      void loadData({ background: true });
      return;
    }

    setPoolsPending(true);
    void loadData({ background: false });
  }, [account, loadData]);

  const refresh = useCallback(async () => {
    memoryCache = null;
    await loadData({ background: false, forceRefresh: true });
  }, [loadData]);

  return {
    events,
    pools,
    status,
    balances,
    score,
    refreshing,
    poolsPending,
    refresh,
  };
}

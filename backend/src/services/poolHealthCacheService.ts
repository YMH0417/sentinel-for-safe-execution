import { isDemoChainMode } from "../config/demoConfig.js";
import { getPoolsHealth, type PoolsHealthReport } from "./poolHealthService.js";

const TTL_MS = Number(process.env.POOLS_HEALTH_CACHE_TTL_MS) || 60_000;
const STALE_SERVE_MS = TTL_MS * 10;

export interface PoolsHealthCacheMeta {
  ready: boolean;
  warming: boolean;
  cachedAt: string | null;
  ageMs: number | null;
  ttlMs: number;
  error: string | null;
}

interface CacheState {
  data: PoolsHealthReport | null;
  fetchedAt: number;
  error: string | null;
  warming: boolean;
}

const state: CacheState = {
  data: null,
  fetchedAt: 0,
  error: null,
  warming: false,
};

let inflight: Promise<PoolsHealthReport> | null = null;

export function getPoolsHealthCacheMeta(): PoolsHealthCacheMeta {
  const ageMs = state.fetchedAt > 0 ? Date.now() - state.fetchedAt : null;
  return {
    ready: Boolean(state.data),
    warming: state.warming,
    cachedAt: state.data?.checkedAt ?? null,
    ageMs,
    ttlMs: TTL_MS,
    error: state.error,
  };
}

async function fetchFresh(): Promise<PoolsHealthReport> {
  if (inflight) return inflight;

  state.warming = true;
  inflight = getPoolsHealth()
    .then((data) => {
      state.data = data;
      state.fetchedAt = Date.now();
      state.error = null;
      return data;
    })
    .catch((err: unknown) => {
      state.error = err instanceof Error ? err.message : String(err);
      throw err;
    })
    .finally(() => {
      state.warming = false;
      inflight = null;
    });

  return inflight;
}

function scheduleBackgroundRefresh(): void {
  if (state.warming || inflight) return;
  void fetchFresh().catch(() => undefined);
}

export async function getCachedPoolsHealth(opts?: { force?: boolean }): Promise<PoolsHealthReport> {
  if (!isDemoChainMode()) {
    throw new Error("pools-health requires demo chain mode");
  }

  const age = Date.now() - state.fetchedAt;
  const isFresh = Boolean(state.data && age < TTL_MS);

  if (isFresh && !opts?.force) {
    return state.data!;
  }

  const canServeStale = Boolean(state.data && age < STALE_SERVE_MS);
  if (canServeStale && !opts?.force) {
    scheduleBackgroundRefresh();
    return state.data!;
  }

  if (state.data && state.warming && !opts?.force) {
    return state.data;
  }

  return fetchFresh();
}

export async function warmPoolsHealthCache(maxRetries = 8): Promise<boolean> {
  if (!isDemoChainMode()) {
    return false;
  }

  if (state.data && Date.now() - state.fetchedAt < TTL_MS) {
    return true;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const report = await fetchFresh();
      console.log(`  Pools health cache ready (${report.poolCount} pools, ${report.healthy} healthy)`);
      return true;
    } catch {
      const delayMs = Math.min(1500 * (attempt + 1), 8000);
      if (attempt < maxRetries - 1) {
        console.warn(`  Pools health warm-up retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.warn("  Pools health cache warm-up failed (API will retry on first request)");
  return false;
}

export function invalidatePoolsHealthCache(): void {
  state.fetchedAt = 0;
  state.error = null;
}

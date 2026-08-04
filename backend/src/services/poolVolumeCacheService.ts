import { isDemoChainMode } from "../config/demoConfig.js";
import {
  getPoolVolumeFromChain,
  getPoolVolumeFromLedger,
  resolvePoolVolumeSource,
  buildEmptyPoolVolumeReport,
  type PoolVolumeReport,
} from "./poolVolumeService.js";
const TTL_MS = Number(process.env.POOL_VOLUME_CACHE_TTL_MS) || 60_000;
const POLL_MS = Number(process.env.POOL_VOLUME_POLL_MS) || 60_000;
const STALE_SERVE_MS = TTL_MS * 10;

export interface PoolVolumeCacheMeta {
  ready: boolean;
  warming: boolean;
  cachedAt: string | null;
  ageMs: number | null;
  ttlMs: number;
  pollMs: number;
  error: string | null;
}

interface CacheState {
  data: PoolVolumeReport | null;
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

let inflight: Promise<PoolVolumeReport> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getPoolVolumeCacheMeta(): PoolVolumeCacheMeta {
  const ageMs = state.fetchedAt > 0 ? Date.now() - state.fetchedAt : null;
  return {
    ready: Boolean(state.data),
    warming: state.warming,
    cachedAt: state.data?.checkedAt ?? null,
    ageMs,
    ttlMs: TTL_MS,
    pollMs: POLL_MS,
    error: state.error,
  };
}

async function fetchFresh(): Promise<PoolVolumeReport> {
  if (inflight) return inflight;

  state.warming = true;
  const fetcher =
    resolvePoolVolumeSource() === "chain" ? getPoolVolumeFromChain : getPoolVolumeFromLedger;
  inflight = fetcher()
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

export function schedulePoolVolumeBackgroundRefresh(): void {
  scheduleBackgroundRefresh();
}

export async function getCachedPoolVolume(opts?: { force?: boolean }): Promise<PoolVolumeReport> {
  if (!isDemoChainMode()) {
    throw new Error("pool-volume requires demo chain mode");
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

  if (!state.data) {
    scheduleBackgroundRefresh();
    return buildEmptyPoolVolumeReport();
  }

  try {
    return await fetchFresh();
  } catch {
    if (state.data) return state.data;
    return buildEmptyPoolVolumeReport();
  }
}

export async function warmPoolVolumeCache(maxRetries = 3): Promise<boolean> {
  if (!isDemoChainMode()) {
    return false;
  }

  if (state.data && Date.now() - state.fetchedAt < TTL_MS) {
    return true;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const report = await fetchFresh();
      console.log(
        `  Pool volume cache ready (${report.eventsUsed}/${report.maxEvents} swaps indexed)`
      );
      return true;
    } catch {
      const delayMs = Math.min(2000 * (attempt + 1), 8000);
      if (attempt < maxRetries - 1) {
        console.warn(`  Pool volume warm-up retry ${attempt + 1}/${maxRetries} in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.warn("  Pool volume cache warm-up failed (API will retry on first request)");
  return false;
}

export function startPoolVolumePolling(): void {
  if (!isDemoChainMode() || pollTimer) return;

  pollTimer = setInterval(() => {
    void fetchFresh().catch(() => undefined);
  }, POLL_MS);

  if (typeof pollTimer.unref === "function") {
    pollTimer.unref();
  }
}

export function invalidatePoolVolumeCache(): void {
  state.fetchedAt = 0;
  state.error = null;
}

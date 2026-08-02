function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    message?: string;
    info?: { error?: { code?: number; message?: string } };
  };
  const code = e.info?.error?.code;
  const msg = `${e.message ?? ""} ${e.info?.error?.message ?? ""}`.toLowerCase();
  return code === -32011 || msg.includes("15/sec") || msg.includes("rate limit");
}

/** Retry eth_call bursts when public RPC enforces requests/sec limits. */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw new Error("withRpcRetry exhausted attempts");
}

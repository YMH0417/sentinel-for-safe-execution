import type { JsonRpcProvider } from "ethers";

/** Must match DemoSwapRouter.SDA_EXECUTION_WINDOW */
export const SDA_EXECUTION_WINDOW_SECONDS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mineBlock(provider: JsonRpcProvider): Promise<void> {
  await provider.send("evm_mine", []);
}

async function increaseTime(provider: JsonRpcProvider, seconds: number): Promise<void> {
  await provider.send("evm_increaseTime", [seconds]);
  await mineBlock(provider);
}

async function latestTimestamp(provider: JsonRpcProvider): Promise<bigint> {
  const block = await provider.getBlock("latest");
  return BigInt(block?.timestamp ?? 0);
}

/**
 * Wait until chain timestamp >= readyAt.
 * @param wallClockWait When true (user-facing Unsafe SDA), sleep ~15s real time while mining.
 * @param fastForward When true (verify-all batch), jump time with evm_increaseTime only.
 */
export async function waitForSdaExecutionWindow(
  provider: JsonRpcProvider,
  readyAt: bigint,
  options: { wallClockWait: boolean; fastForward?: boolean }
): Promise<{ waitedSeconds: number }> {
  const start = Date.now();

  if (options.fastForward) {
    const now = await latestTimestamp(provider);
    if (now < readyAt) {
      await increaseTime(provider, Number(readyAt - now));
    }
    return { waitedSeconds: 0 };
  }

  if (options.wallClockWait) {
    for (let i = 0; i < SDA_EXECUTION_WINDOW_SECONDS; i++) {
      await sleep(1000);
      await mineBlock(provider);
    }
  }

  let now = await latestTimestamp(provider);
  while (now < readyAt) {
    const delta = Number(readyAt - now);
    await increaseTime(provider, Math.max(1, delta));
    now = await latestTimestamp(provider);
  }

  return { waitedSeconds: Math.round((Date.now() - start) / 1000) };
}

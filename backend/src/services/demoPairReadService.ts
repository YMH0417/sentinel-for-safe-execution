import { Contract, JsonRpcProvider } from "ethers";
import { demoPairAbi } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRemoteDemoRpc(): boolean {
  const rpc = getRpcUrl().toLowerCase();
  return !rpc.includes("127.0.0.1") && !rpc.includes("localhost");
}

/** Small gap between sequential pair reads on public RPC (Monad ~15 req/s). */
export async function remoteRpcPace(): Promise<void> {
  if (isRemoteDemoRpc()) {
    await sleep(80);
  }
}

export async function readSwapReserves(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenInAddress: string
): Promise<{ reserveIn: bigint; reserveOut: bigint; token0: string; token1: string }> {
  const pair = new Contract(pairAddress, demoPairAbi, provider);
  const token0 = await withRpcRetry(() => pair.token0() as Promise<string>);
  const token1 = await withRpcRetry(() => pair.token1() as Promise<string>);
  const reserves = await withRpcRetry(
    () => pair.getReserves() as Promise<[bigint, bigint, number]>
  );
  const tokenInIsToken0 = token0.toLowerCase() === tokenInAddress.toLowerCase();
  return tokenInIsToken0
    ? { reserveIn: reserves[0], reserveOut: reserves[1], token0, token1 }
    : { reserveIn: reserves[1], reserveOut: reserves[0], token0, token1 };
}

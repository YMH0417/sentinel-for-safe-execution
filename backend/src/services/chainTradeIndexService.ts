/**
 * Global recent on-chain trade index (router + direct pair swaps).
 * Shared by pool-volume dashboard and ledger bootstrap.
 */
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Log,
  id as eventId,
  getAddress,
} from "ethers";
import { demoPairAbi, demoSwapRouterAbi } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import {
  type DemoDeploymentConfig,
  type DemoPoolLabel,
  getTokenAddress,
  type DemoTokenSymbol,
} from "../config/demoConfig.js";
import {
  decimalsForSymbol,
  parseRouteName,
  routeNameFromRouteId,
  tokenKeyFromSymbol,
  buildSafeRouteName,
  type DemoTokenKey,
} from "../config/demoRoutes.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { readSwapReserves } from "./demoPairReadService.js";
import { getAmountOut, toHumanAmount } from "./poolQuoteMath.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

export const MAX_RECENT_CHAIN_TRADES = 100;

const BLOCK_CHUNK = 99;
const MAX_BLOCK_SPAN = 50_000;
const MAX_LOG_CHUNKS = 400;
const EMPTY_CHUNK_STOP = 30;
const LOG_PACE_MS = Number(process.env.POOL_VOLUME_LOG_PACE_MS) || 200;

const ROUTER_SWAP_TOPIC = eventId(
  "RouterSwapExecuted(bytes32,address,address,uint256,uint256)"
);
const SDA_COMPLETE_TOPIC = eventId(
  "SdaExecutionWindowCompleted(bytes32,bytes32,address,uint256,uint256,uint256)"
);
const PAIR_SWAP_TOPIC = eventId("Swap(address,uint256,uint256,uint256,uint256,address)");

const routerIface = new Interface(demoSwapRouterAbi);
const pairIface = new Interface(demoPairAbi);

export type ChainTradeKind = "router" | "sda" | "direct";

export interface IndexedChainTrade {
  kind: ChainTradeKind;
  routeId: string;
  routeName: string;
  poolLabel: DemoPoolLabel;
  pairAddress: string;
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol: DemoTokenSymbol;
  tokenOutSymbol: DemoTokenSymbol;
  amountIn: bigint;
  amountOut: bigint;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  user: string;
  /** Safe router swap — passed Agent/Vault gate in same tx */
  passedCheck: boolean;
}

function logPace(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LOG_PACE_MS));
}

function poolLabelForRoute(routeName: string): DemoPoolLabel {
  const parsed = parseRouteName(routeName);
  if (!parsed) return "SAFE";
  const key = parsed.poolKey.toUpperCase();
  if (key === "SHALLOW" || key === "TOXIC" || key === "SDA") return key;
  return "SAFE";
}

function tokenSymbolForAddress(
  config: DemoDeploymentConfig,
  address: string
): DemoTokenSymbol | undefined {
  const needle = address.toLowerCase();
  for (const sym of ["USDC", "GOOD", "BAD", "BAIT"] as DemoTokenSymbol[]) {
    const addr = config.tokens[sym];
    if (addr && addr.toLowerCase() === needle) return sym;
  }
  return undefined;
}

async function fetchRouterLogsBackward(
  provider: JsonRpcProvider,
  routerAddress: string,
  toBlock: number,
  minLogs: number
): Promise<Log[]> {
  const logs: Log[] = [];
  let end = toBlock;
  const minBlock = Math.max(0, toBlock - MAX_BLOCK_SPAN);
  let chunks = 0;
  let emptyStreak = 0;

  while (end > minBlock && chunks < MAX_LOG_CHUNKS && logs.length < minLogs) {
    const from = Math.max(minBlock, end - BLOCK_CHUNK + 1);
    const chunk = await withRpcRetry(() =>
      provider.getLogs({
        address: routerAddress,
        topics: [[ROUTER_SWAP_TOPIC, SDA_COMPLETE_TOPIC]],
        fromBlock: from,
        toBlock: end,
      })
    );
    logs.push(...chunk);
    chunks += 1;
    if (chunk.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= EMPTY_CHUNK_STOP) break;
    } else {
      emptyStreak = 0;
    }
    await logPace();
    end = from - 1;
  }
  return logs;
}

async function fetchPairLogsBackward(
  provider: JsonRpcProvider,
  pairAddresses: string[],
  toBlock: number,
  minLogs: number
): Promise<Log[]> {
  if (pairAddresses.length === 0) return [];
  const logs: Log[] = [];
  let end = toBlock;
  const minBlock = Math.max(0, toBlock - MAX_BLOCK_SPAN);
  let chunks = 0;
  let emptyStreak = 0;

  while (end > minBlock && chunks < MAX_LOG_CHUNKS && logs.length < minLogs) {
    const from = Math.max(minBlock, end - BLOCK_CHUNK + 1);
    const chunk = await withRpcRetry(() =>
      provider.getLogs({
        address: pairAddresses,
        topics: [PAIR_SWAP_TOPIC],
        fromBlock: from,
        toBlock: end,
      })
    );
    logs.push(...chunk);
    chunks += 1;
    if (chunk.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= EMPTY_CHUNK_STOP) break;
    } else {
      emptyStreak = 0;
    }
    await logPace();
    end = from - 1;
  }
  return logs;
}

async function amountInFromSdaTx(
  provider: JsonRpcProvider,
  txHash: string,
  pairAddress: string,
  tokenIn: string
): Promise<{ amountIn: bigint; amountOut: bigint } | null> {
  const receipt = await withRpcRetry(() => provider.getTransactionReceipt(txHash));
  if (!receipt) return null;
  await logPace();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== pairAddress.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== PAIR_SWAP_TOPIC.toLowerCase()) continue;
    try {
      const parsed = pairIface.parseLog(log);
      if (!parsed || parsed.name !== "Swap") continue;
      const amount0In = parsed.args.amount0In as bigint;
      const amount1In = parsed.args.amount1In as bigint;
      const amount0Out = parsed.args.amount0Out as bigint;
      const amount1Out = parsed.args.amount1Out as bigint;
      const pair = new Contract(pairAddress, demoPairAbi, provider);
      const token0 = (await withRpcRetry(() => pair.token0() as Promise<string>)).toLowerCase();
      const tokenInIs0 = token0 === tokenIn.toLowerCase();
      return {
        amountIn: tokenInIs0 ? amount0In : amount1In,
        amountOut: tokenInIs0 ? amount1Out : amount0Out,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function decodeRouterTrades(
  logs: Log[],
  config: DemoDeploymentConfig,
  poolByRoute: Map<string, DemoDeploymentConfig["pools"][0]>
): IndexedChainTrade[] {
  const out: IndexedChainTrade[] = [];
  for (const log of logs) {
    const topic = log.topics[0]?.toLowerCase();
    if (topic === ROUTER_SWAP_TOPIC.toLowerCase()) {
      try {
        const parsed = routerIface.parseLog(log);
        if (!parsed || parsed.name !== "RouterSwapExecuted") continue;
        const routeId = parsed.args.routeId as string;
        const recipient = getAddress(parsed.args.recipient as string);
        const routeName = routeNameFromRouteId(routeId);
        const pool = poolByRoute.get(routeName);
        if (!pool) continue;
        const tokenInSym = tokenSymbolForAddress(config, pool.tokenIn);
        const tokenOutSym = tokenSymbolForAddress(config, pool.tokenOut);
        if (!tokenInSym || !tokenOutSym) continue;
        out.push({
          kind: "router",
          routeId,
          routeName,
          poolLabel: poolLabelForRoute(routeName),
          pairAddress: pool.pair,
          tokenIn: pool.tokenIn,
          tokenOut: pool.tokenOut,
          tokenInSymbol: tokenInSym,
          tokenOutSymbol: tokenOutSym,
          amountIn: parsed.args.amountIn as bigint,
          amountOut: parsed.args.amountOut as bigint,
          blockNumber: log.blockNumber,
          logIndex: log.index,
          txHash: log.transactionHash,
          user: recipient,
          passedCheck: true,
        });
      } catch {
        continue;
      }
    } else if (topic === SDA_COMPLETE_TOPIC.toLowerCase()) {
      try {
        const parsed = routerIface.parseLog(log);
        if (!parsed || parsed.name !== "SdaExecutionWindowCompleted") continue;
        const routeId = parsed.args.routeId as string;
        const recipient = getAddress(parsed.args.recipient as string);
        const routeName = routeNameFromRouteId(routeId);
        const pool = poolByRoute.get(routeName);
        if (!pool) continue;
        const tokenInSym = tokenSymbolForAddress(config, pool.tokenIn);
        const tokenOutSym = tokenSymbolForAddress(config, pool.tokenOut);
        if (!tokenInSym || !tokenOutSym) continue;
        out.push({
          kind: "sda",
          routeId,
          routeName,
          poolLabel: "SDA",
          pairAddress: pool.pair,
          tokenIn: pool.tokenIn,
          tokenOut: pool.tokenOut,
          tokenInSymbol: tokenInSym,
          tokenOutSymbol: tokenOutSym,
          amountIn: 0n,
          amountOut: parsed.args.amountOut as bigint,
          blockNumber: log.blockNumber,
          logIndex: log.index,
          txHash: log.transactionHash,
          user: recipient,
          passedCheck: false,
        });
      } catch {
        continue;
      }
    }
  }
  return out;
}

async function decodeDirectPairTrades(
  provider: JsonRpcProvider,
  logs: Log[],
  config: DemoDeploymentConfig,
  poolByPair: Map<string, DemoDeploymentConfig["pools"][0]>,
  routerTxHashes: Set<string>,
  walletFilter?: string
): Promise<IndexedChainTrade[]> {
  const out: IndexedChainTrade[] = [];
  const txFromCache = new Map<string, string>();

  for (const log of logs) {
    if (routerTxHashes.has(log.transactionHash.toLowerCase())) continue;
    const pool = poolByPair.get(getAddress(log.address));
    if (!pool) continue;

    let txFrom = txFromCache.get(log.transactionHash);
    if (!txFrom) {
      const tx = await withRpcRetry(() => provider.getTransaction(log.transactionHash));
      if (!tx?.from) continue;
      txFrom = getAddress(tx.from);
      txFromCache.set(log.transactionHash, txFrom);
      await logPace();
    }
    if (walletFilter && txFrom.toLowerCase() !== walletFilter.toLowerCase()) continue;

    try {
      const parsed = pairIface.parseLog(log);
      if (!parsed || parsed.name !== "Swap") continue;
      const amount0In = parsed.args.amount0In as bigint;
      const amount1In = parsed.args.amount1In as bigint;
      const amount0Out = parsed.args.amount0Out as bigint;
      const amount1Out = parsed.args.amount1Out as bigint;
      const pair = new Contract(pool.pair, demoPairAbi, provider);
      const token0 = (await withRpcRetry(() => pair.token0() as Promise<string>)).toLowerCase();
      const tokenInIs0 = token0 === pool.tokenIn.toLowerCase();
      const amountIn = tokenInIs0 ? amount0In : amount1In;
      const amountOut = tokenInIs0 ? amount1Out : amount0Out;
      if (amountIn === 0n) continue;

      const tokenInSym = tokenSymbolForAddress(config, pool.tokenIn);
      const tokenOutSym = tokenSymbolForAddress(config, pool.tokenOut);
      if (!tokenInSym || !tokenOutSym) continue;

      out.push({
        kind: "direct",
        routeId: "",
        routeName: pool.routeName,
        poolLabel: poolLabelForRoute(pool.routeName),
        pairAddress: pool.pair,
        tokenIn: pool.tokenIn,
        tokenOut: pool.tokenOut,
        tokenInSymbol: tokenInSym,
        tokenOutSymbol: tokenOutSym,
        amountIn,
        amountOut,
        blockNumber: log.blockNumber,
        logIndex: log.index,
        txHash: log.transactionHash,
        user: txFrom,
        passedCheck: false,
      });
    } catch {
      continue;
    }
  }
  return out;
}

function sortTradesDesc(trades: IndexedChainTrade[]): IndexedChainTrade[] {
  return [...trades].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });
}

export async function fetchRecentGlobalChainTrades(
  limit = MAX_RECENT_CHAIN_TRADES
): Promise<{ trades: IndexedChainTrade[]; scannedToBlock: number; scannedFromBlock: number }> {
  const config = await getLiveDemoConfig();
  if (!config.swapRouter) {
    throw new Error("swapRouter missing in demo config");
  }

  const provider = new JsonRpcProvider(getRpcUrl());
  const routerAddress = getAddress(config.swapRouter);
  const pairAddresses = [...new Set(config.pools.map((p) => getAddress(p.pair)))];
  const poolByRoute = new Map(config.pools.map((p) => [p.routeName, p]));
  const poolByPair = new Map(config.pools.map((p) => [getAddress(p.pair), p]));

  const toBlock = await withRpcRetry(() => provider.getBlockNumber());
  const minLogs = limit * 3;

  const [routerLogs, pairLogs] = await Promise.all([
    fetchRouterLogsBackward(provider, routerAddress, toBlock, minLogs),
    fetchPairLogsBackward(provider, pairAddresses, toBlock, minLogs),
  ]);

  const routerTrades = decodeRouterTrades(routerLogs, config, poolByRoute);
  const routerTxSet = new Set(routerTrades.map((t) => t.txHash.toLowerCase()));
  const directTrades = await decodeDirectPairTrades(
    provider,
    pairLogs,
    config,
    poolByPair,
    routerTxSet
  );

  const merged = sortTradesDesc([...routerTrades, ...directTrades]).slice(0, limit);

  const sdaTxCache = new Map<string, { amountIn: bigint; amountOut: bigint } | null>();
  for (const trade of merged) {
    if (trade.kind !== "sda" || trade.amountIn !== 0n) continue;
    const pool = poolByRoute.get(trade.routeName);
    if (!pool) continue;
    let cached = sdaTxCache.get(trade.txHash);
    if (cached === undefined) {
      cached = await amountInFromSdaTx(provider, trade.txHash, pool.pair, pool.tokenIn);
      sdaTxCache.set(trade.txHash, cached);
    }
    if (cached) {
      trade.amountIn = cached.amountIn;
      trade.amountOut = cached.amountOut;
    }
  }

  const scannedFromBlock = Math.max(0, toBlock - MAX_BLOCK_SPAN);
  return { trades: merged, scannedToBlock: toBlock, scannedFromBlock };
}

export async function fetchWalletChainTrades(walletInput: string): Promise<IndexedChainTrade[]> {
  const wallet = getAddress(walletInput);
  const config = await getLiveDemoConfig();
  if (!config.swapRouter) throw new Error("swapRouter missing");

  const provider = new JsonRpcProvider(getRpcUrl());
  const routerAddress = getAddress(config.swapRouter);
  const pairAddresses = [...new Set(config.pools.map((p) => getAddress(p.pair)))];
  const poolByRoute = new Map(config.pools.map((p) => [p.routeName, p]));
  const poolByPair = new Map(config.pools.map((p) => [getAddress(p.pair), p]));

  const toBlock = await withRpcRetry(() => provider.getBlockNumber());
  const routerLogs = await fetchRouterLogsBackward(provider, routerAddress, toBlock, 5000);
  const pairLogs = await fetchPairLogsBackward(provider, pairAddresses, toBlock, 5000);

  const routerTrades = decodeRouterTrades(routerLogs, config, poolByRoute).filter(
    (t) => t.user.toLowerCase() === wallet.toLowerCase()
  );
  const routerTxSet = new Set(routerTrades.map((t) => t.txHash.toLowerCase()));
  const directTrades = await decodeDirectPairTrades(
    provider,
    pairLogs,
    config,
    poolByPair,
    routerTxSet,
    wallet
  );

  let merged = sortTradesDesc([...routerTrades, ...directTrades]);

  const sdaTxCache = new Map<string, { amountIn: bigint; amountOut: bigint } | null>();
  for (const trade of merged) {
    if (trade.kind !== "sda" || trade.amountIn !== 0n) continue;
    const pool = poolByRoute.get(trade.routeName);
    if (!pool) continue;
    let cached = sdaTxCache.get(trade.txHash);
    if (cached === undefined) {
      cached = await amountInFromSdaTx(provider, trade.txHash, pool.pair, pool.tokenIn);
      sdaTxCache.set(trade.txHash, cached);
    }
    if (cached) {
      trade.amountIn = cached.amountIn;
      trade.amountOut = cached.amountOut;
    }
  }

  return merged;
}

export async function loadSafeReserveCache(
  provider: JsonRpcProvider,
  config: DemoDeploymentConfig
): Promise<Map<string, { reserveIn: bigint; reserveOut: bigint; decIn: number; decOut: number }>> {
  const cache = new Map<
    string,
    { reserveIn: bigint; reserveOut: bigint; decIn: number; decOut: number }
  >();

  for (const pool of config.pools) {
    if (pool.label !== 0) continue;
    const parsed = parseRouteName(pool.routeName);
    if (!parsed) continue;
    const key = `${parsed.tokenInKey}-${parsed.tokenOutKey}`;
    if (cache.has(key)) continue;
    try {
      const reserves = await readSwapReserves(provider, pool.pair, pool.tokenIn);
      const decIn = decimalsForSymbol(tokenSymbolForAddress(config, pool.tokenIn) ?? "USDC");
      const decOut = decimalsForSymbol(tokenSymbolForAddress(config, pool.tokenOut) ?? "USDC");
      cache.set(key, { reserveIn: reserves.reserveIn, reserveOut: reserves.reserveOut, decIn, decOut });
      await logPace();
    } catch {
      /* skip */
    }
  }
  return cache;
}

export function usdcVolumeFromTrade(
  config: DemoDeploymentConfig,
  trade: IndexedChainTrade,
  safeReserves: Map<string, { reserveIn: bigint; reserveOut: bigint; decIn: number; decOut: number }>
): number {
  const usdcAddr = getTokenAddress(config, "USDC").toLowerCase();
  if (trade.tokenIn.toLowerCase() === usdcAddr) {
    return toHumanAmount(trade.amountIn, 6);
  }
  if (trade.tokenOut.toLowerCase() === usdcAddr) {
    return toHumanAmount(trade.amountOut, 6);
  }

  const inKey = tokenKeyFromSymbol(trade.tokenInSymbol);
  const tryKeys = [`${inKey}-usdc`, `usdc-${inKey}`] as const;
  for (const key of tryKeys) {
    const reserves = safeReserves.get(key);
    if (!reserves) continue;
    const [fromKey, toKey] = key.split("-") as [DemoTokenKey, DemoTokenKey];
    if (fromKey === inKey && toKey === "usdc") {
      const usdcRaw = getAmountOut(trade.amountIn, reserves.reserveIn, reserves.reserveOut);
      return toHumanAmount(usdcRaw, 6);
    }
    if (fromKey === "usdc" && toKey === inKey) {
      const usdcRaw = getAmountOut(trade.amountIn, reserves.reserveOut, reserves.reserveIn);
      return toHumanAmount(usdcRaw, 6);
    }
  }

  const safeName = buildSafeRouteName(inKey, "usdc");
  const safePool = config.pools.find((p) => p.routeName === safeName);
  if (safePool) {
    const key = `${inKey}-usdc`;
    const reserves = safeReserves.get(key);
    if (reserves) {
      const usdcRaw = getAmountOut(trade.amountIn, reserves.reserveIn, reserves.reserveOut);
      return toHumanAmount(usdcRaw, 6);
    }
  }
  return 0;
}

export function toHumanAmountIn(symbol: DemoTokenSymbol, raw: bigint): number {
  return toHumanAmount(raw, decimalsForSymbol(symbol));
}

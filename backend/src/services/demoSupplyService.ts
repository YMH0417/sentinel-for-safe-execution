import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { demoErc20Abi, demoScenarioDeployerAbi } from "../abi/demoAbis.js";
import {
  DemoDeploymentConfig,
  DemoPoolEntry,
  DemoTokenSymbol,
  labelFromNumber,
  loadDemoConfig,
} from "../config/demoConfig.js";
import { decimalsForSymbol } from "../config/demoRoutes.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { withRpcRetry } from "../utils/rpcRetry.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { readSwapReserves, remoteRpcPace } from "./demoPairReadService.js";

export interface TokenSupplyRow {
  symbol: DemoTokenSymbol;
  address: string;
  decimals: number;
  totalSupply: string;
  totalSupplyHuman: number;
  deployerInventory: string;
  deployerInventoryHuman: number;
  holderBalance: string;
  holderBalanceHuman: number;
}

export interface PoolReserveRow {
  routeName: string;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  reserve0: string;
  reserve1: string;
  reserve0Human: number;
  reserve1Human: number;
  label: string;
}

export interface DemoSupplyOverview {
  scenarioDeployer: string;
  testUser: string;
  holder: string;
  testUserIsAuthorizedMinter: boolean;
  tokens: TokenSupplyRow[];
  pools: PoolReserveRow[];
}

export interface DemoSupplyProgress {
  current: number;
  total: number;
  phase: "tokens" | "pools";
  detail?: string;
}

export type DemoSupplyStreamEvent =
  | { event: "progress"; progress: DemoSupplyProgress }
  | { event: "complete"; data: DemoSupplyOverview };

function addressToSymbol(
  config: DemoDeploymentConfig,
  address: string
): DemoTokenSymbol | string {
  const lower = address.toLowerCase();
  for (const [symbol, addr] of Object.entries(config.tokens)) {
    if (addr?.toLowerCase() === lower) return symbol as DemoTokenSymbol;
  }
  return address;
}

async function readPoolReserveRow(
  config: DemoDeploymentConfig,
  pool: DemoPoolEntry,
  tokenDecimals: Map<string, number>,
  provider: JsonRpcProvider
): Promise<PoolReserveRow> {
  const { token0, token1, reserveIn, reserveOut } = await readSwapReserves(
    provider,
    pool.pair,
    pool.tokenIn
  );
  const tokenInIsToken0 = token0.toLowerCase() === pool.tokenIn.toLowerCase();
  const reserve0 = tokenInIsToken0 ? reserveIn : reserveOut;
  const reserve1 = tokenInIsToken0 ? reserveOut : reserveIn;
  const token0Symbol = String(addressToSymbol(config, token0));
  const token1Symbol = String(addressToSymbol(config, token1));
  const dec0 = tokenDecimals.get(token0.toLowerCase()) ?? 18;
  const dec1 = tokenDecimals.get(token1.toLowerCase()) ?? 18;
  const tokenInSym = addressToSymbol(config, pool.tokenIn);
  const tokenOutSym = addressToSymbol(config, pool.tokenOut);
  return {
    routeName: pool.routeName,
    pair: pool.pair,
    tokenIn: String(tokenInSym),
    tokenOut: String(tokenOutSym),
    tokenInAddress: pool.tokenIn,
    tokenOutAddress: pool.tokenOut,
    token0,
    token1,
    token0Symbol,
    token1Symbol,
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
    reserve0Human: Number(formatUnits(reserve0, dec0)),
    reserve1Human: Number(formatUnits(reserve1, dec1)),
    label: labelFromNumber(pool.label),
  };
}

export async function* streamDemoSupplyOverview(
  holder: string
): AsyncGenerator<DemoSupplyStreamEvent> {
  const config = await getLiveDemoConfig();
  const base = loadDemoConfig();
  const provider = new JsonRpcProvider(getRpcUrl());
  const testUser = config.testUser ?? base.testUser ?? "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";
  const scenarioDeployer = config.scenarioDeployer;
  if (!scenarioDeployer) {
    throw new Error("scenarioDeployer address missing from demo deployment");
  }

  const symbols = Object.keys(config.tokens) as DemoTokenSymbol[];
  const totalSteps = symbols.length + config.pools.length;
  let current = 0;

  const deployerContract = new Contract(scenarioDeployer, demoScenarioDeployerAbi, provider);
  const testUserIsAuthorizedMinter = Boolean(
    await withRpcRetry(() => deployerContract.authorizedMinters(testUser) as Promise<boolean>)
  );

  const tokens: TokenSupplyRow[] = [];
  for (const symbol of symbols) {
    const address = config.tokens[symbol]!;
    const decimals = decimalsForSymbol(symbol);
    const token = new Contract(address, demoErc20Abi, provider);
    const totalSupply = await withRpcRetry(
      () => token.totalSupply() as Promise<bigint>
    );
    const deployerInventory = await withRpcRetry(
      () => token.balanceOf(scenarioDeployer) as Promise<bigint>
    );
    const holderBalance = await withRpcRetry(
      () => token.balanceOf(holder) as Promise<bigint>
    );
    tokens.push({
      symbol,
      address,
      decimals,
      totalSupply: totalSupply.toString(),
      totalSupplyHuman: Number(formatUnits(totalSupply, decimals)),
      deployerInventory: deployerInventory.toString(),
      deployerInventoryHuman: Number(formatUnits(deployerInventory, decimals)),
      holderBalance: holderBalance.toString(),
      holderBalanceHuman: Number(formatUnits(holderBalance, decimals)),
    });
    current += 1;
    yield {
      event: "progress",
      progress: { current, total: totalSteps, phase: "tokens", detail: symbol },
    };
  }

  const tokenDecimals = new Map<string, number>();
  for (const row of tokens) {
    tokenDecimals.set(row.address.toLowerCase(), row.decimals);
  }

  const pools: PoolReserveRow[] = [];
  for (const pool of config.pools) {
    pools.push(await readPoolReserveRow(config, pool, tokenDecimals, provider));
    current += 1;
    yield {
      event: "progress",
      progress: { current, total: totalSteps, phase: "pools", detail: pool.routeName },
    };
    await remoteRpcPace();
  }

  yield {
    event: "complete",
    data: {
      scenarioDeployer,
      testUser,
      holder,
      testUserIsAuthorizedMinter,
      tokens,
      pools,
    },
  };
}

export async function getDemoSupplyOverview(holder: string): Promise<DemoSupplyOverview> {
  for await (const event of streamDemoSupplyOverview(holder)) {
    if (event.event === "complete") return event.data;
  }
  throw new Error("Demo supply stream ended without result");
}

import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { demoErc20Abi, demoPairAbi, demoScenarioDeployerAbi } from "../abi/demoAbis.js";
import {
  DemoDeploymentConfig,
  DemoTokenSymbol,
  labelFromNumber,
  loadDemoConfig,
} from "../config/demoConfig.js";
import { decimalsForSymbol } from "../config/demoRoutes.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";

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

export async function getDemoSupplyOverview(holder: string): Promise<DemoSupplyOverview> {
  const config = await getLiveDemoConfig();
  const base = loadDemoConfig();
  const provider = new JsonRpcProvider(getRpcUrl());
  const testUser = config.testUser ?? base.testUser ?? "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";
  const scenarioDeployer = config.scenarioDeployer;
  if (!scenarioDeployer) {
    throw new Error("scenarioDeployer address missing from demo deployment");
  }

  const deployerContract = new Contract(scenarioDeployer, demoScenarioDeployerAbi, provider);
  const testUserIsAuthorizedMinter = Boolean(await deployerContract.authorizedMinters(testUser));

  const symbols = Object.keys(config.tokens) as DemoTokenSymbol[];
  const tokens: TokenSupplyRow[] = await Promise.all(
    symbols.map(async (symbol) => {
      const address = config.tokens[symbol]!;
      const decimals = decimalsForSymbol(symbol);
      const token = new Contract(address, demoErc20Abi, provider);
      const [totalSupply, deployerInventory, holderBalance] = await Promise.all([
        token.totalSupply() as Promise<bigint>,
        token.balanceOf(scenarioDeployer) as Promise<bigint>,
        token.balanceOf(holder) as Promise<bigint>,
      ]);
      return {
        symbol,
        address,
        decimals,
        totalSupply: totalSupply.toString(),
        totalSupplyHuman: Number(formatUnits(totalSupply, decimals)),
        deployerInventory: deployerInventory.toString(),
        deployerInventoryHuman: Number(formatUnits(deployerInventory, decimals)),
        holderBalance: holderBalance.toString(),
        holderBalanceHuman: Number(formatUnits(holderBalance, decimals)),
      };
    })
  );

  const tokenDecimals = new Map<string, number>();
  for (const row of tokens) {
    tokenDecimals.set(row.address.toLowerCase(), row.decimals);
  }

  const pools: PoolReserveRow[] = await Promise.all(
    config.pools.map(async (pool) => {
      const pair = new Contract(pool.pair, demoPairAbi, provider);
      const [token0, token1, reserves] = await Promise.all([
        pair.token0() as Promise<string>,
        pair.token1() as Promise<string>,
        pair.getReserves() as Promise<[bigint, bigint, number]>,
      ]);
      const [reserve0, reserve1] = reserves;
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
    })
  );

  return {
    scenarioDeployer,
    testUser,
    holder,
    testUserIsAuthorizedMinter,
    tokens,
    pools,
  };
}

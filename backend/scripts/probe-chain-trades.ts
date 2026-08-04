import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(process.cwd(), ".env") });

import { JsonRpcProvider, id as eventId, getAddress } from "ethers";
import { getLiveDemoConfig } from "../src/services/demoRegistryService.js";
import { fetchWalletChainTrades, fetchRecentGlobalChainTrades } from "../src/services/chainTradeIndexService.js";

async function main() {
  const wallet = "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c";
  const config = await getLiveDemoConfig();
  console.log("pools", config.pools.length, "router", config.swapRouter);

  const provider = new JsonRpcProvider(process.env.RPC_URL || "https://testnet-rpc.monad.xyz");
  const to = await provider.getBlockNumber();
  console.log("head", to);

  const topic = eventId("RouterSwapExecuted(bytes32,address,address,uint256,uint256)");
  const router = getAddress(config.swapRouter!);
  let routerLogs = 0;
  for (let end = to; end > to - 2000; end -= 100) {
    const from = Math.max(0, end - 99);
    const logs = await provider.getLogs({
      address: router,
      topics: [topic],
      fromBlock: from,
      toBlock: end,
    });
    routerLogs += logs.length;
  }
  console.log("router logs last ~2000 blocks", routerLogs);

  const global = await fetchRecentGlobalChainTrades(10);
  console.log("global trades sample", global.trades.length);

  const walletTrades = await fetchWalletChainTrades(wallet);
  console.log("wallet trades", walletTrades.length);
  for (const t of walletTrades.slice(0, 5)) {
    console.log(" ", t.kind, t.routeName, t.txHash.slice(0, 14), "check", t.passedCheck);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

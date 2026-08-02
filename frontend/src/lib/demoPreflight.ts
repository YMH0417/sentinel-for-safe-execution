import type { DemoChainConfig } from "./wallet";

export interface DemoRpcCheck {
  ok?: boolean;
  rpcUrl?: string;
  expectedChainId?: number;
  chainName?: string;
  registryDeployed?: boolean;
  usdcDeployed?: boolean;
  error?: string;
}

export interface DemoExecutePreflight {
  chainMode: string;
  routerSwapAvailable: boolean;
  swapConfigured: boolean;
  chain: DemoChainConfig;
  rpcCheck: DemoRpcCheck;
}

const API_BASE = "/api";

export async function fetchDemoExecutePreflight(): Promise<DemoExecutePreflight> {
  const [statusRes, rpcRes] = await Promise.all([
    fetch(`${API_BASE}/debug/status`),
    fetch(`${API_BASE}/debug/rpc-check`),
  ]);
  const status = await statusRes.json();
  const rpcCheck = (await rpcRes.json()) as DemoRpcCheck;

  if (status.chainMode !== "demo" || !status.expectedChainId) {
    throw new Error("后端未处于 demo 链模式，请运行 .\\start-demo.ps1");
  }

  const chain: DemoChainConfig = {
    chainId: Number(status.expectedChainId),
    chainName: status.chainName ?? "Demo Chain",
    rpcUrl: status.demoRpcUrl ?? status.anvilRpcUrl ?? "http://127.0.0.1:8545",
    nativeCurrency: status.nativeCurrency ?? {
      name: "Monad",
      symbol: "MON",
      decimals: 18,
    },
    demoProfile: status.demoProfile ?? null,
    deploymentTarget: status.deploymentTarget ?? null,
  };

  if (!status.swapConfigured) {
    throw new Error("Backend swap 未配置，请检查 backend/.env 并重启服务");
  }
  if (!status.routerSwapAvailable) {
    throw new Error(
      "MetaMask 钱包 swap 需要 DemoSwapRouter + Agent 签名。请确认 backend/.env 中 AGENT_PRIVATE_KEY 与 DEMO_SWAP_ROUTER_ADDRESS 已设置"
    );
  }
  if (!rpcCheck.ok) {
    throw new Error(
      rpcCheck.error ??
        `Demo 链合约未就绪（RPC ${rpcCheck.rpcUrl ?? chain.rpcUrl}）。请运行 .\\start-demo.ps1 -Profile anvil-local 重新部署`
    );
  }

  return {
    chainMode: status.chainMode,
    routerSwapAvailable: Boolean(status.routerSwapAvailable),
    swapConfigured: Boolean(status.swapConfigured),
    chain,
    rpcCheck,
  };
}

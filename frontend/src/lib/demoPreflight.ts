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
  walletSwapAvailable: boolean;
  chain: DemoChainConfig;
  rpcCheck: DemoRpcCheck;
}

const API_BASE = "/api";

async function loadDemoStatusAndRpc(): Promise<{
  status: Record<string, unknown>;
  rpcCheck: DemoRpcCheck;
  chain: DemoChainConfig;
}> {
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
    chainName: (status.chainName as string) ?? "Demo Chain",
    rpcUrl: (status.demoRpcUrl as string) ?? (status.anvilRpcUrl as string) ?? "http://127.0.0.1:8545",
    nativeCurrency: (status.nativeCurrency as DemoChainConfig["nativeCurrency"]) ?? {
      name: "Monad",
      symbol: "MON",
      decimals: 18,
    },
    demoProfile: (status.demoProfile as string) ?? null,
    deploymentTarget: (status.deploymentTarget as string) ?? null,
  };

  return { status, rpcCheck, chain };
}

/** Chain + RPC readiness only — does not require backend swap keys. */
export async function fetchDemoChainPreflight(): Promise<{
  chainMode: string;
  chain: DemoChainConfig;
  rpcCheck: DemoRpcCheck;
  walletSwapAvailable: boolean;
}> {
  const { status, rpcCheck, chain } = await loadDemoStatusAndRpc();

  if (!rpcCheck.ok) {
    throw new Error(
      rpcCheck.error ??
        `Demo 链合约未就绪（RPC ${rpcCheck.rpcUrl ?? chain.rpcUrl}）。请运行 .\\start-demo.ps1 -Profile anvil-local 重新部署`
    );
  }

  const walletSwapAvailable = Boolean(status.swapRouter || rpcCheck.registryDeployed);

  return {
    chainMode: status.chainMode as string,
    chain,
    rpcCheck,
    walletSwapAvailable,
  };
}

/** Backend executor preflight — requires swap wallet keys in backend/.env. */
export async function fetchDemoExecutePreflight(): Promise<DemoExecutePreflight> {
  const { status, rpcCheck, chain } = await loadDemoStatusAndRpc();

  const swapConfigured = Boolean(status.swapConfigured);
  const routerSwapAvailable = Boolean(status.routerSwapAvailable);
  const walletSwapAvailable = Boolean(status.swapRouter || rpcCheck.registryDeployed);

  if (!swapConfigured && !walletSwapAvailable) {
    throw new Error("Demo swap 环境未就绪，请确认 demo 已部署且 RPC 可用");
  }

  if (!rpcCheck.ok) {
    throw new Error(
      rpcCheck.error ??
        `Demo 链合约未就绪（RPC ${rpcCheck.rpcUrl ?? chain.rpcUrl}）。请运行 .\\start-demo.ps1 -Profile anvil-local 重新部署`
    );
  }

  if (!swapConfigured && !routerSwapAvailable) {
    return {
      chainMode: status.chainMode as string,
      routerSwapAvailable: false,
      swapConfigured: false,
      walletSwapAvailable,
      chain,
      rpcCheck,
    };
  }

  if (!swapConfigured) {
    throw new Error("Backend swap 未配置，请检查 backend/.env 并重启服务");
  }
  if (!routerSwapAvailable) {
    throw new Error(
      "MetaMask 钱包 swap 需要 DemoSwapRouter + Agent 签名。请确认 backend/.env 中 AGENT_PRIVATE_KEY 与 DEMO_SWAP_ROUTER_ADDRESS 已设置"
    );
  }

  return {
    chainMode: status.chainMode as string,
    routerSwapAvailable,
    swapConfigured,
    walletSwapAvailable,
    chain,
    rpcCheck,
  };
}

import { BrowserProvider, getAddress } from "ethers";
import { parseApiError } from "./apiError";
import { getErrorMessage } from "./errorMessage";

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface DemoChainConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeCurrency: NativeCurrency;
  demoProfile?: string | null;
  deploymentTarget?: string | null;
}

export interface DemoTokenMeta {
  symbol: string;
  address: string;
  decimals: number;
}

const API_BASE = "/api";

const DEFAULT_NATIVE: NativeCurrency = {
  name: "Monad",
  symbol: "MON",
  decimals: 18,
};

export async function fetchNativeCurrencySymbol(): Promise<string> {
  const chain = await fetchDemoChainConfig();
  return chain?.nativeCurrency.symbol ?? DEFAULT_NATIVE.symbol;
}

export async function fetchDemoChainConfig(): Promise<DemoChainConfig | null> {
  const res = await fetch(`${API_BASE}/debug/status`);
  const data = await res.json();
  if (data.chainMode !== "demo" || !data.expectedChainId) return null;

  const native = data.nativeCurrency ?? DEFAULT_NATIVE;
  return {
    chainId: Number(data.expectedChainId),
    chainName: data.chainName ?? "Demo Chain",
    rpcUrl: data.demoRpcUrl ?? data.anvilRpcUrl ?? "http://127.0.0.1:8545",
    nativeCurrency: {
      name: native.name ?? DEFAULT_NATIVE.name,
      symbol: native.symbol ?? DEFAULT_NATIVE.symbol,
      decimals: Number(native.decimals ?? DEFAULT_NATIVE.decimals),
    },
    demoProfile: data.demoProfile ?? null,
    deploymentTarget: data.deploymentTarget ?? null,
  };
}

function formatMetaMaskChainError(err: unknown, chain: DemoChainConfig): string {
  const raw = err ? getErrorMessage(err, "") : "";
  if (
    raw.includes("same RPC endpoint") ||
    raw.includes("points to same RPC")
  ) {
    return (
      `MetaMask 中已有网络占用了 ${chain.rpcUrl}（例如旧的「Anvil Local」Chain ID 31337）。` +
      `请切换到「${chain.chainName}」（Chain ID ${chain.chainId}），` +
      `或在 MetaMask → 设置 → 网络 中删除冲突的旧本地网络后重试。`
    );
  }
  if (raw) return raw;
  return `请手动将 MetaMask 切换到 ${chain.chainName}（Chain ID ${chain.chainId}，RPC ${chain.rpcUrl}）`;
}

export async function ensureDemoChain(config?: DemoChainConfig | null): Promise<void> {
  if (!window.ethereum) {
    throw new Error("请先安装 MetaMask 浏览器插件");
  }

  const chain = config ?? (await fetchDemoChainConfig());
  if (!chain) return;

  const hexChainId = "0x" + chain.chainId.toString(16);
  const currentChainId = (await window.ethereum.request({
    method: "eth_chainId",
  })) as string;

  if (currentChainId?.toLowerCase() === hexChainId.toLowerCase()) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: chain.chainName,
              rpcUrls: [chain.rpcUrl],
              nativeCurrency: chain.nativeCurrency,
            },
          ],
        });
      } catch (addErr) {
        throw new Error(formatMetaMaskChainError(addErr, chain));
      }
    } else {
      throw new Error(formatMetaMaskChainError(err, chain));
    }
  }

  const currentAfter = (await window.ethereum.request({
    method: "eth_chainId",
  })) as string;
  if (currentAfter?.toLowerCase() !== hexChainId.toLowerCase()) {
    throw new Error(formatMetaMaskChainError(null, chain));
  }
}

export async function revokeMetaMaskAccess(): Promise<void> {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Unsupported or already disconnected — next eth_requestAccounts may still prompt.
  }
}

/** Read connected account; optionally prompt if the site has no active connection. */
export async function getMetaMaskAccount(options?: {
  requestIfNeeded?: boolean;
}): Promise<string> {
  if (!window.ethereum) {
    throw new Error("请先安装 MetaMask 浏览器插件");
  }

  let accounts = (await window.ethereum.request({
    method: "eth_accounts",
  })) as string[];

  if (!accounts?.length && options?.requestIfNeeded !== false) {
    accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
  }

  if (!accounts?.length) {
    throw new Error("MetaMask 未返回账户，请解锁钱包后重试");
  }

  await ensureDemoChain();
  return getAddress(accounts[0]);
}

/** Explicit connect from UI — prompt MetaMask if needed (do not revoke; avoids flaky reconnect). */
export async function connectMetaMaskWallet(): Promise<string> {
  return getMetaMaskAccount({ requestIfNeeded: true });
}

/** Swap execution — reuse existing MetaMask session; never revoke site access. */
export async function ensureMetaMaskAccountForTransaction(): Promise<string> {
  return getMetaMaskAccount({ requestIfNeeded: true });
}

export async function fetchDemoToken(symbol: string): Promise<DemoTokenMeta> {
  const res = await fetch(`${API_BASE}/demo/tokens`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(parseApiError(data.error, "无法加载 demo 代币配置"));
  }

  const token = (data.tokens as DemoTokenMeta[] | undefined)?.find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
  );
  if (!token?.address) {
    throw new Error(`未找到代币 ${symbol}，请确认 demo 环境已启动`);
  }

  return token;
}

export async function fetchSwapRouterAddress(): Promise<string> {
  const [demoRes, debugRes] = await Promise.all([
    fetch(`${API_BASE}/demo/status`),
    fetch(`${API_BASE}/debug/status`),
  ]);
  const demoData = await demoRes.json();
  const debugData = await debugRes.json();
  const router: string | undefined = demoData.swapRouter || debugData.swapRouter;
  if (!router) {
    throw new Error("DemoSwapRouter 未配置，请运行 .\\start-demo.ps1 重新部署");
  }
  return getAddress(router);
}

export function getBrowserProvider(): BrowserProvider {
  if (!window.ethereum) {
    throw new Error("MetaMask 未安装");
  }
  return new BrowserProvider(window.ethereum);
}

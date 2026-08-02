import { Contract, parseUnits, getAddress } from "ethers";
import { demoErc20Abi, demoScenarioDeployerAbi } from "./demoConstants";
import { getBrowserProvider } from "./wallet";
import { parseApiError } from "./apiError";

const API_BASE = "/api";

export interface TokenSupplyRow {
  symbol: string;
  address: string;
  decimals: number;
  totalSupplyHuman: number;
  deployerInventoryHuman: number;
  holderBalanceHuman: number;
}

export interface PoolReserveRow {
  routeName: string;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
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

type DemoSupplyStreamEvent =
  | { event: "progress"; progress: DemoSupplyProgress }
  | { event: "complete"; data: DemoSupplyOverview }
  | { event: "error"; error: string };

async function readSupplyStream(
  holder: string,
  onProgress?: (progress: DemoSupplyProgress) => void
): Promise<DemoSupplyOverview> {
  const res = await fetch(
    `${API_BASE}/demo/supply?holder=${encodeURIComponent(holder)}&stream=1`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(parseApiError((data as { error?: string }).error, "无法加载代币供应量"));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("无法读取供应数据流");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as DemoSupplyStreamEvent;
      if (event.event === "progress") {
        onProgress?.(event.progress);
      } else if (event.event === "complete") {
        return event.data;
      } else if (event.event === "error") {
        throw new Error(parseApiError(event.error, "无法加载代币供应量"));
      }
    }
  }

  throw new Error("供应数据流意外结束");
}

export async function fetchDemoSupplyOverview(
  holder: string,
  onProgress?: (progress: DemoSupplyProgress) => void
): Promise<DemoSupplyOverview> {
  if (onProgress) {
    return readSupplyStream(holder, onProgress);
  }

  const res = await fetch(
    `${API_BASE}/demo/supply?holder=${encodeURIComponent(holder)}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(parseApiError(data.error, "无法加载代币供应量"));
  }
  return data as DemoSupplyOverview;
}

export function formatSupplyProgressLabel(progress: DemoSupplyProgress): string {
  const phaseLabel = progress.phase === "tokens" ? "代币" : "池子";
  return `${progress.current}/${progress.total}（${phaseLabel}）`;
}

export async function fetchScenarioDeployerAddress(): Promise<string> {
  const overview = await fetchDemoSupplyOverview(
    "0x881915BE66Be800Cc180b6244809A1D188Bc1b2c"
  );
  if (!overview.scenarioDeployer) {
    throw new Error("ScenarioDeployer 未配置，请重新部署 demo");
  }
  return getAddress(overview.scenarioDeployer);
}

export async function mintDemoToken(params: {
  tokenAddress: string;
  recipient: string;
  amountHuman: string;
  decimals: number;
  scenarioDeployer: string;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(
    params.scenarioDeployer,
    demoScenarioDeployerAbi,
    signer
  );
  const amount = parseUnits(params.amountHuman, params.decimals);
  const tx = await contract.mintToken(
    getAddress(params.tokenAddress),
    getAddress(params.recipient),
    amount
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function burnDemoToken(params: {
  tokenAddress: string;
  amountHuman: string;
  decimals: number;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(params.tokenAddress, demoErc20Abi, signer);
  const amount = parseUnits(params.amountHuman, params.decimals);
  const tx = await contract.burn(amount);
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function transferDemoToken(params: {
  tokenAddress: string;
  recipient: string;
  amountHuman: string;
  decimals: number;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(params.tokenAddress, demoErc20Abi, signer);
  const amount = parseUnits(params.amountHuman, params.decimals);
  const tx = await contract.transfer(getAddress(params.recipient), amount);
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function mintDemoTokenToPool(params: {
  tokenAddress: string;
  pairAddress: string;
  amountHuman: string;
  decimals: number;
  scenarioDeployer: string;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(
    params.scenarioDeployer,
    demoScenarioDeployerAbi,
    signer
  );
  const amount = parseUnits(params.amountHuman, params.decimals);
  const tx = await contract.mintTokenToPool(
    getAddress(params.tokenAddress),
    getAddress(params.pairAddress),
    amount
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function burnDemoTokenFromPool(params: {
  tokenAddress: string;
  pairAddress: string;
  amountHuman: string;
  decimals: number;
  scenarioDeployer: string;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(
    params.scenarioDeployer,
    demoScenarioDeployerAbi,
    signer
  );
  const amount = parseUnits(params.amountHuman, params.decimals);
  const tx = await contract.burnTokenFromPool(
    getAddress(params.tokenAddress),
    getAddress(params.pairAddress),
    amount
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export function decimalsForSymbol(symbol: string): number {
  return symbol.toUpperCase() === "USDC" ? 6 : 18;
}

export function formatTokenAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const maxFrac = decimals <= 6 ? 2 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxFrac,
  });
}

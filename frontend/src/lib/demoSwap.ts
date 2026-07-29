import { Contract, MaxUint256, parseUnits } from "ethers";
import {
  ensureDemoChain,
  fetchDemoChainConfig,
  getBrowserProvider,
} from "./wallet";

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export async function ensureUserTokenReady(params: {
  owner: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spender: string;
  amountHuman: string;
}): Promise<void> {
  const chain = await fetchDemoChainConfig();
  if (chain) {
    await ensureDemoChain(chain);
  }

  const provider = getBrowserProvider();
  const network = await provider.getNetwork();
  if (chain && network.chainId !== BigInt(chain.chainId)) {
    throw new Error(
      `MetaMask 网络不正确（当前 ${network.chainId}，需要 ${chain.chainId}）。请在 MetaMask 中切换到 ${chain.chainName}`
    );
  }

  const tokenAddr = params.tokenAddress;
  const code = await provider.getCode(tokenAddr);
  if (!code || code === "0x") {
    throw new Error(
      `代币 ${params.tokenSymbol} 在当前网络无合约（${tokenAddr}）。请切换到本地 Anvil 链并重新运行 start-demo.ps1`
    );
  }

  const signer = await provider.getSigner();
  const token = new Contract(tokenAddr, erc20Abi, provider);
  const amountRaw = parseUnits(params.amountHuman, params.tokenDecimals);

  let balance: bigint;
  let allowance: bigint;
  try {
    [balance, allowance] = await Promise.all([
      token.balanceOf(params.owner) as Promise<bigint>,
      token.allowance(params.owner, params.spender) as Promise<bigint>,
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("BAD_DATA") || msg.includes("could not decode")) {
      throw new Error(
        `无法读取 ${params.tokenSymbol} 余额：MetaMask 可能未连接到 Anvil（Chain ID 31337）。请切换网络后重试`
      );
    }
    throw err;
  }

  if (balance < amountRaw) {
    throw new Error(
      `${params.tokenSymbol} 余额不足（需要 ${params.amountHuman}，当前 ${formatHuman(balance, params.tokenDecimals, params.tokenSymbol)}）。本地测试可在重新部署后获得初始代币`
    );
  }

  if (allowance >= amountRaw) return;

  const tokenWithSigner = token.connect(signer) as Contract;
  const tx = await tokenWithSigner.approve(params.spender, MaxUint256);
  await tx.wait();
}

function formatHuman(raw: bigint, decimals: number, symbol: string): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return `${whole} ${symbol}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} ${symbol}`;
}

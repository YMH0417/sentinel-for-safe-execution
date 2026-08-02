import { Contract, id, getAddress } from "ethers";
import { demoPairAbi, demoSwapRouterAbi } from "./demoConstants";
import { parseApiError } from "./apiError";
import { fetchDemoChainPreflight } from "./demoPreflight";
import { getBrowserProvider, ensureDemoChain } from "./wallet";
import type { SwapResult } from "../types";

const API_BASE = "/api";

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export interface WalletSwapPlan {
  requestedRouteId: string;
  executedRouteId: string;
  agentDecision: {
    decision: string;
    riskScore: number;
    reason: string;
    routeId: string;
    fallbackRouteId: string | null;
    flags: string[];
  };
  agentBypassed: boolean;
  safetyMode: "safe" | "force";
  poolLabel: string;
  executionStrategy: "router" | "direct" | "sda";
  tokenIn: string;
  tokenOut: string;
  tokenInAddress: string;
  amountIn: number;
  quotedOut: number;
  expectedOut: number;
  amountOutMin?: number;
  amountOutMax?: number;
  slippageBps?: number;
  recipient: string;
  pairAddress: string;
  token0Address: string;
  routerAddress: string | null;
  vaultAddress: string | null;
  agentSigner: string | null;
  userIsAgentSigner: boolean;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  amounts: {
    amountInRaw: string;
    quotedOutRaw: string;
    amountOutMinRaw: string;
    amount0OutRaw: string;
    amount1OutRaw: string;
  };
  sdaSwapId?: string;
}

async function fetchWalletSwapPlan(params: {
  routeId: string;
  amountIn: number;
  tokenIn: string;
  tokenOut: string;
  recipient: string;
  force: boolean;
  slippageBps?: number;
  configProfile?: string;
}): Promise<WalletSwapPlan> {
  const res = await fetch(`${API_BASE}/swap/wallet/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routeId: params.routeId,
      amountIn: params.amountIn,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      recipient: params.recipient,
      force: params.force,
      configProfile: params.configProfile ?? "normal",
      ...(params.force && params.slippageBps !== undefined
        ? { slippageBps: params.slippageBps }
        : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errPayload = data.error;
    if (typeof errPayload === "object" && errPayload?.message) {
      throw new Error(parseApiError(errPayload.message, "无法生成 MetaMask swap 计划"));
    }
    throw new Error(parseApiError(data.error, "无法生成 MetaMask swap 计划"));
  }
  return data as WalletSwapPlan;
}

async function fetchBalances(address: string): Promise<Record<string, { human: number }>> {
  const res = await fetch(`${API_BASE}/swap/balances/${encodeURIComponent(address)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(parseApiError(data.error, "无法读取余额"));
  }
  return (data.balances ?? {}) as Record<string, { human: number }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signVaultPermit(params: {
  user: string;
  routeName: string;
  vaultAddress: string;
  chainId: number;
  amountInRaw: bigint;
  quotedOutRaw: bigint;
  deadline: number;
  riskScore: number;
  nonce: string;
}): Promise<string> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const routeIdBytes32 = id(params.routeName);

  return signer.signTypedData(
    {
      name: "Sentinel Vault Execution",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.vaultAddress,
    },
    {
      ExecutionPermit: [
        { name: "user", type: "address" },
        { name: "routeId", type: "bytes32" },
        { name: "amountIn", type: "uint256" },
        { name: "amountOutQuoted", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "riskScore", type: "uint256" },
        { name: "decision", type: "uint8" },
        { name: "nonce", type: "uint256" },
      ],
    },
    {
      user: params.user,
      routeId: routeIdBytes32,
      amountIn: params.amountInRaw,
      amountOutQuoted: params.quotedOutRaw,
      deadline: params.deadline,
      riskScore: params.riskScore,
      decision: 0,
      nonce: params.nonce,
    }
  );
}

async function ensureRouterAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  amountRaw: bigint
): Promise<void> {
  const provider = getBrowserProvider();
  const token = new Contract(tokenAddress, erc20Abi, provider);
  const allowance = (await token.allowance(owner, spender)) as bigint;
  if (allowance >= amountRaw) return;
  const signer = await provider.getSigner();
  const tokenWithSigner = token.connect(signer) as Contract;
  const tx = await tokenWithSigner.approve(spender, amountRaw);
  await tx.wait();
}

function buildSwapResult(params: {
  plan: WalletSwapPlan;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  executionMode: "router" | "direct";
  balancesBefore: Record<string, { human: number }>;
  balancesAfter: Record<string, { human: number }>;
  sdaMeta?: Partial<SwapResult>;
}): SwapResult {
  const { plan, balancesBefore, balancesAfter } = params;
  const beforeOut = balancesBefore[plan.tokenOut]?.human ?? 0;
  const afterOut = balancesAfter[plan.tokenOut]?.human ?? 0;
  const beforeIn = balancesBefore[plan.tokenIn]?.human ?? 0;
  const afterIn = balancesAfter[plan.tokenIn]?.human ?? 0;
  const actualOut = afterOut - beforeOut;

  return {
    success: actualOut > 0,
    routeId: plan.executedRouteId,
    requestedRouteId: plan.requestedRouteId,
    executedRouteId: plan.executedRouteId,
    agentDecision: plan.agentDecision.decision as SwapResult["agentDecision"],
    agentBypassed: plan.agentBypassed,
    safetyMode: plan.safetyMode,
    poolLabel: plan.poolLabel,
    executionMode: params.executionMode,
    tokenIn: plan.tokenIn,
    tokenOut: plan.tokenOut,
    amountIn: plan.amountIn,
    quotedOut: plan.quotedOut,
    expectedOut: plan.expectedOut,
    actualOut,
    amountOutMin: plan.amountOutMin,
    amountOutMax: plan.amountOutMax,
    slippageBps: plan.slippageBps,
    failureCode: actualOut > 0 ? undefined : "SETTLEMENT_VALIDATION_FAILED",
    failureMessage: actualOut > 0 ? undefined : "链上交易已发送，但未检测到输出代币余额增加",
    recipient: plan.recipient,
    txHash: params.txHash,
    gasUsed: params.gasUsed,
    balanceDelta: {
      [plan.tokenIn]: afterIn - beforeIn,
      [plan.tokenOut]: actualOut,
    },
    ...params.sdaMeta,
  };
}

export async function executeWalletDemoSwap(params: {
  routeId: string;
  amountIn: string;
  tokenIn: string;
  tokenOut: string;
  recipient: string;
  force: boolean;
  slippageBps?: number;
}): Promise<SwapResult> {
  const recipient = getAddress(params.recipient);
  const amountInNum = Number(params.amountIn);
  if (!Number.isFinite(amountInNum) || amountInNum <= 0) {
    throw new Error("请输入有效的 swap 数量");
  }

  const preflight = await fetchDemoChainPreflight();
  await ensureDemoChain(preflight.chain);

  const plan = await fetchWalletSwapPlan({
    routeId: params.routeId,
    amountIn: amountInNum,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    recipient,
    force: params.force,
    slippageBps: params.slippageBps,
  });

  if (!plan.routerAddress && plan.executionStrategy !== "direct") {
    throw new Error("DemoSwapRouter 未配置");
  }

  const spender = plan.routerAddress ?? plan.pairAddress;
  await ensureRouterAllowance(
    plan.tokenInAddress,
    recipient,
    spender,
    BigInt(plan.amounts.amountInRaw)
  );

  const balancesBefore = await fetchBalances(recipient);
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  let receipt: { hash: string; blockNumber: number; gasUsed: bigint };
  let executionMode: "router" | "direct" = "router";
  let sdaMeta: Partial<SwapResult> = {};

  if (plan.executionStrategy === "router" && plan.routerAddress && plan.vaultAddress) {
    const nonceRes = await fetch(
      `${API_BASE}/execute/nonce?user=${encodeURIComponent(recipient)}`
    );
    const nonceData = await nonceRes.json();
    if (!nonceRes.ok) {
      throw new Error(parseApiError(nonceData.error?.message ?? nonceData.error, "无法读取 Vault nonce"));
    }

    const deadline = Math.floor(Date.now() / 1000) + 600;
    const signature = await signVaultPermit({
      user: recipient,
      routeName: plan.executedRouteId,
      vaultAddress: plan.vaultAddress,
      chainId: Number(network.chainId),
      amountInRaw: BigInt(plan.amounts.amountInRaw),
      quotedOutRaw: BigInt(plan.amounts.quotedOutRaw),
      deadline,
      riskScore: plan.agentDecision.riskScore,
      nonce: String(nonceData.nonce),
    });

    const router = new Contract(plan.routerAddress, demoSwapRouterAbi, signer);
    const routeIdBytes32 = id(plan.executedRouteId);
    const tx = await router.swapWithPermit(
      recipient,
      routeIdBytes32,
      BigInt(plan.amounts.amountInRaw),
      BigInt(plan.amounts.quotedOutRaw),
      BigInt(plan.amounts.amountOutMinRaw),
      deadline,
      plan.agentDecision.riskScore,
      0,
      nonceData.nonce,
      signature,
      recipient
    );
    const txReceipt = await tx.wait();
    if (!txReceipt || txReceipt.status === 0) {
      throw new Error("Router swap 链上 revert");
    }
    receipt = {
      hash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      gasUsed: txReceipt.gasUsed,
    };
  } else if (plan.executionStrategy === "sda" && plan.routerAddress && plan.sdaSwapId) {
    const router = new Contract(plan.routerAddress, demoSwapRouterAbi, signer);
    const routeIdBytes32 = id(plan.executedRouteId);
    const openTx = await router.openSdaExecutionWindow(
      plan.sdaSwapId,
      recipient,
      routeIdBytes32,
      BigInt(plan.amounts.amountInRaw),
      BigInt(plan.amounts.amountOutMinRaw),
      recipient
    );
    const openReceipt = await openTx.wait();
    if (!openReceipt || openReceipt.status === 0) {
      throw new Error("SDA 窗口开启失败");
    }

    const readyAt = (await router.getSdaWindowReadyAt(plan.sdaSwapId)) as bigint;
    while (BigInt(Math.floor(Date.now() / 1000)) < readyAt) {
      await sleep(1000);
    }

    const completeTx = await router.completeSdaExecutionWindow(plan.sdaSwapId);
    const completeReceipt = await completeTx.wait();
    if (!completeReceipt || completeReceipt.status === 0) {
      throw new Error("SDA swap 结算失败");
    }
    receipt = {
      hash: completeReceipt.hash,
      blockNumber: completeReceipt.blockNumber,
      gasUsed: completeReceipt.gasUsed,
    };
    sdaMeta = {
      sdaExecutionWindow: true,
      sdaWindowSeconds: 15,
      sdaOpenTxHash: openReceipt.hash,
      sdaReadyAt: Number(readyAt),
    };
  } else {
    executionMode = "direct";
    const token = new Contract(plan.tokenInAddress, erc20Abi, signer);
    const transferTx = await token.transfer(plan.pairAddress, BigInt(plan.amounts.amountInRaw));
    await transferTx.wait();

    const pair = new Contract(plan.pairAddress, demoPairAbi, signer);
    const swapTx = await pair.swap(
      BigInt(plan.amounts.amount0OutRaw),
      BigInt(plan.amounts.amount1OutRaw),
      recipient
    );
    const txReceipt = await swapTx.wait();
    if (!txReceipt || txReceipt.status === 0) {
      throw new Error("Direct swap 链上 revert");
    }
    receipt = {
      hash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      gasUsed: txReceipt.gasUsed,
    };
  }

  const balancesAfter = await fetchBalances(recipient);
  return buildSwapResult({
    plan,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    executionMode,
    balancesBefore,
    balancesAfter,
    sdaMeta,
  });
}

export async function isBackendSwapExecutorAvailable(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/debug/status`);
  const data = await res.json();
  return Boolean(data.swapConfigured && data.routerSwapAvailable);
}

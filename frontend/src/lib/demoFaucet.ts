import { Contract, getAddress } from "ethers";
import { demoErc20Abi } from "./demoConstants";
import { ensureMetaMaskAccountForTransaction, getBrowserProvider } from "./wallet";
import { parseApiError } from "./apiError";

const API_BASE = "/api";

export interface UsdcFaucetPlan {
  token: string;
  from: string;
  to: string;
  amount: string;
  amountHuman: string;
}

export async function prepareUsdcFaucet(recipient: string): Promise<UsdcFaucetPlan> {
  const res = await fetch(`${API_BASE}/demo/faucet/usdc/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: getAddress(recipient) }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(parseApiError(data.error, "水龙头准备失败"));
  }
  return data as UsdcFaucetPlan;
}

/** Claim demo USDC from the test wallet; connected wallet pays gas via MetaMask. */
export async function claimUsdcFromFaucet(recipient?: string): Promise<string> {
  const account = await ensureMetaMaskAccountForTransaction();
  const to = getAddress(recipient ?? account);
  const plan = await prepareUsdcFaucet(to);

  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const usdc = new Contract(plan.token, demoErc20Abi, signer);
  const tx = await usdc.transferFrom(plan.from, plan.to, plan.amount);
  await tx.wait();
  return tx.hash as string;
}

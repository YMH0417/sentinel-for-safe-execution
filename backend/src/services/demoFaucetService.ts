import { Contract, JsonRpcProvider, MaxUint256, Wallet, getAddress, parseUnits } from "ethers";
import { demoErc20Abi, DEFAULT_TEST_USER } from "../abi/demoAbis.js";
import { getRpcUrl } from "../config/chainConfig.js";
import { getLiveDemoConfig } from "./demoRegistryService.js";
import { withRpcRetry } from "../utils/rpcRetry.js";

export const FAUCET_USDC_HUMAN = "10000";

function getTestUserWallet(provider: JsonRpcProvider): Wallet {
  const key =
    process.env.DEMO_TEST_USER_PRIVATE_KEY?.trim() ||
    process.env.SWAP_PRIVATE_KEY?.trim() ||
    process.env.AGENT_PRIVATE_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "Demo faucet requires DEMO_TEST_USER_PRIVATE_KEY, SWAP_PRIVATE_KEY, or AGENT_PRIVATE_KEY in backend/.env"
    );
  }
  return new Wallet(key, provider);
}

export interface UsdcFaucetPlan {
  token: string;
  from: string;
  to: string;
  amount: string;
  amountHuman: string;
}

export async function prepareUsdcFaucet(recipientInput: string): Promise<UsdcFaucetPlan> {
  const recipient = getAddress(recipientInput);
  const config = await getLiveDemoConfig();
  const usdcAddress = config.tokens.USDC;
  if (!usdcAddress) {
    throw new Error("USDC token address missing from demo deployment");
  }

  const testUser = getAddress(config.testUser ?? DEFAULT_TEST_USER);
  const amount = parseUnits(FAUCET_USDC_HUMAN, 6);
  const provider = new JsonRpcProvider(getRpcUrl());
  const testWallet = getTestUserWallet(provider);

  if (testWallet.address.toLowerCase() !== testUser.toLowerCase()) {
    throw new Error(
      `Configured faucet key (${testWallet.address}) does not match demo test user (${testUser})`
    );
  }

  const usdc = new Contract(usdcAddress, demoErc20Abi, testWallet);
  const [balance, allowance] = await Promise.all([
    withRpcRetry(() => usdc.balanceOf(testUser) as Promise<bigint>),
    withRpcRetry(() => usdc.allowance(testUser, recipient) as Promise<bigint>),
  ]);

  if (balance < amount) {
    throw new Error(`Test wallet USDC balance too low (${balance.toString()} wei)`);
  }

  if (allowance < amount) {
    const approveTx = await usdc.approve(recipient, MaxUint256);
    await approveTx.wait();
  }

  return {
    token: usdcAddress,
    from: testUser,
    to: recipient,
    amount: amount.toString(),
    amountHuman: FAUCET_USDC_HUMAN,
  };
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "Operation timed out"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Bound ethers tx.wait() so a stuck RPC cannot block the swap queue forever. */
export async function waitForReceipt(
  tx: { wait: (confirmations?: number) => Promise<unknown> },
  ms = 60_000
): Promise<ContractTransactionReceiptLike | null> {
  const receipt = await withTimeout(
    tx.wait() as Promise<ContractTransactionReceiptLike | null>,
    ms,
    "Transaction confirmation timed out"
  );
  return receipt;
}

export interface ContractTransactionReceiptLike {
  hash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

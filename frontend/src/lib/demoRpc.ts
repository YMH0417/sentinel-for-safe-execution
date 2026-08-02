/** Read-only JSON-RPC helpers against the demo chain RPC (not MetaMask). */

export async function rpcGetCode(rpcUrl: string, address: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getCode",
      params: [address, "latest"],
      id: 1,
    }),
  });
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error?.message) {
    throw new Error(`Demo RPC 错误: ${data.error.message}`);
  }
  return data.result ?? "0x";
}

export function isContractDeployed(code: string | null | undefined): boolean {
  return Boolean(code && code !== "0x" && code.length > 2);
}

export async function assertMetaMaskMatchesDemoRpc(params: {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  address: string;
  metaMaskCode: string;
  tokenSymbol?: string;
}): Promise<void> {
  const demoCode = await rpcGetCode(params.rpcUrl, params.address);
  const onDemo = isContractDeployed(demoCode);
  const onMetaMask = isContractDeployed(params.metaMaskCode);

  if (onDemo && onMetaMask) return;

  if (!onDemo && onMetaMask) {
    throw new Error(
      `Demo 链 (${params.rpcUrl}) 上找不到合约，但 MetaMask 当前网络有代码。请运行 .\\start-demo.ps1 重新部署，并确认 backend 指向正确 manifest。`
    );
  }

  if (onDemo && !onMetaMask) {
    const label = params.tokenSymbol ?? "合约";
    throw new Error(
      `${label} 在 Demo RPC (${params.rpcUrl}) 上存在，但 MetaMask 当前网络读不到（Chain ID ${params.chainId}）。` +
        `请添加/切换到「${params.chainName}」，RPC URL 必须为 ${params.rpcUrl}。` +
        `公网 Monad Testnet (10143) 与本地 Demo (Chain ID ${params.chainId}) 不能混用。`
    );
  }

  throw new Error(
    `${params.tokenSymbol ?? "代币"} 合约不存在（${params.address}）。请运行 .\\start-demo.ps1 -Profile anvil-local 重新部署。`
  );
}

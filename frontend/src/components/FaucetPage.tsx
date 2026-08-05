import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress } from "ethers";
import { api, type TokenBalance } from "../api/client";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { claimUsdcFromFaucet } from "../lib/demoFaucet";
import { formatTokenAmount, transferDemoToken } from "../lib/tokenSupply";
import type { DemoTokenMeta } from "../lib/wallet";

const MONAD_FAUCET_URL = "https://faucet.monad.xyz/";
const TRANSFER_TOKEN_ORDER = ["USDC", "GOOD", "BAD", "BAIT"] as const;

const MONAD_TESTNET = {
  name: "Monad Testnet",
  chainId: 10143,
  nativeSymbol: "MON",
  rpcUrl: "https://testnet-rpc.monad.xyz",
};

export function FaucetPage() {
  const { account, connectWallet } = useWallet();
  const { showToast } = useToast();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetError, setFaucetError] = useState("");

  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmounts, setTransferAmounts] = useState<Record<string, string>>({});
  const [transferBalances, setTransferBalances] = useState<Record<string, TokenBalance>>({});
  const [transferTokens, setTransferTokens] = useState<DemoTokenMeta[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMsg, setTransferMsg] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferBusySymbol, setTransferBusySymbol] = useState<string | null>(null);

  const refreshTransferBalances = useCallback(async (holder: string) => {
    setTransferLoading(true);
    try {
      const checksum = getAddress(holder);
      const [balanceRes, tokensRes] = await Promise.all([
        api.balances(checksum),
        fetch("/api/demo/tokens").then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "无法加载 demo 代币");
          return data as { tokens: DemoTokenMeta[] };
        }),
      ]);
      setTransferBalances(balanceRes.balances);
      setTransferTokens(tokensRes.tokens ?? []);
    } catch {
      setTransferBalances({});
      setTransferTokens([]);
    } finally {
      setTransferLoading(false);
    }
  }, []);

  useEffect(() => {
    if (account) {
      void refreshTransferBalances(account);
    } else {
      setTransferBalances({});
      setTransferTokens([]);
    }
  }, [account, refreshTransferBalances]);

  const transferTokenRows = useMemo(() => {
    const bySymbol = new Map(transferTokens.map((token) => [token.symbol, token]));
    return TRANSFER_TOKEN_ORDER.map((symbol) => bySymbol.get(symbol)).filter(
      (token): token is DemoTokenMeta => !!token
    );
  }, [transferTokens]);

  const claimFaucetUsdc = async () => {
    if (!account) {
      setFaucetError("请先连接 MetaMask");
      return;
    }
    setFaucetBusy(true);
    setFaucetError("");
    try {
      await claimUsdcFromFaucet(account);
      showToast({ type: "success", message: "已领取 10,000 DEMO USDC" });
      await refreshTransferBalances(account);
    } catch (e) {
      setFaucetError(e instanceof Error ? e.message : "领取失败");
    } finally {
      setFaucetBusy(false);
    }
  };

  const handleTransfer = async (symbol: string, tokenAddress: string, decimals: number) => {
    const recipient = transferRecipient.trim();
    const amount = transferAmounts[symbol]?.trim();
    if (!recipient) {
      setTransferError("请输入收款地址");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setTransferError("请输入有效的转账数量");
      return;
    }
    if (!account) {
      setTransferError("请先连接 MetaMask 后再转账");
      return;
    }
    try {
      getAddress(recipient);
    } catch {
      setTransferError("收款地址格式无效");
      return;
    }

    setTransferBusySymbol(symbol);
    setTransferError("");
    setTransferMsg("");
    try {
      const txHash = await transferDemoToken({
        tokenAddress,
        recipient,
        amountHuman: amount,
        decimals,
      });
      setTransferMsg(`${symbol} 转账成功：${txHash.slice(0, 10)}…`);
      await refreshTransferBalances(account);
      setTransferAmounts((prev) => ({ ...prev, [symbol]: "" }));
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : "转账失败");
    } finally {
      setTransferBusySymbol(null);
    }
  };

  return (
    <div className="testnet-assets-page">
      <div className="sentinel-card testnet-chain-strip">
        <div className="testnet-chain-strip-title">
          <span className="sentinel-label">网络环境</span>
          <strong className="testnet-chain-name">{MONAD_TESTNET.name}</strong>
        </div>
        <div className="testnet-chain-stats">
          <div className="testnet-chain-stat">
            <span>链 ID</span>
            <strong>{MONAD_TESTNET.chainId}</strong>
          </div>
          <div className="testnet-chain-stat">
            <span>原生代币</span>
            <strong>{MONAD_TESTNET.nativeSymbol}</strong>
          </div>
          <div className="testnet-chain-stat testnet-chain-stat--rpc">
            <span>RPC</span>
            <code>{MONAD_TESTNET.rpcUrl}</code>
          </div>
        </div>
      </div>

      <div className="testnet-assets-main">
        <div className="testnet-assets-side">
          <div className="sentinel-card testnet-action-card">
            <div className="testnet-action-head">
              <div className="sentinel-label">官方 Gas 水龙头</div>
              <span className="testnet-tag">MON</span>
            </div>
            <p className="testnet-action-hint">
              领取测试网原生代币，用于支付 swap、授权等操作的 Gas。
            </p>
            <a
              href={MONAD_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="testnet-external-link"
            >
              {MONAD_FAUCET_URL}
            </a>
            <a
              href={MONAD_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sentinel-btn sentinel-btn-primary testnet-action-btn"
              style={{ textDecoration: "none" }}
            >
              打开官方水龙头
            </a>
          </div>

          <div className="sentinel-card testnet-action-card">
            <div className="testnet-action-head">
              <div className="sentinel-label">Demo USDC 领取</div>
              <span className="testnet-tag testnet-tag--usdc">USDC</span>
            </div>
            <p className="testnet-action-hint">
              领取 10,000 demo USDC；需在 MetaMask 确认并支付 Gas。
            </p>
            {!account ? (
              <button type="button" className="sentinel-btn testnet-action-btn" onClick={() => connectWallet().catch(() => undefined)}>
                连接 MetaMask
              </button>
            ) : (
              <>
                <p className="testnet-wallet-line">
                  已连接 <code>{account}</code>
                </p>
                <button
                  type="button"
                  className="sentinel-btn sentinel-btn-primary testnet-action-btn"
                  onClick={() => void claimFaucetUsdc()}
                  disabled={faucetBusy}
                >
                  {faucetBusy ? "领取中" : "领取 10,000 USDC"}
                </button>
              </>
            )}
            {faucetError ? <p className="testnet-msg-err">{faucetError}</p> : null}
          </div>
        </div>

        <div className="sentinel-card testnet-transfer-card">
          <div className="sentinel-label">代币转账</div>
          <p className="testnet-action-hint">
            用当前钱包向任意地址发送 demo ERC20（USDC / GOOD / BAD / BAIT）。
          </p>

          <div className="testnet-transfer-toolbar">
            {!account ? (
              <button type="button" className="sentinel-btn" onClick={() => connectWallet().catch(() => undefined)}>
                连接 MetaMask
              </button>
            ) : null}
            <label className="sentinel-field testnet-recipient-field">
              <span className="sentinel-field-label">收款地址</span>
              <input
                type="text"
                className="sentinel-input"
                placeholder="0x…"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                disabled={!account}
              />
            </label>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-secondary"
              onClick={() => account && void refreshTransferBalances(account)}
              disabled={!account || transferLoading}
            >
              {transferLoading ? "刷新中" : "刷新余额"}
            </button>
          </div>

          {transferMsg ? <p className="testnet-msg-ok">{transferMsg}</p> : null}
          {transferError ? <p className="testnet-msg-err">{transferError}</p> : null}

          {transferTokenRows.length > 0 ? (
            <div className="scroll-hidden testnet-transfer-table-wrap">
              <table className="testnet-transfer-table">
                <thead>
                  <tr>
                    <th>代币</th>
                    <th>余额</th>
                    <th>转账</th>
                  </tr>
                </thead>
                <tbody>
                  {transferTokenRows.map((token) => {
                    const rowBusy = transferBusySymbol === token.symbol;
                    const balance = transferBalances[token.symbol]?.human ?? 0;
                    return (
                      <tr key={token.symbol}>
                        <td className="testnet-transfer-symbol">{token.symbol}</td>
                        <td>{formatTokenAmount(balance, token.decimals)}</td>
                        <td>
                          <div className="settings-inline-controls testnet-transfer-controls">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="数量"
                              value={transferAmounts[token.symbol] ?? ""}
                              onChange={(e) =>
                                setTransferAmounts((prev) => ({
                                  ...prev,
                                  [token.symbol]: e.target.value,
                                }))
                              }
                              disabled={!account || rowBusy}
                              className="sentinel-input sentinel-input-compact"
                            />
                            <button
                              type="button"
                              className="sentinel-btn sentinel-btn-secondary"
                              disabled={!account || rowBusy}
                              onClick={() => void handleTransfer(token.symbol, token.address, token.decimals)}
                            >
                              {rowBusy ? "转账中" : "转账"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="testnet-muted">{account ? "暂无代币数据" : "连接钱包后查看余额"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

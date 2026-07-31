import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress } from "ethers";
import { api, type DebugStatus } from "../api/client";
import { useWallet } from "../contexts/WalletContext";
import { DEMO_TEST_USER } from "../lib/demoConstants";
import {
  burnDemoToken,
  burnDemoTokenFromPool,
  decimalsForSymbol,
  fetchDemoSupplyOverview,
  formatTokenAmount,
  mintDemoToken,
  mintDemoTokenToPool,
  type DemoSupplyOverview,
  type PoolReserveRow,
} from "../lib/tokenSupply";

type TokenAction = "mint" | "burn";
type BusyTarget = { scope: "wallet" | "pool"; id: string; action: TokenAction };

export function SettingsPage() {
  const { account, connectWallet } = useWallet();
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState("");
  const [supply, setSupply] = useState<DemoSupplyOverview | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const [supplyError, setSupplyError] = useState("");
  const [scenarioDeployer, setScenarioDeployer] = useState("");
  const [amounts, setAmounts] = useState<Record<string, { mint: string; burn: string }>>({});
  const [poolAmounts, setPoolAmounts] = useState<Record<string, { mint: string; burn: string }>>({});
  const [busy, setBusy] = useState<BusyTarget | null>(null);
  const [selectedPoolRoute, setSelectedPoolRoute] = useState("");
  const [poolFilter, setPoolFilter] = useState("");

  const isDemoMode = status?.chainMode === "demo";
  const connectedIsTestUser = useMemo(() => {
    if (!account) return false;
    try {
      return getAddress(account).toLowerCase() === DEMO_TEST_USER.toLowerCase();
    } catch {
      return false;
    }
  }, [account]);

  const refreshSupply = useCallback(async (holder: string) => {
    setSupplyLoading(true);
    setSupplyError("");
    try {
      const overview = await fetchDemoSupplyOverview(holder);
      setSupply(overview);
      setScenarioDeployer(overview.scenarioDeployer);
    } catch (e) {
      setSupply(null);
      setSupplyError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setSupplyLoading(false);
    }
  }, []);

  useEffect(() => {
    api.debugStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!isDemoMode) return;
    const holder = connectedIsTestUser && account ? account : DEMO_TEST_USER;
    refreshSupply(holder);
  }, [isDemoMode, connectedIsTestUser, account, refreshSupply]);

  const clearEvents = async () => {
    setClearing(true);
    setMsg("");
    try {
      const res = await fetch("/api/events/clear", { method: "POST" });
      if (!res.ok) throw new Error("清除失败");
      setMsg("事件日志已清空");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "清除失败");
    } finally {
      setClearing(false);
    }
  };

  const canOperate = connectedIsTestUser && !!supply?.testUserIsAuthorizedMinter;

  const setTokenAmount = (symbol: string, field: "mint" | "burn", value: string) => {
    setAmounts((prev) => ({
      ...prev,
      [symbol]: { mint: prev[symbol]?.mint ?? "", burn: prev[symbol]?.burn ?? "", [field]: value },
    }));
  };

  const poolAmountKey = (routeName: string, tokenSide: "0" | "1") =>
    `${routeName}::token${tokenSide}`;

  const setPoolTokenAmount = (
    routeName: string,
    tokenSide: "0" | "1",
    field: "mint" | "burn",
    value: string
  ) => {
    const key = poolAmountKey(routeName, tokenSide);
    setPoolAmounts((prev) => ({
      ...prev,
      [key]: { mint: prev[key]?.mint ?? "", burn: prev[key]?.burn ?? "", [field]: value },
    }));
  };

  const handleMint = async (symbol: string, tokenAddress: string, decimals: number) => {
    const amount = amounts[symbol]?.mint?.trim();
    if (!amount || Number(amount) <= 0) {
      setSupplyError("请输入有效的增发数量");
      return;
    }
    if (!connectedIsTestUser || !account) {
      setSupplyError("请使用测试钱包连接 MetaMask 后再增发");
      return;
    }
    if (!scenarioDeployer) {
      setSupplyError("ScenarioDeployer 未加载");
      return;
    }

    setBusy({ scope: "wallet", id: symbol, action: "mint" });
    setSupplyError("");
    try {
      const txHash = await mintDemoToken({
        tokenAddress,
        recipient: account,
        amountHuman: amount,
        decimals,
        scenarioDeployer,
      });
      setMsg(`${symbol} 增发成功：${txHash.slice(0, 10)}…`);
      await refreshSupply(account);
      setTokenAmount(symbol, "mint", "");
    } catch (e) {
      setSupplyError(e instanceof Error ? e.message : "增发失败");
    } finally {
      setBusy(null);
    }
  };

  const handleBurn = async (symbol: string, tokenAddress: string, decimals: number) => {
    const amount = amounts[symbol]?.burn?.trim();
    if (!amount || Number(amount) <= 0) {
      setSupplyError("请输入有效的销毁数量");
      return;
    }
    if (!connectedIsTestUser || !account) {
      setSupplyError("请使用测试钱包连接 MetaMask 后再销毁");
      return;
    }

    setBusy({ scope: "wallet", id: symbol, action: "burn" });
    setSupplyError("");
    try {
      const txHash = await burnDemoToken({
        tokenAddress,
        amountHuman: amount,
        decimals,
      });
      setMsg(`${symbol} 销毁成功：${txHash.slice(0, 10)}…`);
      await refreshSupply(account);
      setTokenAmount(symbol, "burn", "");
    } catch (e) {
      setSupplyError(e instanceof Error ? e.message : "销毁失败");
    } finally {
      setBusy(null);
    }
  };

  const handlePoolMint = async (
    pool: PoolReserveRow,
    tokenSide: "0" | "1",
    tokenAddress: string,
    symbol: string
  ) => {
    const key = poolAmountKey(pool.routeName, tokenSide);
    const amount = poolAmounts[key]?.mint?.trim();
    const decimals = decimalsForSymbol(symbol);
    if (!amount || Number(amount) <= 0) {
      setSupplyError("请输入有效的池子增发数量");
      return;
    }
    if (!canOperate || !account || !scenarioDeployer) {
      setSupplyError("请使用测试钱包连接 MetaMask 后再操作");
      return;
    }

    setBusy({ scope: "pool", id: key, action: "mint" });
    setSupplyError("");
    try {
      const txHash = await mintDemoTokenToPool({
        tokenAddress,
        pairAddress: pool.pair,
        amountHuman: amount,
        decimals,
        scenarioDeployer,
      });
      setMsg(`池子 ${pool.routeName} ${symbol} 增发成功：${txHash.slice(0, 10)}…`);
      await refreshSupply(account);
      setPoolTokenAmount(pool.routeName, tokenSide, "mint", "");
    } catch (e) {
      setSupplyError(e instanceof Error ? e.message : "池子增发失败");
    } finally {
      setBusy(null);
    }
  };

  const handlePoolBurn = async (
    pool: PoolReserveRow,
    tokenSide: "0" | "1",
    tokenAddress: string,
    symbol: string
  ) => {
    const key = poolAmountKey(pool.routeName, tokenSide);
    const amount = poolAmounts[key]?.burn?.trim();
    const decimals = decimalsForSymbol(symbol);
    if (!amount || Number(amount) <= 0) {
      setSupplyError("请输入有效的池子销毁数量");
      return;
    }
    if (!canOperate || !account || !scenarioDeployer) {
      setSupplyError("请使用测试钱包连接 MetaMask 后再操作");
      return;
    }

    setBusy({ scope: "pool", id: key, action: "burn" });
    setSupplyError("");
    try {
      const txHash = await burnDemoTokenFromPool({
        tokenAddress,
        pairAddress: pool.pair,
        amountHuman: amount,
        decimals,
        scenarioDeployer,
      });
      setMsg(`池子 ${pool.routeName} ${symbol} 销毁成功：${txHash.slice(0, 10)}…`);
      await refreshSupply(account);
      setPoolTokenAmount(pool.routeName, tokenSide, "burn", "");
    } catch (e) {
      setSupplyError(e instanceof Error ? e.message : "池子销毁失败");
    } finally {
      setBusy(null);
    }
  };

  const filteredPools = useMemo(() => {
    if (!supply?.pools) return [];
    const q = poolFilter.trim().toLowerCase();
    if (!q) return supply.pools;
    return supply.pools.filter(
      (p) =>
        p.routeName.toLowerCase().includes(q) ||
        p.pair.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q)
    );
  }, [supply?.pools, poolFilter]);

  const selectedPool = useMemo(() => {
    if (!supply?.pools?.length) return null;
    const route = selectedPoolRoute || supply.pools[0]?.routeName;
    return supply.pools.find((p) => p.routeName === route) ?? supply.pools[0];
  }, [supply?.pools, selectedPoolRoute]);

  useEffect(() => {
    if (supply?.pools?.length && !selectedPoolRoute) {
      setSelectedPoolRoute(supply.pools[0].routeName);
    }
  }, [supply?.pools, selectedPoolRoute]);

  const renderPoolTokenRow = (
    pool: PoolReserveRow,
    tokenSide: "0" | "1",
    symbol: string,
    address: string,
    reserveHuman: number
  ) => {
    const key = poolAmountKey(pool.routeName, tokenSide);
    const mintBusy = busy?.scope === "pool" && busy.id === key && busy.action === "mint";
    const burnBusy = busy?.scope === "pool" && busy.id === key && busy.action === "burn";
    const decimals = decimalsForSymbol(symbol);
    return (
      <tr key={key} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <td style={{ padding: "10px 6px", fontWeight: 600 }}>{symbol}</td>
        <td style={{ padding: "10px 6px" }}>
          {formatTokenAmount(reserveHuman, decimals)}
        </td>
        <td style={{ padding: "10px 6px" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="数量"
              value={poolAmounts[key]?.mint ?? ""}
              onChange={(e) => setPoolTokenAmount(pool.routeName, tokenSide, "mint", e.target.value)}
              disabled={!canOperate || mintBusy}
              style={{ width: 88, padding: "6px 8px", fontSize: 13 }}
            />
            <button
              type="button"
              className="sentinel-btn sentinel-btn-secondary"
              disabled={!canOperate || mintBusy}
              onClick={() => handlePoolMint(pool, tokenSide, address, symbol)}
            >
              {mintBusy ? "…" : "增发"}
            </button>
          </div>
        </td>
        <td style={{ padding: "10px 6px" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="数量"
              value={poolAmounts[key]?.burn ?? ""}
              onChange={(e) => setPoolTokenAmount(pool.routeName, tokenSide, "burn", e.target.value)}
              disabled={!canOperate || burnBusy}
              style={{ width: 88, padding: "6px 8px", fontSize: 13 }}
            />
            <button
              type="button"
              className="sentinel-btn sentinel-btn-danger"
              disabled={!canOperate || burnBusy}
              onClick={() => handlePoolBurn(pool, tokenSide, address, symbol)}
            >
              {burnBusy ? "…" : "销毁"}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <h2 className="sentinel-title">设置</h2>

      <div className="sentinel-grid-2">
        <div className="sentinel-card">
          <div className="sentinel-label">网络环境</div>
          {status ? (
            <ul style={{ listStyle: "none", fontSize: 14, lineHeight: 2 }}>
              <li>模式：<strong>{status.chainMode}</strong></li>
              <li>链 ID：<strong>{status.expectedChainId ?? "—"}</strong></li>
              <li>链名称：<strong>{status.chainName ?? "—"}</strong></li>
              <li>RPC：<code style={{ fontSize: 12 }}>{status.anvilRpcUrl ?? "—"}</code></li>
              <li>Router Swap：<strong style={{ color: status.routerSwapAvailable ? "var(--green)" : "var(--red)" }}>{status.routerSwapAvailable ? "可用" : "不可用"}</strong></li>
            </ul>
          ) : (
            <p style={{ color: "var(--text-dim)" }}>无法读取 backend 状态</p>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">开发者</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            清空内存 + JSONL 事件日志（仅本地 demo 使用）。
          </p>
          <button type="button" className="sentinel-btn sentinel-btn-danger" onClick={clearEvents} disabled={clearing}>
            {clearing ? "清除中..." : "清空事件日志"}
          </button>
          {msg && <p style={{ marginTop: 12, fontSize: 13, color: "var(--green)" }}>{msg}</p>}
        </div>
      </div>

      {isDemoMode && (
        <div className="sentinel-card" style={{ marginTop: 20 }}>
          <div className="sentinel-label">代币增发 / 销毁（测试钱包专用）</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            仅授权钱包 <code>{DEMO_TEST_USER}</code> 可连接 MetaMask 操作。
            支持对<strong>测试钱包余额</strong>和<strong>各池子储备</strong>分别增发或销毁；其他钱包登录后按钮不可用。
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {!account ? (
              <button type="button" className="sentinel-btn" onClick={() => connectWallet().catch(() => undefined)}>
                连接 MetaMask
              </button>
            ) : (
              <span style={{ fontSize: 13 }}>
                已连接：<code>{account}</code>
                {connectedIsTestUser ? (
                  <strong style={{ color: "var(--green)", marginLeft: 8 }}>✓ 测试钱包</strong>
                ) : (
                  <strong style={{ color: "var(--red)", marginLeft: 8 }}>非授权钱包，无法增发/销毁</strong>
                )}
              </span>
            )}
            <button
              type="button"
              className="sentinel-btn sentinel-btn-secondary"
              onClick={() => refreshSupply(account ?? DEMO_TEST_USER)}
              disabled={supplyLoading}
            >
              {supplyLoading ? "刷新中..." : "刷新余额"}
            </button>
          </div>

          {supply && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              ScenarioDeployer：<code>{supply.scenarioDeployer}</code>
              {" · "}
              增发权限：
              <strong style={{ color: supply.testUserIsAuthorizedMinter ? "var(--green)" : "var(--red)" }}>
                {supply.testUserIsAuthorizedMinter ? "已授权" : "未授权（需重新部署）"}
              </strong>
            </p>
          )}

          {supplyError && (
            <p style={{ fontSize: 13, color: "var(--red)", marginBottom: 12 }}>{supplyError}</p>
          )}

          {supply?.tokens && (
            <>
              <h3 style={{ fontSize: 14, margin: "20px 0 10px", color: "var(--text-muted)" }}>
                测试钱包代币
              </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "8px 6px" }}>代币</th>
                    <th style={{ padding: "8px 6px" }}>合约地址</th>
                    <th style={{ padding: "8px 6px" }}>钱包余额</th>
                    <th style={{ padding: "8px 6px" }}>总供应量</th>
                    <th style={{ padding: "8px 6px" }}>增发</th>
                    <th style={{ padding: "8px 6px" }}>销毁</th>
                  </tr>
                </thead>
                <tbody>
                  {supply.tokens.map((token) => {
                    const mintBusy =
                      busy?.scope === "wallet" && busy.id === token.symbol && busy.action === "mint";
                    const burnBusy =
                      busy?.scope === "wallet" && busy.id === token.symbol && busy.action === "burn";
                    const disabled = !canOperate;
                    return (
                      <tr key={token.symbol} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "10px 6px", fontWeight: 600 }}>{token.symbol}</td>
                        <td style={{ padding: "10px 6px" }}>
                          <code style={{ fontSize: 11 }}>{token.address}</code>
                        </td>
                        <td style={{ padding: "10px 6px" }}>
                          {formatTokenAmount(token.holderBalanceHuman, token.decimals)}
                        </td>
                        <td style={{ padding: "10px 6px" }}>
                          {formatTokenAmount(token.totalSupplyHuman, token.decimals)}
                        </td>
                        <td style={{ padding: "10px 6px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="数量"
                              value={amounts[token.symbol]?.mint ?? ""}
                              onChange={(e) => setTokenAmount(token.symbol, "mint", e.target.value)}
                              disabled={disabled || mintBusy}
                              style={{ width: 88, padding: "6px 8px", fontSize: 13 }}
                            />
                            <button
                              type="button"
                              className="sentinel-btn sentinel-btn-secondary"
                              disabled={disabled || mintBusy}
                              onClick={() => handleMint(token.symbol, token.address, token.decimals)}
                            >
                              {mintBusy ? "…" : "增发"}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: "10px 6px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="数量"
                              value={amounts[token.symbol]?.burn ?? ""}
                              onChange={(e) => setTokenAmount(token.symbol, "burn", e.target.value)}
                              disabled={disabled || burnBusy}
                              style={{ width: 88, padding: "6px 8px", fontSize: 13 }}
                            />
                            <button
                              type="button"
                              className="sentinel-btn sentinel-btn-danger"
                              disabled={disabled || burnBusy}
                              onClick={() => handleBurn(token.symbol, token.address, token.decimals)}
                            >
                              {burnBusy ? "…" : "销毁"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {selectedPool && (
            <>
              <h3 style={{ fontSize: 14, margin: "24px 0 10px", color: "var(--text-muted)" }}>
                池子储备
              </h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                  选择池子
                  <select
                    value={selectedPool.routeName}
                    onChange={(e) => setSelectedPoolRoute(e.target.value)}
                    style={{ minWidth: 280, padding: "8px 10px", fontSize: 13 }}
                  >
                    {filteredPools.map((pool) => (
                      <option key={pool.routeName} value={pool.routeName}>
                        {pool.routeName} ({pool.label})
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  placeholder="筛选 route / label"
                  value={poolFilter}
                  onChange={(e) => setPoolFilter(e.target.value)}
                  style={{ alignSelf: "flex-end", width: 220, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                Pair：<code>{selectedPool.pair}</code>
                {" · "}
                {selectedPool.tokenIn} → {selectedPool.tokenOut}
                {" · "}
                {selectedPool.label}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 6px" }}>池内代币</th>
                      <th style={{ padding: "8px 6px" }}>当前储备</th>
                      <th style={{ padding: "8px 6px" }}>增发</th>
                      <th style={{ padding: "8px 6px" }}>销毁</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderPoolTokenRow(
                      selectedPool,
                      "0",
                      selectedPool.token0Symbol,
                      selectedPool.token0,
                      selectedPool.reserve0Human
                    )}
                    {renderPoolTokenRow(
                      selectedPool,
                      "1",
                      selectedPool.token1Symbol,
                      selectedPool.token1,
                      selectedPool.reserve1Human
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

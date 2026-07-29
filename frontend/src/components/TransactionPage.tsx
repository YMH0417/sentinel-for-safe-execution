import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { encodeBytes32String, getAddress } from "ethers";
import { ensureUserTokenReady } from "../lib/demoSwap";
import { fetchDemoToken, fetchSwapRouterAddress } from "../lib/wallet";
import { AccountCard } from "./shared/AccountCard";
import { SecurityGauge } from "./shared/SecurityGauge";
import { SafetyPanel } from "./SafetyPanel";
import type {
  Route as RouteType,
  Decision,
  ExecutionPermit,
  ContractDecision,
  SwapResult,
} from "../types";

const API_BASE = "/api";
const PAGE_SIZE = 5;

interface Props {
  safeMode: boolean;
}

function generateDummySignature(): string {
  return "0x" + "12".repeat(65);
}

function buildSafeRouteId(tokenIn: string, tokenOut: string): string {
  return `route-${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}-safe`;
}

function riskLevel(score: number): "low" | "moderate" | "high" {
  if (score > 50) return "high";
  if (score > 25) return "moderate";
  return "low";
}

export function TransactionPage({ safeMode }: Props) {
  const navigate = useNavigate();
  const { account, connectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("GOOD");
  const [amount, setAmount] = useState("100");
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("route-good-safe");
  const [quoteMeta, setQuoteMeta] = useState<{ referencePrice?: number; recommendedRouteId?: string }>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [recommendedRouteId, setRecommendedRouteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const selectedRouteData = routes.find((r) => r.routeId === selectedRoute);
  const gaugeScore = decision
    ? Math.max(0, 100 - decision.riskScore)
    : selectedRouteData
      ? Math.max(0, 100 - selectedRouteData.poolRiskScore)
      : 72;

  const loadRoutes = async () => {
    setLoading("Loading routes...");
    try {
      const res = await fetch(`${API_BASE}/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quote failed");
      setRoutes(data.routes);
      setQuoteMeta({
        referencePrice: data.referencePrice,
        recommendedRouteId: data.recommendedRouteId,
      });
      const recommended = data.recommendedRouteId ?? data.routes[0]?.routeId;
      if (recommended) setSelectedRoute(recommended);
      setPage(0);
      setDecision(null);
      setError("");
    } catch (e: unknown) {
      setError(`Failed to load routes: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading("");
  };

  const evaluateRoute = async (routeId?: string): Promise<Decision | null> => {
    const target = routeId ?? selectedRoute;
    if (!target) return null;
    setLoading("Evaluating route with Safety Agent...");
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: target,
          configProfile: "normal",
          tokenIn,
          tokenOut,
          amountIn: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Evaluate failed");
      setDecision(data);
      if (data.decision === "FALLBACK_TO_SAFE_ROUTE" && data.fallbackRouteId) {
        setRecommendedRouteId(data.fallbackRouteId);
      } else {
        setRecommendedRouteId(null);
      }
      return data as Decision;
    } catch (e: unknown) {
      setError(`Evaluate failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setLoading("");
    }
  };

  const switchToFallbackRoute = async (fallbackRouteId: string) => {
    setSelectedRoute(fallbackRouteId);
    setRecommendedRouteId(fallbackRouteId);
    await evaluateRoute(fallbackRouteId);
  };

  const getChainMode = async (): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/debug/status`);
      const data = await res.json();
      return data.chainMode ?? "mock";
    } catch {
      return "mock";
    }
  };

  const getNonce = async (user: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/execute/nonce?user=${encodeURIComponent(user)}`);
    const data = await res.json();
    return String(data.nonce);
  };

  const executeDemoSwap = async (routeId: string, force: boolean): Promise<SwapResult> => {
    if (!account) throw new Error("请先连接 MetaMask 钱包");
    const checksumAddr = getAddress(account);

    const [tokenMeta, swapRouter] = await Promise.all([
      fetchDemoToken(tokenIn),
      fetchSwapRouterAddress(),
    ]);

    await ensureUserTokenReady({
      owner: checksumAddr,
      tokenAddress: tokenMeta.address,
      tokenSymbol: tokenMeta.symbol,
      tokenDecimals: tokenMeta.decimals,
      spender: swapRouter,
      amountHuman: amount,
    });

    const endpoint = force ? `${API_BASE}/swap/force` : `${API_BASE}/swap/safe`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeId,
        amountIn: Number(amount),
        tokenIn,
        tokenOut,
        recipient: checksumAddr,
        configProfile: "normal",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || data.error || JSON.stringify(data);
      throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
    }
    return data as SwapResult;
  };

  const executeMockVault = async (activeDecision: Decision) => {
    if (!account) throw new Error("链上执行需要连接 MetaMask 钱包");
    const effectiveRouteId =
      activeDecision.decision === "FALLBACK_TO_SAFE_ROUTE" && activeDecision.fallbackRouteId
        ? activeDecision.fallbackRouteId
        : selectedRoute;

    const route = routes.find((r) => r.routeId === effectiveRouteId);
    if (!route) throw new Error(`Route ${effectiveRouteId} not found`);

    const contractDecisionMap: Record<string, ContractDecision> = {
      ALLOW: 0,
      REJECT: 1,
      FALLBACK_TO_SAFE_ROUTE: 2,
    };

    const checksumAddr = getAddress(account);
    const nonce = await getNonce(checksumAddr);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const permit: ExecutionPermit = {
      user: checksumAddr,
      routeId: encodeBytes32String(effectiveRouteId),
      amountIn: String(route.amountIn),
      amountOutQuoted: String(route.quotedOut),
      deadline: String(deadline),
      riskScore: String(activeDecision.riskScore),
      decision: contractDecisionMap[activeDecision.decision],
      nonce,
    };

    const res = await fetch(`${API_BASE}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluation: {
          decision: activeDecision.decision,
          riskScore: activeDecision.riskScore,
          reason: activeDecision.reason,
          routeId: activeDecision.routeId,
          fallbackRouteId: activeDecision.fallbackRouteId,
          flags: activeDecision.flags,
        },
        permit,
        signature: generateDummySignature(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || data.error?.reason || JSON.stringify(data);
      throw new Error(errMsg);
    }
    return data;
  };

  const executeRoute = async (activeDecision?: Decision | null) => {
    const evalDecision = activeDecision ?? decision;
    if (!evalDecision && safeMode) return;
    if (!account) {
      setError("链上执行需要连接 MetaMask 钱包。您仍可游客预览报价与风险评估。");
      showToast({ type: "error", message: "请先连接 MetaMask 再执行链上交易" });
      return;
    }

    setLoading("Executing route on-chain...");
    try {
      const chainMode = await getChainMode();
      const routeId = selectedRoute;

      if (chainMode === "demo") {
        const swap = await executeDemoSwap(routeId, !safeMode);
        const finalDecision =
          evalDecision ?? {
            decision: swap.agentDecision ?? "ALLOW",
            riskScore: 0,
            reason: "Swap executed",
            routeId: swap.requestedRouteId ?? routeId,
            fallbackRouteId:
              swap.executedRouteId !== swap.requestedRouteId ? swap.executedRouteId ?? null : null,
            flags: [],
          };
        setDecision(finalDecision);
        showToast({ type: "success", message: "Swap executed successfully" });
        navigate("/execution", { state: { swap, decision: finalDecision } });
        return;
      }

      if (!evalDecision) throw new Error("Evaluate the route before executing in mock mode");
      const data = await executeMockVault(evalDecision);
      showToast({ type: "success", message: "Execution completed" });
      navigate("/execution", {
        state: {
          swap: {
            success: true,
            routeId: selectedRoute,
            tokenIn,
            tokenOut,
            amountIn: Number(amount),
            quotedOut: selectedRouteData?.quotedOut ?? 0,
            actualOut: selectedRouteData?.quotedOut ?? 0,
            txHash: data.event?.txHash ?? "",
            recipient: account,
          } as SwapResult,
          decision: evalDecision,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Execute failed";
      setError(`Execute failed: ${msg}`);
      showToast({ type: "error", message: `Execution failed: ${msg}` });
    } finally {
      setLoading("");
    }
  };

  const runFullFlow = async () => {
    setLoading("Running full flow...");
    setError("");

    await loadRoutes();
    await new Promise((r) => setTimeout(r, 300));

    let latestDecision = await evaluateRoute();
    await new Promise((r) => setTimeout(r, 300));

    if (latestDecision?.decision === "REJECT" && safeMode) {
      const safeRouteId = buildSafeRouteId(tokenIn, tokenOut);
      const safeRoute = routes.find((r) => r.routeId === safeRouteId);
      if (safeRoute) {
        setSelectedRoute(safeRoute.routeId);
        latestDecision = await evaluateRoute(safeRoute.routeId);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    await executeRoute(latestDecision);
    setLoading("");
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "MetaMask 已连接并切换到本地链" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "连接失败";
      setError(msg);
      showToast({ type: "error", message: msg });
    }
  };

  const pageCount = Math.max(1, Math.ceil(routes.length / PAGE_SIZE));
  const pagedRoutes = routes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <AccountCard />

      {!account && (
        <div
          className="sentinel-card"
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            borderColor: "rgba(88, 166, 255, 0.35)",
            background: "rgba(88, 166, 255, 0.06)",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            执行链上 swap 需先用 MetaMask 连接钱包（将自动切换到 Anvil 本地链）
          </span>
          <button
            type="button"
            className="sentinel-btn sentinel-btn-primary"
            onClick={handleConnectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? "连接中..." : "连接 MetaMask"}
          </button>
        </div>
      )}

      <div className="sentinel-tx-grid">
        <div className="sentinel-card">
          <div className="sentinel-label">Swap 参数</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Token In</label>
              <select className="sentinel-select" value={tokenIn} onChange={(e) => setTokenIn(e.target.value)}>
                {["USDC", "GOOD", "BAD", "BAIT"].map((t) => (
                  <option key={t} value={t} disabled={t === tokenOut}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Token Out</label>
              <select className="sentinel-select" value={tokenOut} onChange={(e) => setTokenOut(e.target.value)}>
                {["USDC", "GOOD", "BAD", "BAIT"].map((t) => (
                  <option key={t} value={t} disabled={t === tokenIn}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Amount</label>
              <input className="sentinel-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <button type="button" className="sentinel-btn sentinel-btn-secondary" onClick={loadRoutes} disabled={!!loading}>
              {loading === "Loading routes..." ? "加载中..." : "获取报价"}
            </button>
          </div>
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">风险指标</div>
          <div className="sentinel-grid-2" style={{ marginBottom: 16 }}>
            <RiskIndicator
              label="池子风险"
              value={selectedRouteData?.poolRiskScore ?? "—"}
              level={selectedRouteData ? riskLevel(selectedRouteData.poolRiskScore) : "low"}
            />
            <RiskIndicator
              label="报价偏差"
              value={selectedRouteData?.warningFlags.includes("quote_deviation") ? "高" : "低"}
              level={selectedRouteData?.warningFlags.includes("quote_deviation") ? "high" : "low"}
            />
            <RiskIndicator
              label="Agent 决策"
              value={decision?.decision ?? "待评估"}
              level={
                decision?.decision === "REJECT"
                  ? "high"
                  : decision?.decision === "FALLBACK_TO_SAFE_ROUTE"
                    ? "moderate"
                    : "low"
              }
            />
            <RiskIndicator
              label="安全模式"
              value={safeMode ? "开启" : "关闭"}
              level={safeMode ? "low" : "high"}
            />
          </div>
          <SafetyPanel decision={decision} onSwitchToFallback={switchToFallbackRoute} />
        </div>

        <div className="sentinel-card">
          <SecurityGauge score={gaugeScore} size={120} label="路由安全分" />
          {quoteMeta.referencePrice !== undefined && (
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
              参考价: <strong style={{ color: "var(--text)" }}>{quoteMeta.referencePrice}</strong>
            </div>
          )}
        </div>
      </div>

      {routes.length > 0 && (
        <div className="sentinel-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div className="sentinel-label" style={{ margin: 0 }}>路由分析</div>
            {quoteMeta.recommendedRouteId && (
              <span className="sentinel-badge sentinel-badge-green">推荐: {quoteMeta.recommendedRouteId}</span>
            )}
          </div>
          <table className="sentinel-table">
            <thead>
              <tr>
                <th>路由</th>
                <th>输出</th>
                <th>预期</th>
                <th>风险分</th>
                <th>标记</th>
              </tr>
            </thead>
            <tbody>
              {pagedRoutes.map((route) => {
                const isSelected = route.routeId === selectedRoute;
                const isRecommended = (recommendedRouteId ?? quoteMeta.recommendedRouteId) === route.routeId;
                const rl = riskLevel(route.poolRiskScore);
                return (
                  <tr
                    key={route.routeId}
                    className={isSelected ? "selected" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedRoute(route.routeId);
                      setRecommendedRouteId(null);
                    }}
                  >
                    <td>
                      <strong>{route.label}</strong>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{route.routeId}</div>
                      {isRecommended && <span className="sentinel-badge sentinel-badge-green" style={{ marginTop: 4 }}>推荐</span>}
                    </td>
                    <td>{route.quotedOut}</td>
                    <td>{route.expectedOut}</td>
                    <td>
                      <span className={`sentinel-badge ${rl === "high" ? "sentinel-badge-red" : rl === "moderate" ? "sentinel-badge-yellow" : "sentinel-badge-green"}`}>
                        {route.poolRiskScore}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--red)" }}>
                      {route.warningFlags.length > 0 ? route.warningFlags.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button type="button" className="sentinel-btn sentinel-btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
                上一页
              </button>
              <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
                {page + 1} / {pageCount}
              </span>
              <button type="button" className="sentinel-btn sentinel-btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
                下一页
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-ghost"
              onClick={() => evaluateRoute()}
              disabled={!!loading || !selectedRoute}
            >
              {loading === "Evaluating route with Safety Agent..." ? "评估中..." : "风险评估"}
            </button>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-primary"
              onClick={runFullFlow}
              disabled={!!loading}
              style={{ flex: 1, minWidth: 200 }}
            >
              {loading && loading !== "Evaluating route with Safety Agent..." ? "Running..." : safeMode ? "一键完整流程（含执行）" : "无安全模式执行"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="sentinel-card"
          style={{
            marginTop: 16,
            borderColor: "var(--red)",
            background: "rgba(248, 81, 73, 0.08)",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function RiskIndicator({
  label,
  value,
  level,
}: {
  label: string;
  value: string | number;
  level: "low" | "moderate" | "high";
}) {
  const color = level === "high" ? "var(--red)" : level === "moderate" ? "var(--yellow)" : "var(--green)";
  return (
    <div style={{ padding: 12, background: "#0d1117", borderRadius: 8, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

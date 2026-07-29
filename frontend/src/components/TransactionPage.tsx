import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { encodeBytes32String, getAddress } from "ethers";
import { ensureUserTokenReady } from "../lib/demoSwap";
import { fetchDemoToken, fetchSwapRouterAddress } from "../lib/wallet";
import { InputPanel } from "./InputPanel";
import { RouteList } from "./RouteList";
import { SafetyPanel } from "./SafetyPanel";
import { ResultPanel } from "./ResultPanel";
import { Timeline } from "./Timeline";
import type {
  Route as RouteType,
  Decision,
  Event,
  ExecutionPermit,
  ContractDecision,
  SwapResult,
} from "../types";

const API_BASE = "/api";

interface Props {
  safeMode: boolean;
}

/** Generate a dummy 65-byte signature (mock mode only). */
function generateDummySignature(): string {
  return "0x" + "12".repeat(65);
}

function buildSafeRouteId(tokenIn: string, tokenOut: string): string {
  return `route-${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}-safe`;
}

export function TransactionPage({ safeMode }: Props) {
  const { account, connectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("GOOD");
  const [amount, setAmount] = useState("100");
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("route-good-safe");
  const [quoteMeta, setQuoteMeta] = useState<{ referencePrice?: number; recommendedRouteId?: string }>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [resultEvent, setResultEvent] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [recommendedRouteId, setRecommendedRouteId] = useState<string | null>(null);

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
      setError("");
    } catch (e: any) {
      setError(`Failed to load routes: ${e.message}`);
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
    } catch (e: any) {
      setError(`Evaluate failed: ${e.message}`);
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
    if (!account) {
      throw new Error("请先连接 MetaMask 钱包");
    }
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
    if (!account) {
      throw new Error("链上执行需要连接 MetaMask 钱包");
    }
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

  const buildTimelineFromSwap = (
    swap: SwapResult,
    activeDecision: Decision | null,
    routeId: string
  ): Event[] => {
    const now = Date.now();
    const items: Event[] = [
      {
        id: "1",
        eventType: "RouteEvaluated",
        timestamp: now - 10000,
        routeId,
        message: `Route ${routeId} evaluated`,
      },
    ];
    if (activeDecision) {
      items.push({
        id: "2",
        eventType: "DecisionMade",
        timestamp: now - 5000,
        routeId,
        decision: activeDecision.decision,
        riskScore: activeDecision.riskScore,
        message: `${activeDecision.decision} (risk: ${activeDecision.riskScore}/100)`,
      });
    }
    if (
      swap.requestedRouteId &&
      swap.executedRouteId &&
      swap.requestedRouteId !== swap.executedRouteId
    ) {
      items.push({
        id: "3",
        eventType: "FallbackTriggered",
        timestamp: now - 2000,
        routeId: swap.executedRouteId,
        message: `Fallback ${swap.requestedRouteId} → ${swap.executedRouteId}`,
      });
    }
    items.push({
      id: "4",
      eventType: "ExecutionSuccess",
      timestamp: now,
      routeId: swap.executedRouteId ?? swap.routeId,
      message: `Swap ${swap.tokenIn}→${swap.tokenOut} via ${swap.executionMode ?? "demo"} (out: ${swap.actualOut})`,
      txHash: swap.txHash,
    });
    return items;
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
        setDecision(
          evalDecision ?? {
            decision: swap.agentDecision ?? "ALLOW",
            riskScore: 0,
            reason: "Swap executed",
            routeId: swap.requestedRouteId ?? routeId,
            fallbackRouteId:
              swap.executedRouteId !== swap.requestedRouteId ? swap.executedRouteId ?? null : null,
            flags: [],
          }
        );
        setResultEvent({
          id: "exec",
          eventType: "ExecutionSuccess",
          timestamp: Date.now(),
          routeId: swap.executedRouteId ?? swap.routeId,
          message: `Swap ${swap.tokenIn}→${swap.tokenOut} via ${swap.executionMode} (out: ${swap.actualOut})`,
          txHash: swap.txHash,
        });
        setEvents(buildTimelineFromSwap(swap, evalDecision, routeId));
        showToast({ type: "success", message: "Swap executed successfully" });
        return;
      }

      if (!evalDecision) throw new Error("Evaluate the route before executing in mock mode");
      const data = await executeMockVault(evalDecision);
      setResultEvent(data.event);
      setEvents([
        {
          id: "1",
          eventType: "RouteEvaluated",
          timestamp: Date.now() - 10000,
          routeId: selectedRoute,
          message: `Route ${selectedRoute} loaded`,
        },
        {
          id: "2",
          eventType: "DecisionMade",
          timestamp: Date.now() - 5000,
          routeId: selectedRoute,
          decision: evalDecision.decision,
          riskScore: evalDecision.riskScore,
          message: `${evalDecision.decision} (risk: ${evalDecision.riskScore}/100)`,
        },
        data.event,
      ]);
    } catch (e: any) {
      const msg = e.message || "Execute failed";
      setError(`Execute failed: ${msg}`);
      showToast({ type: "error", message: `Execution failed: ${msg}` });
    } finally {
      setLoading("");
    }
  };

  const runFullFlow = async () => {
    setLoading("Running full flow...");
    setError("");
    setResultEvent(null);
    setEvents([]);

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

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      {!account && (
        <div style={{
          marginBottom: 16,
          padding: "14px 18px",
          borderRadius: 8,
          background: "#1f6feb22",
          border: "1px solid #1f6feb55",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span style={{ color: "#c9d1d9", fontSize: 14 }}>
            执行链上 swap 需先用 MetaMask 连接钱包（将自动切换到 Anvil 本地链）
          </span>
          <button
            onClick={handleConnectWallet}
            disabled={isConnecting}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#238636",
              color: "#fff",
              fontWeight: 600,
              cursor: isConnecting ? "not-allowed" : "pointer",
            }}
          >
            {isConnecting ? "连接中..." : "连接 MetaMask"}
          </button>
        </div>
      )}

      {/* Input */}
      <InputPanel
        tokenIn={tokenIn}
        tokenOut={tokenOut}
        amount={amount}
        onTokenInChange={setTokenIn}
        onTokenOutChange={setTokenOut}
        onAmountChange={setAmount}
        onLoad={loadRoutes}
        loading={loading}
      />

      {routes.length > 0 && (
        <>
          {quoteMeta.referencePrice !== undefined && (
            <div style={{
              background: "#161b22",
              borderRadius: 12,
              padding: "12px 20px",
              marginBottom: 16,
              border: "1px solid #30363d",
              color: "#8b949e",
              fontSize: 14,
            }}>
              Reference Price (SAFE pool): <strong style={{ color: "#e1e4e8" }}>{quoteMeta.referencePrice}</strong>
              {quoteMeta.recommendedRouteId && (
                <span style={{ marginLeft: 16 }}>
                  Recommended: <strong style={{ color: "#3fb950" }}>{quoteMeta.recommendedRouteId}</strong>
                </span>
              )}
            </div>
          )}
          <RouteList
            routes={routes}
            selected={selectedRoute}
            onSelect={(id) => {
              setSelectedRoute(id);
              setRecommendedRouteId(null);
            }}
            recommendedRouteId={recommendedRouteId ?? quoteMeta.recommendedRouteId ?? null}
          />
          <SafetyPanel decision={decision} onSwitchToFallback={switchToFallbackRoute} />

          <div style={{ display: "flex", gap: 12, marginTop: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <button
              onClick={() => evaluateRoute()}
              disabled={!!loading || !selectedRoute}
              style={{
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #30363d",
                cursor: loading ? "not-allowed" : "pointer",
                background: "#21262d",
                color: "#e1e4e8",
              }}
            >
              {loading === "Evaluating route with Safety Agent..." ? "评估中..." : "风险评估"}
            </button>
            <button
              onClick={runFullFlow}
              disabled={!!loading}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                background: safeMode ? "#238636" : "#1f6feb",
                color: "white",
              }}
            >
              {loading && loading !== "Evaluating route with Safety Agent..." ? "Running..." : safeMode ? "一键完整流程（含执行）" : "无安全模式执行"}
            </button>
          </div>

          {resultEvent && <ResultPanel event={resultEvent} decision={decision} />}
          {events.length > 0 && <Timeline events={events} />}
        </>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 8,
            background: "#f8514922",
            border: "1px solid #f85149",
            color: "#f85149",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

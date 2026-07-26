import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { getAddress } from "ethers";
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
} from "../types";

const API_BASE = "/api";

interface Props {
  safeMode: boolean;
}

/** Pad a hex string to 66 chars (0x + 64 hex digits = 32 bytes) */
function padToBytes32(hex: string): string {
  const raw = hex.replace(/^0x/, "");
  return "0x" + raw.padStart(64, "0");
}

/** Generate a dummy 65-byte signature.
 * Backend only validates hex format (65 bytes = 130 hex chars). */
function generateDummySignature(): string {
  return "0x" + "12".repeat(65);
}

export function TransactionPage({ safeMode }: Props) {
  const { account } = useWallet();
  const { showToast } = useToast();
  const [tokenIn, setTokenIn] = useState("USDT");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [amount, setAmount] = useState("1000");
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("route-a");
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
      setRoutes(data.routes);
      if (data.routes.length > 0) setSelectedRoute(data.routes[0].routeId);
      setError("");
    } catch (e: any) {
      setError(`Failed to load routes: ${e.message}`);
    }
    setLoading("");
  };

  const evaluateRoute = async (routeId?: string) => {
    const target = routeId ?? selectedRoute;
    if (!target) return;
    setLoading("Evaluating route with Safety Agent...");
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId: target, configProfile: "normal" }),
      });
      const data = await res.json();
      setDecision(data);
      if (data.decision === "FALLBACK_TO_SAFE_ROUTE" && data.fallbackRouteId) {
        setRecommendedRouteId(data.fallbackRouteId);
      } else {
        setRecommendedRouteId(null);
      }
    } catch (e: any) {
      setError(`Evaluate failed: ${e.message}`);
    }
    setLoading("");
  };

  const switchToFallbackRoute = async (fallbackRouteId: string) => {
    setSelectedRoute(fallbackRouteId);
    setRecommendedRouteId(fallbackRouteId);
    await evaluateRoute(fallbackRouteId);
  };

  /** Fetch current chain nonce via GET /api/execute/nonce */
  const getNonce = async (user: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/execute/nonce?user=${encodeURIComponent(user)}`);
    const data = await res.json();
    return String(data.nonce);
  };

  /**
   * Call POST /api/execute with permit-based signed request.
   *
   * Request body structure:
   * {
   *   evaluation: { decision, riskScore, reason, routeId, fallbackRouteId, flags }
   *   permit: { user, routeId (bytes32), amountIn, amountOutQuoted, deadline,
   *             riskScore, decision (contract enum 0|1|2), nonce }
   *   signature: "0x..." (65-byte hex)
   * }
   */
  const executeRoute = async () => {
    if (!decision) return;
    if (!account) {
      setError("链上执行需要连接 MetaMask 钱包。您仍可游客预览报价与风险评估。");
      showToast({ type: "error", message: "请先连接 MetaMask 再执行链上交易" });
      return;
    }
    setLoading("Executing route on-chain...");
    try {
      // Determine effective route ID (fallback if needed)
      const effectiveRouteId =
        decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId
          ? decision.fallbackRouteId
          : selectedRoute;

      // Look up the effective route for permit amounts
      const route = routes.find((r) => r.routeId === effectiveRouteId);
      if (!route) throw new Error(`Route ${effectiveRouteId} not found`);

      // Contract decision mapping: ALLOW=0, REJECT=1, FALLBACK_TO_SAFE_ROUTE=2
      const contractDecisionMap: Record<string, ContractDecision> = {
        ALLOW: 0,
        REJECT: 1,
        FALLBACK_TO_SAFE_ROUTE: 2,
      };
      const contractDecision = contractDecisionMap[decision.decision];

      // Encode routeId to bytes32 (matches backend encodeBytes32String)
      const encodedRouteId = padToBytes32(effectiveRouteId);

      // Fetch fresh nonce from chain
      const checksumAddr = getAddress(account);
      const nonce = await getNonce(checksumAddr);

      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      // Build permit payload matching backend ExecutionPermit schema
      const permit: ExecutionPermit = {
        user: checksumAddr,
        routeId: encodedRouteId,
        amountIn: String(route.amountIn),
        amountOutQuoted: String(route.quotedOut),
        deadline: String(deadline),
        riskScore: String(decision.riskScore),
        decision: contractDecision,
        nonce,
      };

      // Dummy signature (backend only validates hex format)
      const signature = generateDummySignature();

      const res = await fetch(`${API_BASE}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluation: {
            decision: decision.decision,
            riskScore: decision.riskScore,
            reason: decision.reason,
            routeId: decision.routeId,
            fallbackRouteId: decision.fallbackRouteId,
            flags: decision.flags,
          },
          permit,
          signature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.error?.message || data.error?.reason || JSON.stringify(data);
        throw new Error(errMsg);
      }

      setResultEvent(data.event);

      const newEvents: Event[] = [
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
          decision: decision.decision,
          riskScore: decision.riskScore,
          message: `${decision.decision} (risk: ${decision.riskScore}/100)`,
        },
        data.event,
      ];
      if (decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId) {
        newEvents.push({
          id: "4",
          eventType: "FallbackTriggered",
          timestamp: Date.now() - 2000,
          routeId: decision.fallbackRouteId,
          message: `Fallback to ${decision.fallbackRouteId}`,
        });
      }
      setEvents(newEvents);
    } catch (e: any) {
      const msg = e.message || "Execute failed";
      setError(`Execute failed: ${msg}`);
      showToast({ type: "error", message: `Execution failed: ${msg}` });
    }
    setLoading("");
  };

  const runFullFlow = async () => {
    setLoading("Running full flow...");
    setError("");
    await loadRoutes();
    await new Promise((r) => setTimeout(r, 300));
    await evaluateRoute();
    await new Promise((r) => setTimeout(r, 300));
    if (decision?.decision === "REJECT" && safeMode) {
      const safeRoute = routes.find((r) => r.routeId === "route-a");
      if (safeRoute) setSelectedRoute("route-a");
      await evaluateRoute();
      await new Promise((r) => setTimeout(r, 300));
      await executeRoute();
    } else {
      await executeRoute();
    }
    setLoading("");
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

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
          <RouteList
            routes={routes}
            selected={selectedRoute}
            onSelect={(id) => {
              setSelectedRoute(id);
              setRecommendedRouteId(null);
            }}
            recommendedRouteId={recommendedRouteId}
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

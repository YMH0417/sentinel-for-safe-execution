import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import { InputPanel } from "./components/InputPanel";
import { RouteList } from "./components/RouteList";
import { SafetyPanel } from "./components/SafetyPanel";
import { ResultPanel } from "./components/ResultPanel";
import { Timeline } from "./components/Timeline";
import { SafeUnsafeToggle } from "./components/SafeUnsafeToggle";
import { LandingPage } from "./components/LandingPage";
import { ToastProvider } from "./components/Toast";
import { AuthRoute, HeaderAvatar } from "./components/AuthRoute";
import type { Route as RouteType, Decision, Event } from "./types";

const API_BASE = "/api";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing page — public */}
          <Route path="/" element={<LandingPage onConnected={() => {}} />} />

          {/* Dashboard — protected by AuthRoute */}
          <Route
            path="/dashboard"
            element={
              <AuthRoute>
                <MainApp />
              </AuthRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

function MainApp() {
  const [safeMode, setSafeMode] = useState(true);
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

  const evaluateRoute = async () => {
    if (!selectedRoute) return;
    setLoading("Evaluating route with Safety Agent...");
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId: selectedRoute, configProfile: "normal" }),
      });
      const data = await res.json();
      setDecision(data);
    } catch (e: any) {
      setError(`Evaluate failed: ${e.message}`);
    }
    setLoading("");
  };

  const executeRoute = async () => {
    if (!decision) return;
    setLoading("Executing route on-chain...");
    try {
      const route = routes.find(r => r.routeId === selectedRoute);
      if (!route) throw new Error("Route not found");

      const res = await fetch(`${API_BASE}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: selectedRoute,
          maxLossBps: 100,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        }),
      });
      const data = await res.json();
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
      setError(`Execute failed: ${e.message}`);
    }
    setLoading("");
  };

  const runFullFlow = async () => {
    setLoading("Running full flow...");
    setError("");
    await loadRoutes();
    await new Promise(r => setTimeout(r, 300));
    await evaluateRoute();
    await new Promise(r => setTimeout(r, 300));
    if (decision?.decision === "REJECT" && safeMode) {
      const safeRoute = routes.find(r => r.routeId === "route-a");
      if (safeRoute) setSelectedRoute("route-a");
      await evaluateRoute();
      await new Promise(r => setTimeout(r, 300));
      await executeRoute();
    } else {
      await executeRoute();
    }
    setLoading("");
  };

  return (
    <div>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #30363d" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#58a6ff" }}>
            Sentinel for Safe Execution
          </h1>
          <p style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
            Execution Safety MVP - Week 3 Demo
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <SafeUnsafeToggle safeMode={safeMode} onChange={setSafeMode} />
          <HeaderAvatar />
        </div>
      </header>

      {/* Main Content */}
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
            onSelect={setSelectedRoute}
          />
          <SafetyPanel decision={decision} />

          <div style={{ display: "flex", gap: 12, marginTop: 16, marginBottom: 24 }}>
            <button
              onClick={runFullFlow}
              disabled={!!loading}
              style={{
                flex: 1, padding: "12px 24px", fontSize: 15, fontWeight: 600,
                borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer",
                background: safeMode ? "#238636" : "#1f6feb",
                color: "white",
              }}
            >
              {loading ? "Running..." : safeMode ? "Run With Safety Agent" : "Run Without Safety"}
            </button>
          </div>

          {resultEvent && <ResultPanel event={resultEvent} decision={decision} />}
          {events.length > 0 && <Timeline events={events} />}
        </>
      )}

      {error && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: "#f8514922", border: "1px solid #f85149", color: "#f85149" }}>
          {error}
        </div>
      )}

      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #30363d", textAlign: "center", color: "#484f58", fontSize: 13 }}>
        Sentinel v0.1.0 - MVP for Week 3 Demo
      </footer>
    </div>
  );
}

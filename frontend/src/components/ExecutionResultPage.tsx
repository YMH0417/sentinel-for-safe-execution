import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Decision, Event, SwapResult } from "../types";
import { SecurityGauge } from "./shared/SecurityGauge";
import { AccountCard } from "./shared/AccountCard";
import { Timeline } from "./Timeline";

interface LocationState {
  swap?: SwapResult;
  decision?: Decision | null;
}

export function ExecutionResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as LocationState;
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    api.events().then(setEvents).catch(() => setEvents([]));
  }, []);

  const swap = state.swap;
  const success = swap?.success !== false;

  const gasUsed = swap && "gasUsed" in swap ? Number((swap as SwapResult & { gasUsed?: string }).gasUsed ?? 0) : 0;
  const gasDirectEst = gasUsed > 0 ? Math.round(gasUsed * 2.8) : 0;
  const gasSaved = Math.max(0, gasDirectEst - gasUsed);

  const timelineEvents: Event[] = swap
    ? [
        { id: "1", eventType: "RouteEvaluated", timestamp: Date.now() - 8000, routeId: swap.requestedRouteId, message: `评估路由 ${swap.requestedRouteId}` },
        { id: "2", eventType: "DecisionMade", timestamp: Date.now() - 5000, routeId: swap.requestedRouteId, decision: swap.agentDecision, message: `Agent: ${swap.agentDecision}` },
        ...(swap.requestedRouteId !== swap.executedRouteId
          ? [{ id: "3", eventType: "FallbackTriggered", timestamp: Date.now() - 3000, routeId: swap.executedRouteId, message: `Fallback → ${swap.executedRouteId}` }]
          : []),
        { id: "4", eventType: "ExecutionSuccess", timestamp: Date.now(), routeId: swap.executedRouteId, message: `Swap ${swap.tokenIn}→${swap.tokenOut}`, txHash: swap.txHash },
      ]
    : events.slice(-8);

  return (
    <div>
      <AccountCard />
      <h2 className="sentinel-title">执行结果</h2>

      {!swap && (
        <div className="sentinel-card" style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>暂无本次会话的执行记录，以下为最近链上事件。</p>
          <Link to="/transaction" className="sentinel-btn sentinel-btn-primary" style={{ textDecoration: "none" }}>
            前往交易页
          </Link>
        </div>
      )}

      <div className="sentinel-exec-grid">
        <div className="sentinel-card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>{success ? "✅" : "🚫"}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: success ? "var(--green)" : "var(--red)" }}>
            {success ? "交易成功" : "执行被拦截"}
          </div>
          {swap && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              {swap.tokenIn} → {swap.tokenOut} · 输出 {swap.actualOut?.toFixed(4) ?? swap.quotedOut}
            </p>
          )}
          {success && (
            <button type="button" className="sentinel-btn sentinel-btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate("/profile")}>
              查看成就
            </button>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">Gas 成本对比（估算）</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <GasBox title="With Agent (Router)" value={gasUsed || "—"} sub="Vault + Swap 一笔 tx" highlight />
            <GasBox title="Without Agent (Direct)" value={gasDirectEst || "—"} sub="fund + transfer + swap" />
          </div>
          {gasSaved > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,255,136,0.08)", borderRadius: 8, color: "var(--green)", fontSize: 14 }}>
              预估节省 Gas：~{gasSaved.toLocaleString()} units
            </div>
          )}
          {swap?.txHash && (
            <div style={{ marginTop: 12, fontSize: 12, fontFamily: "monospace", color: "var(--blue)", wordBreak: "break-all" }}>
              Tx: {swap.txHash}
            </div>
          )}
        </div>

        <div className="sentinel-card">
          <SecurityGauge score={success ? 85 : 42} size={120} />
        </div>
      </div>

      {timelineEvents.length > 0 && <Timeline events={timelineEvents} />}
    </div>
  );
}

function GasBox({ title, value, sub, highlight }: { title: string; value: string | number; sub: string; highlight?: boolean }) {
  return (
    <div style={{ padding: 14, background: highlight ? "rgba(0,255,136,0.06)" : "#0d1117", borderRadius: 8, border: highlight ? "1px solid rgba(0,255,136,0.2)" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{sub}</div>
    </div>
  );
}

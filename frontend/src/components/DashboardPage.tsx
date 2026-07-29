import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, computeSecurityScore, type PoolsHealthReport } from "../api/client";
import type { Event } from "../types";
import { SecurityGauge } from "./shared/SecurityGauge";
import { AccountCard } from "./shared/AccountCard";

export function DashboardPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [pools, setPools] = useState<PoolsHealthReport | null>(null);
  const [score, setScore] = useState(85);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.events().catch(() => [] as Event[]),
      api.poolsHealth().catch(() => null),
    ]).then(([ev, ph]) => {
      setEvents(ev);
      setPools(ph);
      setScore(computeSecurityScore(ev, ph ?? undefined));
      setLoading(false);
    });
  }, []);

  const alerts = events
    .filter(
      (e) =>
        e.eventType.includes("Reject") ||
        e.eventType === "SwapFailed" ||
        e.decision === "REJECT" ||
        e.decision === "FALLBACK_TO_SAFE_ROUTE"
    )
    .slice(-6)
    .reverse();

  const poolGroups = pools
    ? [
        { name: "SAFE 池", count: pools.pools.filter((p) => p.poolLabel === "SAFE" && p.status === "healthy").length, color: "green" as const },
        { name: "SHALLOW 池", count: pools.pools.filter((p) => p.poolLabel === "SHALLOW").length, color: "yellow" as const },
        { name: "TOXIC 池", count: pools.pools.filter((p) => p.poolLabel === "TOXIC").length, color: "red" as const },
        { name: "异常/空池", count: pools.degraded + pools.empty, color: "red" as const },
      ]
    : [];

  const stageCounts = {
    evaluate: events.filter((e) => e.eventType.includes("Evaluat")).length,
    decision: events.filter((e) => e.eventType.includes("Decision")).length,
    fallback: events.filter((e) => e.eventType.includes("Fallback")).length,
    execute: events.filter((e) => e.eventType.includes("Success") || e.eventType.includes("Swap")).length,
    fail: events.filter((e) => e.eventType.includes("Fail") || e.eventType.includes("Reject")).length,
  };
  const maxStage = Math.max(...Object.values(stageCounts), 1);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>加载仪表盘...</div>;
  }

  return (
    <div>
      <AccountCard />

      <div className="sentinel-dash-grid">
        <div className="sentinel-card">
          <SecurityGauge score={score} />
          <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
            <div><span className="status-dot green" />健康池 {pools?.healthy ?? 0}</div>
            <div style={{ marginTop: 6 }}><span className="status-dot yellow" />降级 {pools?.degraded ?? 0}</div>
            <div style={{ marginTop: 6 }}><span className="status-dot red" />空池 {pools?.empty ?? 0}</div>
          </div>
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">链 / 池状态</div>
          <div className="sentinel-grid-2" style={{ marginBottom: 16 }}>
            {poolGroups.map((g) => (
              <div key={g.name} style={{ padding: 12, background: "#0d1117", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{g.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{g.count}</div>
              </div>
            ))}
          </div>
          <div className="sentinel-label">主动警报</div>
          {alerts.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>暂无告警，系统运行正常</p>
          ) : (
            alerts.map((a, i) => (
              <div key={a.id ?? i} style={{ padding: "8px 0", borderBottom: "1px solid #1a2332", fontSize: 13 }}>
                <span className={`sentinel-badge ${a.decision === "REJECT" ? "sentinel-badge-red" : "sentinel-badge-yellow"}`}>
                  {a.eventType}
                </span>
                <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>{a.message?.slice(0, 60)}</span>
              </div>
            ))
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">统计摘要</div>
          <StatRow label="事件总数" value={String(events.length)} />
          <StatRow label="Demo 池数" value={String(pools?.poolCount ?? 0)} />
          <StatRow label="最近告警" value={String(alerts.length)} accent={alerts.length > 0 ? "var(--red)" : undefined} />
          <button
            type="button"
            className="sentinel-btn sentinel-btn-secondary"
            style={{ width: "100%", marginTop: 16 }}
            onClick={() => navigate("/transaction")}
          >
            立即处理并进行新交易
          </button>
        </div>
      </div>

      <div className="sentinel-card">
        <div className="sentinel-label">执行阶段分布</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, paddingTop: 8 }}>
          {[
            { label: "评估", v: stageCounts.evaluate },
            { label: "决策", v: stageCounts.decision },
            { label: "Fallback", v: stageCounts.fallback },
            { label: "执行", v: stageCounts.execute },
            { label: "失败", v: stageCounts.fail },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  height: `${Math.max(8, (s.v / maxStage) * 80)}px`,
                  background: "linear-gradient(180deg, var(--green), rgba(0,255,136,0.3))",
                  borderRadius: "4px 4px 0 0",
                  marginBottom: 8,
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2332", fontSize: 13 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

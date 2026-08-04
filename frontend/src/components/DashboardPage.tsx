import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  api,
  buildAlertSummary,
  computePoolChainStatus,
  computeScoreLegend,
  computeUserStats,
  computeWorkflowStages,
} from "../api/client";
import type { SafetyExplanation } from "../api/client";
import type { Event } from "../types";
import { SecurityGauge } from "./shared/SecurityGauge";
import { useWallet } from "../contexts/WalletContext";
import { useDashboardData } from "../hooks/useDashboardData";
import { GlobalLoading } from "./GlobalLoading";

type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: SafetyExplanation }
  | { status: "error"; message: string };

const DOT_CLASS = {
  purple: "dashboard-dot-purple",
  cyan: "dashboard-dot-cyan",
  yellow: "dashboard-dot-yellow",
  red: "dashboard-dot-red",
} as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { events, pools, status, balances, score, refreshing, poolsPending, refresh } = useDashboardData(account);
  const [aiState, setAiState] = useState<AiState>({ status: "idle" });
  const [aiLoading, setAiLoading] = useState(false);

  const handleRefresh = () => void refresh();

  const handleAiAnalysis = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiState({ status: "loading" });
    try {
      // 取最新一条决策事件
      const latestDecision = [...events]
        .reverse()
        .find((e) => e.eventType === "DecisionMade" || e.decision);
      const result = await api.aiAlertAnalysis(latestDecision?.id);
      setAiState({ status: "done", result });
    } catch (err) {
      setAiState({
        status: "error",
        message: err instanceof Error ? err.message : "AI 分析调用失败",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const legend = computeScoreLegend(events, pools ?? undefined);
  const chainRows = computePoolChainStatus(pools ?? undefined);
  const stats = computeUserStats(events);
  const workflow = computeWorkflowStages(events);
  const maxStage = Math.max(...workflow.map((s) => s.count), 1);

  const alerts = events
    .filter(
      (e) =>
        e.eventType.includes("Reject") ||
        e.eventType === "SwapFailed" ||
        e.decision === "REJECT" ||
        e.decision === "FALLBACK_TO_SAFE_ROUTE" ||
        (e.riskScore ?? 0) >= 50
    )
    .slice(-20)
    .reverse()
    .slice(0, 4);

  const decisionChips = events
    .filter((e) => e.decision || e.eventType.includes("Decision"))
    .slice(-4)
    .reverse();

  const summary = buildAlertSummary(alerts, score);
  const usdc = balances.USDC?.human ?? 0;

  return (
    <div className="dashboard-box">
      <GlobalLoading active={refreshing || aiLoading} message={refreshing ? "刷新数据中..." : aiLoading ? "AI 分析中..." : undefined} />
      <div className="dashboard-main">
        <div className="dashboard-main-top">
        {/* 左上：安全评分 */}
        <div className="dashboard-card dashboard-score-cell">
          <div className="dashboard-card-title">
            <span>安全性评分</span>
          </div>
          <div className="dashboard-score-gauge">
            <SecurityGauge score={score} size={180} label="" />
          </div>
          <div className="dashboard-legend-grid">
            <LegendDot label="高风险拦截" pct={legend.highRisk} color="var(--cyan)" />
            <LegendDot label="策略预警" pct={legend.strategy} color="var(--red)" />
            <LegendDot label="风险警告" pct={legend.warning} color="var(--yellow)" />
          </div>
        </div>
        {/* 中上：链条状态 + 主动警报 */}
        <div className="dashboard-card">
          <div className="dashboard-card-title">
            <span>链条状态{poolsPending ? " · 同步池数据" : ""}</span>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ padding: "4px 10px", fontSize: 11 }}
            >
              {refreshing ? "刷新中" : "↻ 刷新"}
            </button>
          </div>
          <div className="dashboard-chain-list">
            {chainRows.map((row) => (
              <div key={row.label} className="dashboard-chain-row">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dashboard-dot ${DOT_CLASS[row.dot]}`} />
                  {row.label}
                </span>
                <span className="dashboard-chain-score">{row.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="dashboard-status-strip">
            {(decisionChips.length > 0 ? decisionChips : placeholderChips()).map((chip, i) => (
              <div key={chip.id ?? i} className="dashboard-status-chip">
                <div style={{ fontWeight: 600, color: chipColor(chip.decision), marginBottom: 4 }}>
                  {chipLabel(chip.decision)}
                </div>
                <div style={{ color: "var(--text-dim)" }}>{formatDate(chip.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-title">
            <span>主动警报</span>
            {alerts.length > 0 && (
              <span className="sentinel-badge sentinel-badge-red">{alerts.length} News</span>
            )}
          </div>
          <div className="dashboard-alert-list">
            {alerts.length === 0 ? (
              <div className="dashboard-alert-item info" style={{ borderLeftColor: "var(--green)" }}>
                <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>Normal</div>
                <div style={{ color: "var(--text-muted)" }}>暂无告警，系统运行正常</div>
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={a.id ?? i} className={`dashboard-alert-item ${alertLevel(a)}`}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {alertLevel(a) === "critical" ? "Critical" : alertLevel(a) === "warn" ? "Warn" : "Info"}
                    {a.routeId ? `: ${a.routeId}` : ""}
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {a.message?.slice(0, 80)}
                  </div>
                  <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 4 }}>
                    {formatDate(a.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="dashboard-ai-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: "var(--green)" }}>AI 警报分析</span>
              {aiState.status === "idle" && (
                <button
                  type="button"
                  className="sentinel-btn sentinel-btn-ghost"
                  onClick={handleAiAnalysis}
                  disabled={aiLoading}
                  style={{ padding: "2px 10px", fontSize: 11 }}
                >
                  AI 深度分析
                </button>
              )}
            </div>
            {aiState.status === "idle" && summary}
            {aiState.status === "loading" && (
              <div style={{ color: "var(--text-muted)" }}>
                AI 分析中…（通常数秒内完成）
              </div>
            )}
            {aiState.status === "done" && (
              <AiAnalysisContent result={aiState.result} onRerun={handleAiAnalysis} loading={aiLoading} />
            )}
            {aiState.status === "error" && (
              <div>
                <div style={{ color: "var(--red)", marginBottom: 6 }}>AI 分析调用失败</div>
                <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 8, wordBreak: "break-word" }}>
                  {aiState.message}
                </div>
                <button
                  type="button"
                  className="sentinel-btn sentinel-btn-ghost"
                  onClick={handleAiAnalysis}
                  disabled={aiLoading}
                  style={{ padding: "2px 10px", fontSize: 11 }}
                >
                  重试
                </button>
              </div>
            )}
            <button
              type="button"
              className="sentinel-btn sentinel-btn-primary"
              style={{ width: "100%", marginTop: 10, padding: "10px 12px", fontSize: 13 }}
              onClick={() => navigate("/transaction")}
            >
              立即处理并进行新交易
            </button>
          </div>
        </div>
        </div>
        <div className="dashboard-chart">
        {/* 底部柱状图 */}
        <div className="dashboard-card dashboard-chart-cell">
          <div className="dashboard-card-title">
            <span>📊 主动警报状态</span>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-ghost"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => navigate("/execution")}
            >
              View More
            </button>
          </div>
          <div className="dashboard-bars">
            {workflow.map((s) => (
              <div key={s.label} className="dashboard-bar-col">
                <div
                  className="dashboard-bar"
                  style={{
                    height: `${Math.max(12, (s.count / maxStage) * 100)}px`,
                    width: "100%",
                  }}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      <div className="dashboard-sidebar">

            <SidebarStat
              label="累计 Swap 量"
              value={`$${stats.safeVolumeUsd.toLocaleString()}`}
              hint="Demo 估算"
            />
            <SidebarStat
              label="拦截 / 失败"
              value={String(stats.rejectCount)}
              accent={stats.rejectCount > 0 ? "var(--red)" : undefined}
            />
            <SidebarStat
              label="USDC 余额"
              value={usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              accent="var(--green)"
            />

            <div className="dashboard-stat-card" style={{ flex: 1, minHeight: 100 }}>
              <div className="sentinel-label">最新状态 / 公告栏</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <div>链模式：{status?.chainName ?? status?.chainMode ?? "—"}</div>
                <div>Demo 池数：{pools?.poolCount ?? status?.demoPoolCount ?? "—"}</div>
                <div>健康 / 降级 / 空池：{pools ? `${pools.healthy} / ${pools.degraded} / ${pools.empty}` : "—"}</div>
                <div>事件总数：{events.length}</div>
              </div>
            </div>
      </div>
    </div>
  );
}

function AiAnalysisContent({
  result,
  onRerun,
  loading,
}: {
  result: SafetyExplanation;
  onRerun: () => void;
  loading: boolean;
}) {
  const safeVectors = new Set(["Normal", "Unknown", "正常", "未知"]);
  const vectorColor =
    result.attackVector && !safeVectors.has(result.attackVector)
      ? "var(--yellow)"
      : "var(--green)";
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        {result.attackVector && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: `${vectorColor}22`,
              color: vectorColor,
              border: `1px solid ${vectorColor}44`,
            }}
          >
            {result.attackVector}
          </span>
        )}
        {typeof result.confidence === "number" && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            置信度 {result.confidence}%
          </span>
        )}
      </div>
      <div style={{ color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 8 }}>
        {result.narrative}
      </div>
      {result.recommendations && result.recommendations.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {result.recommendations.map((rec, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{rec}</li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 8, textAlign: "right" }}>
        <button
          type="button"
          className="sentinel-btn sentinel-btn-ghost"
          onClick={onRerun}
          disabled={loading}
          style={{ padding: "2px 10px", fontSize: 11 }}
        >
          重新分析
        </button>
      </div>
    </div>
  );
}

function LegendDot({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="dashboard-legend-dot-item">
      <span className="dashboard-legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="dashboard-legend-dot-label">{label}</span>
      <span className="dashboard-legend-dot-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}

function SidebarStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="dashboard-stat-card">
      <div style={{ fontSize: 16, color: "var(--text-muted)" }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-dim)" }}>({hint})</span>}
      </div>
      <div className="dashboard-stat-value" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function formatDate(ts?: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

function alertLevel(e: Event): "critical" | "warn" | "info" {
  if (e.decision === "REJECT" || e.eventType.includes("Reject") || e.eventType === "SwapFailed") {
    return "critical";
  }
  if (e.decision === "FALLBACK_TO_SAFE_ROUTE" || e.eventType.includes("Fallback")) {
    return "warn";
  }
  return "info";
}

function chipLabel(decision?: string) {
  if (decision === "REJECT") return "High Risk";
  if (decision === "FALLBACK_TO_SAFE_ROUTE") return "Fallback";
  if (decision === "ALLOW") return "High Safety";
  return "Pending";
}

function chipColor(decision?: string) {
  if (decision === "REJECT") return "var(--red)";
  if (decision === "FALLBACK_TO_SAFE_ROUTE") return "var(--yellow)";
  if (decision === "ALLOW") return "var(--green)";
  return "var(--text-muted)";
}

function placeholderChips(): Event[] {
  return [
    { id: "p1", eventType: "DecisionMade", timestamp: Date.now(), decision: "ALLOW", message: "System ready" },
    { id: "p2", eventType: "DecisionMade", timestamp: Date.now() - 86400000, decision: "ALLOW", message: "Pools healthy" },
    { id: "p3", eventType: "DecisionMade", timestamp: Date.now() - 172800000, message: "Awaiting activity" },
    { id: "p4", eventType: "DecisionMade", timestamp: Date.now() - 259200000, message: "Demo chain online" },
  ];
}

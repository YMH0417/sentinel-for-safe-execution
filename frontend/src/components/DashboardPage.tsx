import { useEffect, useState, type ReactNode } from "react";
import {
  api,
  isDashboardAlertEvent,
  selectDashboardAlerts,
  buildAlertSummary,
  computeScoreLegend,
  computeUserStats,
} from "../api/client";
import type { LabelVolumeRow, SafetyExplanation, DashboardOverviewExplanation } from "../api/client";
import type { Event } from "../types";
import { SecurityGauge } from "./shared/SecurityGauge";
import { useWallet } from "../contexts/WalletContext";
import { useDashboardData } from "../hooks/useDashboardData";
import { GlobalLoading } from "./GlobalLoading";

type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      trade: SafetyExplanation | null;
      overview: DashboardOverviewExplanation | null;
      tradeError?: string;
      overviewError?: string;
    }
  | { status: "error"; message: string };

const TRADE_EVENT_TYPES = new Set([
  "SwapExecuted",
  "SwapFailed",
  "DecisionMade",
  "FallbackRequired",
  "ExecutionSuccess",
  "ExecutionRejected",
]);

function findLatestTradeEvent(events: Event[], account?: string | null): Event | undefined {
  if (!account) return undefined;
  const accountLower = account.toLowerCase();
  return [...events]
    .reverse()
    .find(
      (e) =>
        TRADE_EVENT_TYPES.has(e.eventType) &&
        e.context?.account?.toLowerCase() === accountLower
    );
}

const LABEL_DOT: Record<LabelVolumeRow["label"], keyof typeof DOT_CLASS> = {
  SAFE: "purple",
  SHALLOW: "cyan",
  TOXIC: "yellow",
  SDA: "red",
};

const LABEL_TITLE: Record<LabelVolumeRow["label"], string> = {
  SAFE: "SAFE 池",
  SHALLOW: "SHALLOW 池",
  TOXIC: "TOXIC 池",
  SDA: "SDA 池",
};

function formatPoolVolumeUsdc(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const DOT_CLASS = {
  purple: "dashboard-dot-purple",
  cyan: "dashboard-dot-cyan",
  yellow: "dashboard-dot-yellow",
  red: "dashboard-dot-red",
} as const;

const DEFAULT_VOLUME_ROWS: LabelVolumeRow[] = [
  { label: "SAFE", volumeUsdc: 0, swapCount: 0 },
  { label: "SHALLOW", volumeUsdc: 0, swapCount: 0 },
  { label: "TOXIC", volumeUsdc: 0, swapCount: 0 },
  { label: "SDA", volumeUsdc: 0, swapCount: 0 },
];

export function DashboardPage() {
  const { account } = useWallet();
  const { events, poolVolume, balances, score, usdcVolumeHuman, refreshing, poolVolumePending, refresh } =
    useDashboardData(account);
  const [aiState, setAiState] = useState<AiState>({ status: "idle" });
  const [aiLoading, setAiLoading] = useState(false);
  const [showScoreHelp, setShowScoreHelp] = useState(false);
  const [showPoolHelp, setShowPoolHelp] = useState(false);
  const [showAlertsHelp, setShowAlertsHelp] = useState(false);

  useEffect(() => {
    setAiState({ status: "idle" });
  }, [account]);

  const handleRefresh = () => void refresh();

  const handleAiAnalysis = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiState({ status: "loading" });

    const latestTrade = findLatestTradeEvent(events, account);
    const overviewPayload = {
      score,
      legend,
      poolVolume: volumeRows.map((row) => ({
        label: row.label,
        volumeUsdc: row.volumeUsdc,
        swapCount: row.swapCount,
      })),
      alerts: alertViews.map((view) => ({
        title: view.title,
        detail: view.detail,
        level: view.level,
      })),
    };

    try {
      const [tradeSettled, overviewSettled] = await Promise.allSettled([
        latestTrade ? api.aiAlertAnalysis(latestTrade.id) : Promise.resolve(null),
        api.aiDashboardOverview(overviewPayload),
      ]);

      const trade =
        tradeSettled.status === "fulfilled" ? tradeSettled.value : null;
      const overview =
        overviewSettled.status === "fulfilled" ? overviewSettled.value : null;
      const tradeError =
        tradeSettled.status === "rejected"
          ? tradeSettled.reason instanceof Error
            ? tradeSettled.reason.message
            : "最近一笔交易分析失败"
          : undefined;
      const overviewError =
        overviewSettled.status === "rejected"
          ? overviewSettled.reason instanceof Error
            ? overviewSettled.reason.message
            : "仪表盘综合分析失败"
          : undefined;

      if (!trade && !overview) {
        setAiState({
          status: "error",
          message: tradeError ?? overviewError ?? "AI 分析调用失败",
        });
        return;
      }

      setAiState({
        status: "done",
        trade,
        overview,
        tradeError,
        overviewError,
      });
    } catch (err) {
      setAiState({
        status: "error",
        message: err instanceof Error ? err.message : "AI 分析调用失败",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const legend = computeScoreLegend(events);
  const volumeRows =
    poolVolume?.byLabel && poolVolume.byLabel.length > 0
      ? poolVolume.byLabel
      : DEFAULT_VOLUME_ROWS;
  const stats = computeUserStats(events, account);

  const alertEvents = events.filter(isDashboardAlertEvent).slice(-30).reverse();
  const alertViews = selectDashboardAlerts(events, 5);
  const summary = buildAlertSummary(alertEvents.slice(0, 5), score);
  const usdc = balances.USDC?.human ?? 0;

  return (
    <div className="dashboard-box">
      <GlobalLoading active={refreshing || aiLoading} message={refreshing ? "刷新数据中" : aiLoading ? "AI 分析中" : undefined} />
      <div className="dashboard-upper">
        <div className="dashboard-main-top">
        {/* 左上：交易情况概览 */}
        <div className="dashboard-card dashboard-score-cell">
          <div className="dashboard-card-title dashboard-card-title-spread">
            <span>交易情况概览</span>
            <div className="dashboard-card-title-actions">
              <button
                type="button"
                className="sentinel-btn sentinel-btn-ghost dashboard-card-refresh-btn"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? "刷新中" : "↻ 刷新"}
              </button>
              <button
                type="button"
                className="dashboard-info-btn"
                aria-label="查看交易情况概览说明"
                onClick={() => setShowScoreHelp(true)}
              >
                i
              </button>
            </div>
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
        {/* 中上：交易池状态 + 主动警报 */}
        <div className="dashboard-card dashboard-pool-card">
          <div className="dashboard-card-title dashboard-card-title-spread">
            <span>
              交易池状态
              {poolVolumePending ? " · 同步中" : ""}
            </span>
            <div className="dashboard-card-title-actions">
              <button
                type="button"
                className="dashboard-info-btn"
                aria-label="查看交易池状态说明"
                onClick={() => setShowPoolHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          <div className="dashboard-chain-list">
            {volumeRows.map((row) => (
              <div key={row.label} className="dashboard-chain-row">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dashboard-dot ${DOT_CLASS[LABEL_DOT[row.label]]}`} />
                  {LABEL_TITLE[row.label]}
                </span>
                <span className="dashboard-chain-volume">
                  <span className="dashboard-chain-score">{formatPoolVolumeUsdc(row.volumeUsdc)}</span>
                  <span className="dashboard-chain-volume-unit"> USDC</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-card dashboard-alerts-card">
          <div className="dashboard-card-title dashboard-card-title-spread">
            <span>主动警报</span>
            <div className="dashboard-card-title-actions">
              <button
                type="button"
                className="dashboard-info-btn"
                aria-label="查看主动警报说明"
                onClick={() => setShowAlertsHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          <div className="dashboard-alert-list">
            {alertViews.length === 0 ? (
              <div className="dashboard-alert-item info" style={{ borderLeftColor: "var(--green)" }}>
                <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>一切正常</div>
                <div style={{ color: "var(--text-muted)" }}>全平台近期暂无需要特别留意的异常</div>
              </div>
            ) : (
              alertViews.map((view, i) => (
                <div key={i} className={`dashboard-alert-item ${view.level}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{view.title}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: 14, flexShrink: 0 }}>
                      {view.date}
                    </div>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>{view.detail}</div>
                </div>
              ))
            )}
          </div>
          </div>
        </div>
        <div className="dashboard-sidebar-stats">
          <SidebarStat
            label="累计交易量"
            value={`$${usdcVolumeHuman.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}`}
            hint={account ? undefined : "连接钱包后显示"}
          />
          <SidebarStat
            label="交易失败数"
            value={String(stats.rejectCount)}
            accent={stats.rejectCount > 0 ? "var(--red)" : undefined}
            hint={account ? undefined : "连接钱包后显示"}
          />
          <SidebarStat
            label="USDC 余额"
            value={usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            accent="var(--green)"
          />
        </div>
      </div>
      <div className="dashboard-ai-row">
        <div className="dashboard-card dashboard-chart-cell dashboard-ai-chart-cell">
          <div className="dashboard-card-title dashboard-card-title-spread">
            <span>AI 警报分析</span>
            <div className="dashboard-card-title-actions">
              <button
                type="button"
                className="sentinel-btn sentinel-btn-ghost"
                onClick={handleAiAnalysis}
                disabled={aiLoading}
                style={{ padding: "4px 12px", fontSize: 14 }}
              >
                {aiLoading
                  ? "分析中"
                  : aiState.status === "done"
                    ? "重新分析"
                    : aiState.status === "error"
                      ? "重试"
                      : "开始分析"}
              </button>
            </div>
          </div>
          <div className="dashboard-ai-panel dashboard-ai-split">
            <div className="dashboard-ai-col">
              <div className="dashboard-ai-col-body">
                {aiState.status === "idle" && (
                  <AiColPlaceholder
                    text={
                      findLatestTradeEvent(events, account)
                        ? "点击「开始分析」解读你最近一笔成交或拦截。"
                        : account
                          ? "暂无你的交易记录，完成一笔 swap 后可在此解读。"
                          : "连接钱包后，可解读你最近一笔成交或拦截。"
                    }
                  />
                )}
                {aiState.status === "loading" && <AiColPlaceholder text="分析中" />}
                {aiState.status === "done" && aiState.trade && (
                  <AiAnalysisResult
                    sideLabel="最近一笔交易"
                    statusLabel={tradeStatusLabel(aiState.trade.attackVector)}
                    statusTone={tradeStatusTone(aiState.trade.attackVector)}
                    confidence={aiState.trade.confidence}
                    narrative={aiState.trade.narrative}
                    bullets={aiState.trade.recommendations}
                  />
                )}
                {aiState.status === "done" && !aiState.trade && (
                  <AiColPlaceholder
                    muted
                    text={aiState.tradeError ?? "最近一笔交易暂无分析结果"}
                  />
                )}
                {aiState.status === "error" && (
                  <AiColPlaceholder error text={aiState.message} />
                )}
              </div>
            </div>
            <div className="dashboard-ai-col-divider" aria-hidden />
            <div className="dashboard-ai-col">
              <div className="dashboard-ai-col-body">
                {aiState.status === "idle" && <AiColPlaceholder text={summary} />}
                {aiState.status === "loading" && <AiColPlaceholder text="分析中" />}
                {aiState.status === "done" && aiState.overview && (
                  <AiAnalysisResult
                    sideLabel="仪表盘综合"
                    statusLabel={aiState.overview.headline}
                    statusTone={overviewStatusTone(score)}
                    confidence={aiState.overview.confidence}
                    narrative={aiState.overview.narrative}
                    bullets={aiState.overview.highlights}
                  />
                )}
                {aiState.status === "done" && !aiState.overview && (
                  <AiColPlaceholder
                    muted
                    text={aiState.overviewError ?? "综合分析暂无结果"}
                  />
                )}
                {aiState.status === "error" && (
                  <AiColPlaceholder error text={aiState.message} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showScoreHelp && (
        <TransactionOverviewHelpModal onClose={() => setShowScoreHelp(false)} />
      )}
      {showPoolHelp && <PoolStatusHelpModal onClose={() => setShowPoolHelp(false)} />}
      {showAlertsHelp && <ProactiveAlertsHelpModal onClose={() => setShowAlertsHelp(false)} />}
    </div>
  );
}

function tradeStatusLabel(attackVector?: string): string {
  if (!attackVector) return "—";
  const safeVectors = new Set(["Normal", "Unknown", "正常", "未知"]);
  if (attackVector === "Unknown" || attackVector === "未知") return "未知";
  if (safeVectors.has(attackVector)) return "正常";
  return attackVector;
}

function tradeStatusTone(attackVector?: string): AiStatusTone {
  const safeVectors = new Set(["Normal", "Unknown", "正常", "未知"]);
  if (!attackVector || safeVectors.has(attackVector)) return "safe";
  return "warn";
}

function overviewStatusTone(score: number): AiStatusTone {
  if (score >= 70) return "safe";
  if (score >= 50) return "neutral";
  return "warn";
}

type AiStatusTone = "safe" | "warn" | "neutral";

function AiColPlaceholder({
  text,
  muted,
  error,
}: {
  text: string;
  muted?: boolean;
  error?: boolean;
}) {
  return (
    <p
      className={`dashboard-ai-idle${muted ? " dashboard-ai-muted" : ""}${error ? " dashboard-ai-error" : ""}`}
    >
      {text}
    </p>
  );
}

function AiAnalysisResult({
  sideLabel,
  statusLabel,
  statusTone = "neutral",
  narrative,
  bullets,
  confidence,
  maxBullets = 3,
}: {
  sideLabel: string;
  statusLabel?: string;
  statusTone?: AiStatusTone;
  narrative: string;
  bullets?: string[];
  confidence?: number;
  maxBullets?: number;
}) {
  const list = bullets?.filter(Boolean).slice(0, maxBullets) ?? [];

  return (
    <div className="dashboard-ai-result-split">
      <aside className="dashboard-ai-result-side">
        <div className="dashboard-ai-result-side-label">{sideLabel}</div>
        {statusLabel && (
          <div className={`dashboard-ai-result-side-status dashboard-ai-result-side-status--${statusTone}`}>
            {statusLabel}
          </div>
        )}
        {typeof confidence === "number" && (
          <div className="dashboard-ai-result-side-confidence">置信度 {confidence}%</div>
        )}
      </aside>
      <div className="dashboard-ai-result-inner-divider" aria-hidden />
      <div className="dashboard-ai-result-detail">
        <div className="dashboard-ai-result-narrative">{narrative}</div>
        {list.length > 0 && (
          <ul className="dashboard-ai-result-list">
            {list.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LegendDot({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="dashboard-legend-dot-item">
      <span className="dashboard-legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <div className="dashboard-legend-dot-text">
        <span className="dashboard-legend-dot-label">{label}</span>
        <span className="dashboard-legend-dot-pct" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
}

function DashboardHelpModal({
  title,
  titleId,
  onClose,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="dashboard-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sentinel-card dashboard-score-help-modal" role="dialog" aria-labelledby={titleId}>
        <button type="button" className="dashboard-score-help-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <h3 id={titleId} className="dashboard-score-help-title">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function TransactionOverviewHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <DashboardHelpModal title="交易情况概览" titleId="score-help-title" onClose={onClose}>
        <p className="dashboard-score-help-intro">
          帮你看<strong>最近这段时间，整体交易顺不顺、风险高不高</strong>。
          这里是全平台的汇总，不是你个人钱包的账单。
        </p>

        <section className="dashboard-score-help-section">
          <h4>圆环分数</h4>
          <p>分数越高越省心；越绿越稳，越红越要多留意。</p>
        </section>

        <section className="dashboard-score-help-section">
          <h4>下面三个小格</h4>
          <ul className="dashboard-score-help-list">
            <li><strong>高风险拦截</strong>：被系统拦下或没成交的情况。</li>
            <li><strong>策略预警</strong>：改走更稳妥路线的情况。</li>
            <li><strong>风险警告</strong>：需要多留神的预警信号。</li>
          </ul>
        </section>

        <p className="dashboard-score-help-foot">
          点「↻ 刷新」可以更新最新数据。
        </p>
    </DashboardHelpModal>
  );
}

function PoolStatusHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <DashboardHelpModal title="交易池状态" titleId="pool-help-title" onClose={onClose}>
      <p className="dashboard-score-help-intro">
        把最近平台上的成交，按四类池子分开统计，并统一换算成 <strong>USDC</strong>，方便你对比哪类池子最近更活跃。
      </p>

      <section className="dashboard-score-help-section">
        <h4>四行分别是什么意思</h4>
        <ul className="dashboard-score-help-list">
          <li><strong>SAFE 池</strong>：流动性充足，一般最省心。</li>
          <li><strong>SHALLOW 池</strong>：池子偏浅，大单更容易滑点。</li>
          <li><strong>TOXIC 池</strong>：风险较高，价格和成交环境更不稳定。</li>
          <li><strong>SDA 池</strong>：有特殊等待规则，安全模式下常被系统拦住。</li>
        </ul>
      </section>

      <p className="dashboard-score-help-foot">
        右侧数字越大，说明这类池最近成交越多。这和右侧栏「累计交易量」（你个人总共成交多少）不是一回事。
      </p>
    </DashboardHelpModal>
  );
}

function ProactiveAlertsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <DashboardHelpModal title="主动警报" titleId="alerts-help-title" onClose={onClose}>
      <p className="dashboard-score-help-intro">
        展示<strong>全平台</strong>最近值得留意的异常情况，最多 5 条。
        只要有人通过本系统发起交易（安全模式或强制模式），都会记入；列表从<strong>全体用户</strong>的记录里筛选，不是只看你的钱包。
      </p>

      <section className="dashboard-score-help-section">
        <h4>什么情况会出现在这里</h4>
        <ul className="dashboard-score-help-list">
          <li><strong>被风控拦住</strong>：系统认为风险太高，拒绝成交或执行失败。</li>
          <li><strong>改走更稳的路</strong>：原路线不够好，系统建议或已自动换成更安全的。</li>
          <li><strong>强制模式成交</strong>：用户主动绕过风控保护后的成交或失败。</li>
        </ul>
      </section>

      <section className="dashboard-score-help-section">
        <h4>什么情况不会出现</h4>
        <p>普通安全模式下的正常成功交易不会进列表。列表为空，一般说明全平台最近没什么要特别担心的事。</p>
      </section>

      <p className="dashboard-score-help-foot">
        每条右上角的日期时间，是事情发生的时间，精确到分钟。个人成交总额请看右侧「累计交易量」。
      </p>
    </DashboardHelpModal>
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

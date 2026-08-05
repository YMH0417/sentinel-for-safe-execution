import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { buildSwapResultFromEvents } from "../lib/swapResult";
import { fetchDemoChainConfig } from "../lib/wallet";
import type { Decision, Event, SwapResult } from "../types";
import { Timeline } from "./Timeline";

const MONAD_EXPLORER_TX = "https://testnet.monadvision.com/tx/";

interface LocationState {
  swap?: SwapResult;
  decision?: Decision | null;
}

function formatAmount(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(4);
}

const TIMELINE_EVENT_TYPES = new Set([
  "RouteEvaluated",
  "DecisionMade",
  "FallbackRequired",
  "ExecutionAttempted",
  "SwapExecuted",
  "SwapFailed",
  "SdaExecutionWindowWaiting",
]);

function eventTxHash(event: Event): string | undefined {
  const hash =
    event.txHash ??
    (typeof event.context?.txHash === "string" ? event.context.txHash : undefined);
  return hash?.toLowerCase();
}

function dedupeTimelineByType(events: Event[]): Event[] {
  const seen = new Set<string>();
  const result: Event[] = [];
  for (const event of events) {
    if (seen.has(event.eventType)) continue;
    seen.add(event.eventType);
    result.push(event);
  }
  return result;
}

function buildSyntheticTimeline(
  swap: SwapResult,
  decision: Decision | null | undefined,
  success: boolean,
  agentBypassed: boolean,
  demoChainName: string
): Event[] {
  const steps: Event[] = [
    {
      id: "route",
      eventType: "RouteEvaluated",
      timestamp: Date.now() - 8000,
      routeId: swap.requestedRouteId ?? swap.routeId,
      message: `用 ${formatAmount(swap.amountIn)} ${swap.tokenIn} 换 ${swap.tokenOut}`,
    },
  ];

  if (agentBypassed) {
    steps.push({
      id: "bypass",
      eventType: "ExecutionAttempted",
      timestamp: Date.now() - 5000,
      routeId: swap.executedRouteId ?? swap.routeId,
      message: `Unsafe 模式跳过 Agent，直接在 ${demoChainName} 发起 swap`,
    });
  } else if (decision || swap.agentDecision) {
    const d = decision?.decision ?? swap.agentDecision;
    steps.push({
      id: "agent",
      eventType: "DecisionMade",
      timestamp: Date.now() - 5000,
      routeId: swap.requestedRouteId ?? swap.routeId,
      decision: d,
      message:
        d === "ALLOW"
          ? "Agent 放行，可以执行"
          : d === "REJECT"
            ? "Agent 拒绝该路由"
            : d === "FALLBACK_TO_SAFE_ROUTE"
              ? "Agent 建议改走 SAFE 池"
              : `Agent 结论：${d ?? "—"}`,
    });
  }

  steps.push({
    id: "result",
    eventType: success ? "SwapExecuted" : "SwapFailed",
    timestamp: Date.now(),
    routeId: swap.executedRouteId ?? swap.routeId,
    message: success
      ? `到账 ${formatAmount(swap.actualOut)} ${swap.tokenOut}`
      : swap.failureMessage ?? `${swap.tokenIn} → ${swap.tokenOut} 未成功`,
    txHash: swap.txHash || undefined,
  });

  return steps;
}

function buildTimelineFromEvents(
  events: Event[],
  swap: SwapResult,
  decision: Decision | null | undefined,
  success: boolean,
  agentBypassed: boolean,
  demoChainName: string
): Event[] {
  const txHash = swap.txHash?.toLowerCase();
  if (!txHash) {
    return buildSyntheticTimeline(swap, decision, success, agentBypassed, demoChainName);
  }

  const txMatched = events.filter((event) => eventTxHash(event) === txHash);
  const terminal = txMatched.find(
    (event) => event.eventType === "SwapExecuted" || event.eventType === "SwapFailed"
  );
  const correlationId =
    typeof terminal?.context?.correlationId === "string"
      ? terminal.context.correlationId
      : undefined;

  const relatedMap = new Map<string, Event>();
  for (const event of txMatched) {
    relatedMap.set(event.id, event);
  }
  if (correlationId) {
    for (const event of events) {
      if (event.context?.correlationId === correlationId) {
        relatedMap.set(event.id, event);
      }
    }
  }

  const related = dedupeTimelineByType(
    [...relatedMap.values()]
      .filter((event) => TIMELINE_EVENT_TYPES.has(event.eventType))
      .sort((a, b) => a.timestamp - b.timestamp)
  );

  if (related.length >= 2) {
    return related;
  }

  return buildSyntheticTimeline(swap, decision, success, agentBypassed, demoChainName);
}

export function ExecutionResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const state = (location.state ?? {}) as LocationState;
  const [events, setEvents] = useState<Event[]>([]);
  const [demoChainName, setDemoChainName] = useState("Demo 链");

  const txFromUrl = searchParams.get("tx") ?? undefined;

  useEffect(() => {
    api.events().then(setEvents).catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    void fetchDemoChainConfig().then((chain) => {
      if (chain?.chainName) setDemoChainName(chain.chainName);
    });
  }, []);

  const swap = useMemo(() => {
    if (state.swap && (!txFromUrl || state.swap.txHash === txFromUrl)) {
      return state.swap;
    }
    if (txFromUrl && events.length > 0) {
      return buildSwapResultFromEvents(events, txFromUrl);
    }
    return state.swap;
  }, [state.swap, txFromUrl, events]);

  const decision = state.decision;
  const success = swap?.success === true;
  const gasUsed = swap?.gasUsed ? Number(swap.gasUsed) : 0;
  const agentBypassed = swap?.agentBypassed || swap?.safetyMode === "force";
  const preSwapBlocked =
    swap?.safetyMode === "force" &&
    (swap?.failureCode === "SLIPPAGE_EXCEEDED" ||
      swap?.failureCode === "QUOTE_DEVIATION_EXCEEDED") &&
    !swap.onChainFailure &&
    gasUsed === 0;
  const onChainSettlementFailed = !success && Boolean(swap?.txHash) && gasUsed > 0;
  const suspiciousQuoteBlocked = swap?.failureCode === "QUOTE_DEVIATION_EXCEEDED";

  const headline = success
    ? "交易成功"
    : preSwapBlocked
      ? suspiciousQuoteBlocked
        ? "异常报价拦截"
        : "滑点保护拦截"
      : onChainSettlementFailed
        ? "链上结算异常"
        : gasUsed > 0
          ? "链上执行失败"
          : "执行被拦截";

  const timelineEvents: Event[] = useMemo(() => {
    if (!swap) return events.slice(-8);
    return buildTimelineFromEvents(
      events,
      swap,
      decision,
      success,
      agentBypassed,
      demoChainName
    );
  }, [swap, events, decision, success, agentBypassed, demoChainName]);

  return (
    <div className="sentinel-exec-page">
      {!swap && (
        <div className="sentinel-card sentinel-exec-empty">
          <p>暂无本次执行记录。</p>
          <Link to="/transaction" className="sentinel-btn sentinel-btn-primary" style={{ textDecoration: "none" }}>
            前往交易页
          </Link>
        </div>
      )}

      {swap && (
        <div className="sentinel-exec-layout">
          <div className="sentinel-card sentinel-exec-main">
            <div className="sentinel-exec-main-head">
              <span className="sentinel-exec-hero-icon" aria-hidden>
                {success ? "✅" : "🚫"}
              </span>
              <div className="sentinel-exec-main-head-text">
                <div
                  className="sentinel-exec-hero-headline"
                  style={{ color: success ? "var(--green)" : "var(--red)" }}
                >
                  {headline}
                </div>
                <p className="sentinel-exec-hero-sub">
                  用 {formatAmount(swap.amountIn)} {swap.tokenIn} 换 {swap.tokenOut}
                  {swap.poolLabel ? ` · ${swap.poolLabel} 池` : ""}
                  {agentBypassed ? " · Unsafe" : " · Safe"}
                </p>
                <p className="sentinel-exec-meta">
                  路由 {swap.executedRouteId ?? swap.routeId}
                  {swap.agentDecision && !agentBypassed
                    ? ` · Agent ${swap.agentDecision === "ALLOW" ? "放行" : swap.agentDecision === "REJECT" ? "拒绝" : "换路"}`
                    : ""}
                  {swap.executionMode ? ` · ${swap.executionMode === "router" ? "Router 一笔" : "Direct 多步"}` : ""}
                </p>
              </div>
            </div>

            <SettlementSummary
              swap={swap}
              success={success}
              preSwapBlocked={preSwapBlocked}
              gasUsed={gasUsed}
            />

            <div className="sentinel-exec-footer-row">
              <div className="sentinel-exec-actions">
                {swap.txHash ? (
                  <a
                    className="sentinel-exec-tx-link"
                    href={`${MONAD_EXPLORER_TX}${swap.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    在 Monad 浏览器查看交易
                  </a>
                ) : (
                  <span className="sentinel-exec-tx-muted">未广播到链上</span>
                )}
                {success && (
                  <button
                    type="button"
                    className="sentinel-btn sentinel-btn-secondary"
                    onClick={() => navigate("/profile")}
                  >
                    查看账户与勋章
                  </button>
                )}
                <Link to="/transaction" className="sentinel-btn sentinel-btn-ghost">
                  继续交易
                </Link>
              </div>
            </div>
          </div>

          {timelineEvents.length > 0 && <Timeline events={timelineEvents} />}
        </div>
      )}
    </div>
  );
}

function SettlementSummary({
  swap,
  success,
  preSwapBlocked,
  gasUsed,
}: {
  swap: SwapResult;
  success: boolean;
  preSwapBlocked: boolean;
  gasUsed: number;
}) {
  const slippageMode = swap.safetyMode === "force" || swap.agentBypassed;
  const stats: Array<{ label: string; value: string; tone?: "green" | "red" | "muted" }> = [
    { label: "参考价（SAFE 池）", value: formatAmount(swap.expectedOut) },
    { label: "本次报价", value: formatAmount(swap.quotedOut) },
    {
      label: "实际到手",
      value: preSwapBlocked ? "—" : formatAmount(swap.actualOut),
      tone: success ? "green" : preSwapBlocked ? "muted" : "red",
    },
    {
      label: "Gas 消耗",
      value: gasUsed > 0 ? gasUsed.toLocaleString() : "—",
      tone: success ? "green" : gasUsed > 0 ? "red" : "muted",
    },
  ];

  return (
    <div className="sentinel-exec-settlement">
      {stats.map((stat) => (
        <div key={stat.label} className="sentinel-exec-stat">
          <span className="sentinel-exec-stat-label">{stat.label}</span>
          <strong
            className="sentinel-exec-stat-value"
            style={{
              color:
                stat.tone === "green"
                  ? "var(--green)"
                  : stat.tone === "red"
                    ? "var(--red)"
                    : "var(--text)",
            }}
          >
            {stat.value}
          </strong>
        </div>
      ))}

      {slippageMode && swap.amountOutMin !== undefined && swap.amountOutMax !== undefined && (
        <p className="sentinel-exec-extra">
          允许区间（± {swap.slippageBps !== undefined ? `${(swap.slippageBps / 100).toFixed(1)}%` : "滑点"}）：
          {formatAmount(swap.amountOutMin)} ~ {formatAmount(swap.amountOutMax)}
        </p>
      )}
      {!slippageMode && !swap.sdaExecutionWindow && (
        <p className="sentinel-exec-extra">Safe 模式 · Agent 把关，不设滑点带</p>
      )}
      {swap.sdaExecutionWindow && (
        <p className="sentinel-exec-extra">
          SDA 等待 {swap.sdaWaitedSeconds ?? swap.sdaWindowSeconds ?? 15} 秒
          {swap.quotedOutAtOpen !== undefined
            ? ` · 窗口开启时报价 ${formatAmount(swap.quotedOutAtOpen)}`
            : ""}
        </p>
      )}
      {!success && swap.failureMessage && (
        <p className="sentinel-exec-failure-msg">{swap.failureMessage}</p>
      )}
    </div>
  );
}

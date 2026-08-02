import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { buildSwapResultFromEvents } from "../lib/swapResult";
import { fetchDemoChainConfig } from "../lib/wallet";
import type { Decision, Event, SwapResult } from "../types";
import { SecurityGauge } from "./shared/SecurityGauge";
import { AccountCard } from "./shared/AccountCard";
import { Timeline } from "./Timeline";

interface LocationState {
  swap?: SwapResult;
  decision?: Decision | null;
}

function formatAmount(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(4);
}

export function ExecutionResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const state = (location.state ?? {}) as LocationState;
  const [events, setEvents] = useState<Event[]>([]);
  const [loadedFromChain, setLoadedFromChain] = useState(false);
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

  useEffect(() => {
    setLoadedFromChain(Boolean(txFromUrl && events.length > 0 && swap?.txHash === txFromUrl));
  }, [txFromUrl, events.length, swap?.txHash]);

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

    const txHash = swap.txHash;
    const chainEvents = txHash
      ? events.filter(
          (event) =>
            event.txHash === txHash ||
            event.context?.txHash === txHash ||
            (event.context?.executedRouteId === swap.executedRouteId &&
              (event.eventType === "ExecutionAttempted" ||
                event.eventType === "SwapExecuted" ||
                event.eventType === "SwapFailed"))
        )
      : [];

    if (chainEvents.length > 0) {
      return chainEvents.slice(-8);
    }

    const steps: Event[] = [
      {
        id: "route",
        eventType: "RouteEvaluated",
        timestamp: Date.now() - 8000,
        routeId: swap.requestedRouteId ?? swap.routeId,
        message: `路由 ${swap.requestedRouteId ?? swap.routeId}（链上报价）`,
      },
    ];

    if (agentBypassed) {
      steps.push({
        id: "bypass",
        eventType: "ExecutionAttempted",
        timestamp: Date.now() - 5000,
        routeId: swap.executedRouteId ?? swap.routeId,
        message: `Unsafe 模式：跳过 Safety Agent，直连 ${demoChainName} swap`,
      });
    } else if (decision || swap.agentDecision) {
      steps.push({
        id: "agent",
        eventType: "DecisionMade",
        timestamp: Date.now() - 5000,
        routeId: swap.requestedRouteId ?? swap.routeId,
        decision: decision?.decision ?? swap.agentDecision,
        message: `Agent: ${decision?.decision ?? swap.agentDecision ?? "—"}`,
      });
    }

    steps.push({
      id: "result",
      eventType: success ? "SwapExecuted" : "SwapFailed",
      timestamp: Date.now(),
      routeId: swap.executedRouteId ?? swap.routeId,
      message: success
        ? `链上实收 ${formatAmount(swap.actualOut)} ${swap.tokenOut}`
        : swap.failureMessage ?? `执行失败 ${swap.tokenIn}→${swap.tokenOut}`,
      txHash: swap.txHash || undefined,
    });

    return steps;
  }, [swap, events, decision, success, agentBypassed, demoChainName]);

  return (
    <div>
      <AccountCard />
      <h2 className="sentinel-title">执行结果</h2>

      {loadedFromChain && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          已从后端事件流恢复链上交易 {txFromUrl?.slice(0, 10)}… 的真实结算数据。
        </p>
      )}

      {!swap && (
        <div className="sentinel-card" style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
            暂无本次会话的执行记录，以下为最近链上事件。
          </p>
          <Link to="/transaction" className="sentinel-btn sentinel-btn-primary" style={{ textDecoration: "none" }}>
            前往交易页
          </Link>
        </div>
      )}

      <div className="sentinel-exec-grid">
        <div className="sentinel-card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>{success ? "✅" : "🚫"}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: success ? "var(--green)" : "var(--red)" }}>
            {headline}
          </div>
          {swap && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
              {swap.tokenIn} → {swap.tokenOut}
              {swap.poolLabel ? ` · ${swap.poolLabel} 池` : ""}
              {swap.executedRouteId ? ` · ${swap.executedRouteId}` : ""}
              {agentBypassed ? " · Unsafe 直连" : ""}
              {swap.sdaExecutionWindow
                ? ` · SDA 窗口 ${swap.sdaWaitedSeconds ?? swap.sdaWindowSeconds ?? 15}s`
                : ""}
            </p>
          )}
          {swap && <SettlementSummary swap={swap} success={success} preSwapBlocked={preSwapBlocked} />}
          {success && (
            <button
              type="button"
              className="sentinel-btn sentinel-btn-secondary"
              style={{ marginTop: 16 }}
              onClick={() => navigate("/profile")}
            >
              查看账户与勋章
            </button>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">本次 Gas 消耗</div>
          <GasUsagePanel
            gasUsed={gasUsed}
            success={success}
            executionMode={swap?.executionMode}
            preSwapBlocked={preSwapBlocked}
            onChainSettlementFailed={onChainSettlementFailed}
            suspiciousQuoteBlocked={suspiciousQuoteBlocked}
          />
          {swap?.txHash ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--blue)",
                wordBreak: "break-all",
              }}
            >
              Tx: {swap.txHash}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>无链上交易哈希（未广播）</div>
          )}
        </div>

        <div className="sentinel-card">
          <SecurityGauge score={success ? 85 : preSwapBlocked ? 72 : 35} size={120} />
        </div>
      </div>

      {timelineEvents.length > 0 && <Timeline events={timelineEvents} />}
    </div>
  );
}

function SettlementSummary({
  swap,
  success,
  preSwapBlocked,
}: {
  swap: SwapResult;
  success: boolean;
  preSwapBlocked: boolean;
}) {
  const slippageMode = swap.safetyMode === "force" || swap.agentBypassed;
  const rows: Array<{ label: string; value: string; highlight?: "red" | "green" }> = [
    { label: "公允价 (SAFE 池 · 链上)", value: formatAmount(swap.expectedOut) },
    { label: "路由报价 (链上 reserves)", value: formatAmount(swap.quotedOut) },
    {
      label: "链上实收 (balance Δ)",
      value: preSwapBlocked ? "—（未上链）" : formatAmount(swap.actualOut),
      highlight: success ? "green" : preSwapBlocked ? undefined : "red",
    },
  ];

  if (slippageMode && swap.amountOutMin !== undefined && swap.amountOutMax !== undefined) {
    rows.push({
      label: `允许区间 (± ${swap.slippageBps !== undefined ? `${(swap.slippageBps / 100).toFixed(1)}%` : "滑点"})`,
      value: `${formatAmount(swap.amountOutMin)} ~ ${formatAmount(swap.amountOutMax)}`,
    });
  } else if (swap.sdaExecutionWindow) {
    rows.push({
      label: "SDA 执行窗口",
      value: `${swap.sdaWaitedSeconds ?? swap.sdaWindowSeconds ?? 15}s 链上 finality 等待`,
    });
    if (swap.quotedOutAtOpen !== undefined) {
      rows.push({
        label: "窗口开启时报价",
        value: formatAmount(swap.quotedOutAtOpen),
      });
    }
  } else if (!slippageMode) {
    rows.push({
      label: "保护策略",
      value: "Safety Agent（无滑点校验）",
    });
  }

  return (
    <div
      style={{
        marginTop: 16,
        textAlign: "left",
        fontSize: 12,
        borderTop: "1px solid var(--border)",
        paddingTop: 12,
      }}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 6,
            color:
              row.highlight === "red"
                ? "var(--red)"
                : row.highlight === "green"
                  ? "var(--green)"
                  : "var(--text-muted)",
          }}
        >
          <span>{row.label}</span>
          <strong style={{ color: row.highlight ? undefined : "var(--text)" }}>{row.value}</strong>
        </div>
      ))}
      {!success && swap.failureMessage && (
        <p style={{ marginTop: 8, color: "var(--red)", lineHeight: 1.5 }}>{swap.failureMessage}</p>
      )}
    </div>
  );
}

function GasUsagePanel({
  gasUsed,
  success,
  executionMode,
  preSwapBlocked,
  onChainSettlementFailed,
  suspiciousQuoteBlocked,
}: {
  gasUsed: number;
  success: boolean;
  executionMode?: SwapResult["executionMode"];
  preSwapBlocked?: boolean;
  onChainSettlementFailed?: boolean;
  suspiciousQuoteBlocked?: boolean;
}) {
  const modeLabel =
    executionMode === "router"
      ? "Router（Vault + Swap）"
      : executionMode === "direct"
        ? "Direct swap"
        : "链上执行";

  if (success) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: 20,
          borderRadius: 10,
          background: "rgba(0,255,136,0.08)",
          border: "1px solid rgba(0,255,136,0.35)",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 8 }}>
          链上结算通过
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-display)" }}>
          {gasUsed > 0 ? gasUsed.toLocaleString() : "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
          {gasUsed > 0
            ? `${modeLabel} 已完成；实收来自链上 balance 差值。`
            : "结算校验通过，但未记录 Gas 数据。"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 20,
        borderRadius: 10,
        background: "rgba(248,81,73,0.08)",
        border: "1px solid rgba(248,81,73,0.35)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 8 }}>
        {preSwapBlocked
          ? suspiciousQuoteBlocked
            ? "TOXIC 报价拦截 · 未上链"
            : "滑点拦截 · 未上链"
          : onChainSettlementFailed
            ? "已上链 · 结算未通过"
            : gasUsed > 0
              ? "失败执行 · Gas 已消耗"
              : "执行未成功"}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "var(--red)", fontFamily: "var(--font-display)" }}>
        {gasUsed > 0 ? gasUsed.toLocaleString() : "0"}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
        {preSwapBlocked
          ? suspiciousQuoteBlocked
            ? "TOXIC 池报价高于公允价上限，交易未发送，不消耗 Gas。"
            : "报价低于公允价减滑点下限，交易未发送，不消耗 Gas。"
          : onChainSettlementFailed
            ? "交易已上链，但链上实收不在允许区间内，视为失败；Gas 已消耗。"
            : gasUsed > 0
              ? "交易已上链但未完成 swap（例如合约 revert），Gas 无法退回。"
              : "Agent 拦截或请求失败，未产生链上 Gas 消耗。"}
      </div>
    </div>
  );
}

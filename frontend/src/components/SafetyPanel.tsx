
interface Decision {
  decision: "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
  riskScore: number;
  reason: string;
  flags: string[];
  fallbackRouteId?: string | null;
}

interface Props {
  decision: Decision | null;
  safeMode?: boolean;
  onSwitchToFallback?: (fallbackRouteId: string) => void;
}

const FLAG_LABELS: Record<string, string> = {
  quote_deviation: "报价偏差过大",
  failure_risk: "历史失败率高",
  pool_risk: "池子风险高",
  high_quote_deviation: "报价偏差过大",
  high_failure_rate: "历史失败率高",
  high_pool_risk: "池子风险高",
  sda_pool: "SDA 跨链窗口风险",
  toxic_pool: "TOXIC 池诱多报价",
  execution_window_risk: "执行窗口漂移",
  agent_bypassed: "Agent 已绕过",
};

function getSafetyLevel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "危险", color: "#f85149" };
  if (score >= 40) return { label: "警告", color: "#d29922" };
  return { label: "安全", color: "#3fb950" };
}

export function SafetyPanel({ decision, safeMode = true, onSwitchToFallback }: Props) {
  if (!safeMode) {
    return (
      <div
        style={{
          background: "#161b22",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
          border: "1px solid rgba(218, 54, 51, 0.35)",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 12,
            color: "#f85149",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Unsafe 执行保护
        </h3>
        <div
          style={{
            background: "#0d1117",
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            color: "#c9d1d9",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#f85149" }}>Safety Agent 已绕过。</strong>{" "}
          唯一保护为滑点带宽校验：实际报价须在 SAFE 池公允价 ± 滑点范围内，否则交易在
          MetaMask 前被拦截。
        </div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div
        style={{
          background: "#161b22",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
          border: "1px solid #30363d",
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#484f58",
          fontSize: 14,
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        点击「获取报价」后选择路由，再点击「风险评估」查看 Safety Agent 决策
      </div>
    );
  }

  const statusColor =
    decision.decision === "ALLOW"
      ? "#3fb950"
      : decision.decision === "REJECT"
        ? "#f85149"
        : "#d29922";

  const statusLabel =
    decision.decision === "ALLOW"
      ? "✅ 放行 ALLOW"
      : decision.decision === "REJECT"
        ? "🚫 拒绝 REJECT"
        : "⚠️ 建议切换路由（需手动操作）";

  const safetyLevel = getSafetyLevel(decision.riskScore);

  return (
    <div
      style={{
        background: "#161b22",
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        border: `1px solid ${statusColor}44`,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          color: "#8b949e",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Safety Agent 决策
      </h3>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: statusColor,
          }}
        >
          {statusLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 12,
              background: `${safetyLevel.color}22`,
              color: safetyLevel.color,
              border: `1px solid ${safetyLevel.color}44`,
            }}
          >
            {safetyLevel.label}
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: safetyLevel.color,
            }}
          >
            {decision.riskScore}/100
          </span>
        </div>
      </div>

      <div
        style={{
          background: "#0d1117",
          borderRadius: 8,
          padding: 12,
          fontSize: 13,
          color: "#c9d1d9",
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        {decision.reason}
      </div>

      {decision.flags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {decision.flags.map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: "#f8514922",
                color: "#f85149",
                border: "1px solid #f8514944",
              }}
            >
              {FLAG_LABELS[flag] ?? flag}
            </span>
          ))}
        </div>
      )}

      {decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            background: "#d2992211",
            borderRadius: 8,
            border: "1px solid #d2992244",
          }}
        >
          <div style={{ fontSize: 13, color: "#d29922", marginBottom: 10 }}>
            当前路由风险偏高，Agent 建议切换到更安全的{" "}
            <strong>{decision.fallbackRouteId}</strong>。
            <span style={{ display: "block", marginTop: 6, color: "#8b949e" }}>
              不会自动改路由 — 请点击下方按钮手动切换后再执行。
            </span>
          </div>
          {onSwitchToFallback && (
            <button
              onClick={() => onSwitchToFallback(decision.fallbackRouteId!)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#d29922",
                color: "#0d1117",
              }}
            >
              切换到安全路由 {decision.fallbackRouteId}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

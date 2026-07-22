
interface Decision {
  decision: "ALLOW" | "REJECT" | "FALLBACK_TO_SAFE_ROUTE";
  riskScore: number;
  reason: string;
  flags: string[];
  fallbackRouteId?: string | null;
}

interface Props {
  decision: Decision | null;
}

export function SafetyPanel({ decision }: Props) {
  if (!decision) {
    return (
      <div style={{
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
      }}>
        Run a quote & evaluate to see Safety Agent decision
      </div>
    );
  }

  const statusColor =
    decision.decision === "ALLOW" ? "#3fb950"
    : decision.decision === "REJECT" ? "#f85149"
    : "#d29922";

  const statusLabel =
    decision.decision === "ALLOW" ? "✅ ALLOW"
    : decision.decision === "REJECT" ? "🚫 REJECT"
    : "⚠️ FALLBACK";

  return (
    <div style={{
      background: "#161b22",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      border: `1px solid ${statusColor}44`,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1 }}>
        Safety Agent Decision
      </h3>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{
          fontSize: 18,
          fontWeight: 700,
          color: statusColor,
        }}>
          {statusLabel}
        </span>
        <span style={{
          fontSize: 24,
          fontWeight: 700,
          color: decision.riskScore >= 70 ? "#f85149" : decision.riskScore >= 40 ? "#d29922" : "#3fb950",
        }}>
          {decision.riskScore}/100
        </span>
      </div>

      <div style={{
        background: "#0d1117",
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        color: "#c9d1d9",
        lineHeight: 1.6,
        marginBottom: 12,
      }}>
        {decision.reason}
      </div>

      {decision.flags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {decision.flags.map(flag => (
            <span key={flag} style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: "#f8514922",
              color: "#f85149",
              border: "1px solid #f8514944",
            }}>
              {flag}
            </span>
          ))}
        </div>
      )}

      {decision.decision === "FALLBACK_TO_SAFE_ROUTE" && decision.fallbackRouteId && (
        <div style={{
          marginTop: 12,
          padding: 8,
          background: "#d2992222",
          borderRadius: 6,
          fontSize: 12,
          color: "#d29922",
        }}>
          Fallback route: {decision.fallbackRouteId}
        </div>
      )}
    </div>
  );
}

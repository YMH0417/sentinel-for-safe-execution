
interface Event {
  eventType: string;
  message: string;
  txHash?: string;
}

interface Props {
  event: Event;
  decision?: { decision: string; riskScore: number } | null;
}

export function ResultPanel({ event, decision }: Props) {
  const isSuccess =
    event.eventType === "ExecutionSuccess" ||
    event.eventType === "SwapExecuted" ||
    event.message.includes("Executed") ||
    event.message.includes("Swap ");

  return (
    <div style={{
      background: isSuccess ? "#3fb95011" : "#f8514911",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      border: `1px solid ${isSuccess ? "#3fb95044" : "#f8514944"}`,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: isSuccess ? "#3fb950" : "#f85149", textTransform: "uppercase", letterSpacing: 1 }}>
        {isSuccess ? "✅ Execution Result" : "🚫 Execution Blocked"}
      </h3>
      <p style={{ fontSize: 14, color: "#c9d1d9", marginBottom: 8 }}>{event.message}</p>
      {event.txHash && (
        <p style={{ fontSize: 12, color: "#58a6ff", fontFamily: "monospace" }}>
          Tx: {event.txHash}
        </p>
      )}
      {decision && (
        <div style={{
          marginTop: 12,
          padding: 8,
          background: "#0d1117",
          borderRadius: 6,
          fontSize: 12,
          color: "#8b949e",
        }}>
          Agent Decision: {decision.decision} | Risk Score: {decision.riskScore}/100
        </div>
      )}
    </div>
  );
}


interface Event {
  id: string;
  eventType: string;
  timestamp: number;
  message: string;
  decision?: string;
  riskScore?: number;
}

interface Props {
  events: Event[];
}

export function Timeline({ events }: Props) {
  return (
    <div style={{
      background: "#161b22",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #30363d",
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1 }}>
        Event Timeline
      </h3>
      <div style={{ position: "relative", paddingLeft: 20 }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute",
          left: 4,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#30363d",
        }} />

        {events.map((event, idx) => (
          <div key={event.id || idx} style={{
            position: "relative",
            marginBottom: 16,
            paddingLeft: 16,
          }}>
            {/* Dot */}
            <div style={{
              position: "absolute",
              left: -16,
              top: 2,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: event.eventType.includes("Success")
                ? "#3fb950"
                : event.eventType.includes("Reject") || event.eventType.includes("Rejected")
                ? "#f85149"
                : event.eventType.includes("Fallback")
                ? "#d29922"
                : "#58a6ff",
              border: "2px solid #161b22",
            }} />

            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#c9d1d9",
              marginBottom: 2,
            }}>
              {event.eventType}
              {event.decision && (
                <span style={{
                  marginLeft: 8,
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  background: event.decision === "ALLOW" ? "#3fb95022" : event.decision === "REJECT" ? "#f8514922" : "#d2992222",
                  color: event.decision === "ALLOW" ? "#3fb950" : event.decision === "REJECT" ? "#f85149" : "#d29922",
                }}>
                  {event.decision}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#8b949e" }}>{event.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


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

const EVENT_LABEL: Record<string, string> = {
  RouteEvaluated: "获取报价",
  DecisionMade: "Agent 评估",
  FallbackRequired: "建议换路",
  ExecutionAttempted: "发起链上交易",
  SwapExecuted: "换币成功",
  SwapFailed: "换币失败",
  ExecutionSuccess: "执行成功",
  ExecutionRejected: "执行被拒",
  SdaExecutionWindowWaiting: "SDA 等待窗口",
  SwapBatchCompleted: "批量验证完成",
  AIAnalysisCompleted: "AI 解读完成",
};

const DECISION_LABEL: Record<string, string> = {
  ALLOW: "放行",
  REJECT: "拒绝",
  FALLBACK_TO_SAFE_ROUTE: "换路",
};

const MESSAGE_LABEL: Record<string, string> = {
  "Swap execution attempted through router mode": "通过 Router 发起换币",
  "Swap executed successfully": "换币已完成",
  "Swap failed on chain": "链上换币失败",
};

function humanMessage(message: string): string {
  return MESSAGE_LABEL[message] ?? message;
}

function dotColor(eventType: string, decision?: string): string {
  if (eventType.includes("Executed") || eventType.includes("Success")) return "var(--green)";
  if (eventType.includes("Failed") || eventType.includes("Reject")) return "var(--red)";
  if (eventType.includes("Fallback") || decision === "FALLBACK_TO_SAFE_ROUTE") return "var(--yellow)";
  return "var(--cyan)";
}

export function Timeline({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="sentinel-card sentinel-exec-timeline">
      <h3 className="sentinel-exec-timeline-title">执行步骤</h3>
      <div className="sentinel-exec-timeline-track">
        {events.map((event, idx) => {
          const label = EVENT_LABEL[event.eventType] ?? event.eventType;
          const decisionLabel = event.decision ? DECISION_LABEL[event.decision] ?? event.decision : null;

          return (
            <div key={event.id || idx} className="sentinel-exec-timeline-item">
              <div
                className="sentinel-exec-timeline-dot"
                style={{ background: dotColor(event.eventType, event.decision) }}
              />
              <div className="sentinel-exec-timeline-body">
                <div className="sentinel-exec-timeline-head">
                  <span>{label}</span>
                  {decisionLabel && (
                    <span className={`sentinel-exec-timeline-badge sentinel-exec-timeline-badge--${event.decision}`}>
                      {decisionLabel}
                    </span>
                  )}
                </div>
                {event.message && <p className="sentinel-exec-timeline-msg">{humanMessage(event.message)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

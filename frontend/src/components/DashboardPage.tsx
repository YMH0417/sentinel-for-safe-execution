import { useNavigate } from "react-router-dom";
import { useToast } from "./Toast";

interface ChainInfo {
  name: string;
  score: number;
  anomalies: number;
  statusColor: "green" | "yellow" | "red";
}

const CHAIN_DATA: ChainInfo[] = [
  { name: "Chain A", score: 92, anomalies: 0, statusColor: "green" },
  { name: "Chain B", score: 65, anomalies: 2, statusColor: "yellow" },
  { name: "Chain C", score: 35, anomalies: 5, statusColor: "red" },
];

const ALERT_DATA = [
  { time: "2m ago", chain: "Chain B", msg: "报价偏离 2.3%" },
  { time: "15m ago", chain: "Chain C", msg: "失败率 42%" },
  { time: "2m ago", chain: "Chain B", msg: "报价偏离 2.3%" },
  { time: "15m ago", chain: "Chain C", msg: "失败率 42%" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const overallScore = Math.round(CHAIN_DATA.reduce((s, c) => s + c.score, 0) / CHAIN_DATA.length);
  const totalAnomalies = CHAIN_DATA.reduce((s, c) => s + c.anomalies, 0);
  const totalAlerts = ALERT_DATA.length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* --- Overall Security Score --- */}
      <div style={{
        background: "#161b22", borderRadius: 12, padding: 20, marginBottom: 20,
        border: "1px solid #30363d",
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#8b949e", marginBottom: 12, letterSpacing: 1, textTransform: "uppercase" }}>
          安全总览
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#58a6ff" strokeWidth="2"/>
            <path d="M12 7v5l3 3" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#e1e4e8" }}>
            整体安全评分 <span style={{ color: overallScore >= 70 ? "#3fb950" : overallScore >= 40 ? "#d29922" : "#f85149" }}>{overallScore}</span><span style={{ color: "#8b949e", marginLeft: 4 }}> /100</span>
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8b949e" }}>
          监控 {CHAIN_DATA.length} 条链 · {totalAnomalies} 条异常 · {totalAlerts} 条告警
        </p>
      </div>

      {/* --- Chain Cards --- */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {CHAIN_DATA.map(c => {
          const dotColor = c.statusColor === "green" ? "#3fb950" : c.statusColor === "yellow" ? "#d29922" : "#f85149";
          return (
            <div key={c.name} style={{
              flex: 1, background: "#161b22", borderRadius: 10, padding: "16px 14px",
              border: "1px solid #30363d",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e1e4e8", marginBottom: 8 }}>{c.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor }} />
                <span style={{ fontSize: 22, fontWeight: 700, color: "#e1e4e8" }}>{c.score}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8b949e" }}>
                {c.anomalies === 0 ? "0 异常" : `${c.anomalies} 异常`}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- Recent Alerts --- */}
      <div style={{
        background: "#161b22", borderRadius: 12, padding: 20, marginBottom: 24,
        border: "1px solid #30363d",
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#8b949e", marginBottom: 12, letterSpacing: 1, textTransform: "uppercase" }}>
          最近告警
        </h3>
        {ALERT_DATA.map((a, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 0", borderBottom: i < ALERT_DATA.length - 1 ? "1px solid #21262d" : "none",
            fontSize: 13, color: "#c9d1d9",
          }}>
            <span style={{ fontSize: 14 }}>⏰</span>
            <span style={{ color: "#484f58", minWidth: 40, fontSize: 12 }}>{a.time}</span>
            <span style={{ color: "#8b949e", minWidth: 60 }}>{a.chain}</span>
            <span style={{ color: "#f85149" }}>{a.msg}</span>
          </div>
        ))}
      </div>

      {/* --- CTA Button --- */}
      <button
        onClick={() => {
          showToast({ type: "info", message: "正在跳转至交易检测页面..." });
          navigate("/transaction");
        }}
        style={{
          width: "100%", padding: "14px 24px", fontSize: 15, fontWeight: 600,
          borderRadius: 8, border: "1px solid #58a6ff44", cursor: "pointer",
          background: "rgba(88,166,255,0.08)", color: "#58a6ff",
          letterSpacing: 1, fontFamily: "'Courier New', monospace",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(88,166,255,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(88,166,255,0.08)"; }}
      >
        <span style={{ marginRight: 8 }}>🔍</span>发起交易检测
      </button>
    </div>
  );
}

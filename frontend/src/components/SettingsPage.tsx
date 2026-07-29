import { useEffect, useState } from "react";
import { api, type DebugStatus } from "../api/client";

export function SettingsPage() {
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.debugStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const clearEvents = async () => {
    setClearing(true);
    setMsg("");
    try {
      const res = await fetch("/api/events/clear", { method: "POST" });
      if (!res.ok) throw new Error("清除失败");
      setMsg("事件日志已清空");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "清除失败");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <h2 className="sentinel-title">设置</h2>

      <div className="sentinel-grid-2">
        <div className="sentinel-card">
          <div className="sentinel-label">网络环境</div>
          {status ? (
            <ul style={{ listStyle: "none", fontSize: 14, lineHeight: 2 }}>
              <li>模式：<strong>{status.chainMode}</strong></li>
              <li>链 ID：<strong>{status.expectedChainId ?? "—"}</strong></li>
              <li>链名称：<strong>{status.chainName ?? "—"}</strong></li>
              <li>RPC：<code style={{ fontSize: 12 }}>{status.anvilRpcUrl ?? "—"}</code></li>
              <li>Router Swap：<strong style={{ color: status.routerSwapAvailable ? "var(--green)" : "var(--red)" }}>{status.routerSwapAvailable ? "可用" : "不可用"}</strong></li>
            </ul>
          ) : (
            <p style={{ color: "var(--text-dim)" }}>无法读取 backend 状态</p>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">开发者</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            清空内存 + JSONL 事件日志（仅本地 demo 使用）。
          </p>
          <button type="button" className="sentinel-btn sentinel-btn-danger" onClick={clearEvents} disabled={clearing}>
            {clearing ? "清除中..." : "清空事件日志"}
          </button>
          {msg && <p style={{ marginTop: 12, fontSize: 13, color: "var(--green)" }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}

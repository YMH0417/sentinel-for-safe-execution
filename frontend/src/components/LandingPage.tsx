import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";

export function LandingPage() {
  const navigate = useNavigate();
  const { connectWallet, isConnecting, account } = useWallet();
  const { showToast } = useToast();

  const handleConnect = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "钱包已连接" });
      navigate("/dashboard");
    } catch (e) {
      showToast({ type: "error", message: e instanceof Error ? e.message : "连接失败" });
    }
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", minHeight: "calc(100vh - 60px)" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 400,
          background: "radial-gradient(circle, rgba(0,255,136,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        className="landing-grid"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "60px 24px",
          position: "relative",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              letterSpacing: 4,
              color: "var(--cyan)",
              marginBottom: 16,
            }}
          >
            — DEFI SECURITY —
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: 4,
              marginBottom: 16,
              lineHeight: 1.1,
            }}
          >
            SENTINEL
          </h1>
          <p style={{ fontSize: 22, color: "var(--text-muted)", marginBottom: 8, fontFamily: "var(--font-display)" }}>
            Don&apos;t trade <span style={{ color: "var(--green)" }}>naked</span>.
          </p>
          <p style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 32, lineHeight: 1.6 }}>
            Every route analyzed. Every contract scored.
            <br />
            Agent 软规则 + Vault 硬约束，swap 前识别高风险路径。
          </p>

          {account ? (
            <button type="button" className="sentinel-btn sentinel-btn-primary" onClick={() => navigate("/dashboard")} style={{ padding: "14px 28px", fontSize: 16 }}>
              进入仪表盘 →
            </button>
          ) : (
            <button
              type="button"
              className="sentinel-btn sentinel-btn-primary"
              onClick={handleConnect}
              disabled={isConnecting}
              style={{ padding: "14px 28px", fontSize: 16, letterSpacing: 1 }}
            >
              ⬡ {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          )}
        </div>

        <div
          style={{
            borderRadius: 24,
            border: "2px solid rgba(0,255,136,0.25)",
            background: "linear-gradient(145deg, rgba(0,255,136,0.06), rgba(0,255,255,0.04))",
            padding: 32,
            minHeight: 320,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.9 }}>🛡️</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.8 }}>
            <div>36 条 Demo 路由 · 链上报价</div>
            <div>ALLOW / REJECT / FALLBACK</div>
            <div>Router 一笔 tx 完成 Vault + Swap</div>
          </div>
        </div>
      </div>
    </div>
  );
}

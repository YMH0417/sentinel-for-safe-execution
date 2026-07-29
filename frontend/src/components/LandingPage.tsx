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
    <div className="landing-hero">
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "56px 56px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 520,
          background: "radial-gradient(circle, rgba(0,255,136,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="landing-hero-inner">
        <div className="landing-grid">
          <div>
            <p className="landing-kicker">— DEFI SECURITY —</p>
            <h1 className="landing-title">SENTINEL</h1>
            <p className="landing-tagline">
              Don&apos;t trade <span style={{ color: "var(--green)" }}>naked</span>.
            </p>
            <p className="landing-desc">
              Every route analyzed. Every contract scored.
              <br />
              Agent 软规则 + Vault 硬约束，swap 前识别高风险路径。
            </p>

            {account ? (
              <button
                type="button"
                className="sentinel-btn sentinel-btn-primary landing-cta"
                onClick={() => navigate("/dashboard")}
              >
                进入仪表盘 →
              </button>
            ) : (
              <button
                type="button"
                className="sentinel-btn sentinel-btn-primary landing-cta"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                ⬡ {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
              </button>
            )}
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">🛡️</div>
            <div className="landing-feature-text">
              <div>36 条 Demo 路由 · 链上报价</div>
              <div>ALLOW / REJECT / FALLBACK</div>
              <div>Router 一笔 tx 完成 Vault + Swap</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

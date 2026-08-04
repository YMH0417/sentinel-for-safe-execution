import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import img from "../imgs/lock.svg"

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
        <div>
          <h1 className="landing-title">SENTINEL</h1>
          <p className="landing-kicker">-DeFi Security-</p>
          <div className="landing-tagline">
            <p>
              Don&apos;t trade naked.
            </p>
            <p>
              Every route analyzed.
            </p>
            <p>Every contract scored.</p>
          </div>

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
              {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          )}
        </div>

        <div>
          <img src={img} alt="" />
        </div>
    </div>
  );
}
